import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../infrastructure/database/database.js';
import { getDatabaseUrl } from '../../../infrastructure/database/config.js';
import { DrizzleReportRepository } from '../../../infrastructure/database/report-repository.drizzle.js';
import { DrizzleReportFeedbackRepository } from '../../../infrastructure/database/report-feedback-repository.drizzle.js';
import { buildApp } from '../../../app/build-app.js';
import type { ReportDto } from './report.dto.js';
import type { ReportFeedbackSummary, ReportFeedbackType } from '../domain/report-feedback.js';

const { database, pool } = createDatabase(getDatabaseUrl());
const app = buildApp(
  new DrizzleReportRepository(database),
  new DrizzleReportFeedbackRepository(database),
  { logger: false },
);
const createdIds: string[] = [];

const validReport = {
  type: 'POTHOLE',
  severity: 'HIGH',
  description: 'Bache grande',
  latitude: -34.6037,
  longitude: -58.3816,
} as const;

async function createReport(payload: unknown = validReport): Promise<ReportDto> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/reports',
    payload: payload as object,
  });
  expect(response.statusCode).toBe(201);
  const report = response.json<ReportDto>();
  createdIds.push(report.id);
  return report;
}

async function submitFeedback(
  reportId: string,
  voterId: string,
  type: ReportFeedbackType,
): Promise<ReportFeedbackSummary> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/reports/${reportId}/feedback`,
    headers: { 'x-voter-id': voterId },
    payload: { type },
  });
  expect(response.statusCode).toBe(200);
  return response.json<ReportFeedbackSummary>();
}

describe('reports API with PostgreSQL/PostGIS', () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await pool.query('DELETE FROM street_reports WHERE id = ANY($1::uuid[])', [createdIds]);
    }
    await app.close();
    await pool.end();
  });

  it('creates a report and returns a DTO with geographic coordinates', async () => {
    const report = await createReport();

    expect(report).toMatchObject({
      type: 'POTHOLE',
      severity: 'HIGH',
      description: 'Bache grande',
      location: { latitude: -34.6037, longitude: -58.3816 },
      status: 'ACTIVE',
    });
    expect(report.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new Date(report.createdAt).toISOString()).toBe(report.createdAt);
    expect(new Date(report.updatedAt).toISOString()).toBe(report.updatedAt);
  });

  it('allows creating a report without an optional description', async () => {
    const report = await createReport({
      type: 'POTHOLE',
      severity: 'MEDIUM',
      latitude: -34.6037,
      longitude: -58.3816,
    });

    expect(report.description).toBe('');
  });

  it('uses PostGIS to return only reports within the requested radius', async () => {
    const nearby = await createReport();
    const farAway = await createReport({
      ...validReport,
      description: 'Reporte lejano para prueba geográfica',
      latitude: -34.7037,
      longitude: -58.3816,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/reports?lat=-34.6037&lng=-58.3816&radius=1000',
    });

    expect(response.statusCode).toBe(200);
    const reports = response.json<ReportDto[]>();
    expect(reports.map((report) => report.id)).toContain(nearby.id);
    expect(reports.map((report) => report.id)).not.toContain(farAway.id);
  });

  it('returns reports inside the requested map viewport', async () => {
    const visibleReport = await createReport();
    const outsideReport = await createReport({
      ...validReport,
      description: 'Reporte fuera del viewport',
      latitude: -34.7,
      longitude: -58.3816,
    });
    const voterId = '40000000-0000-4000-8000-000000000001';
    await submitFeedback(visibleReport.id, voterId, 'CONFIRM');

    const response = await app.inject({
      method: 'GET',
      url: '/api/reports?south=-34.61&north=-34.59&west=-58.39&east=-58.37',
      headers: { 'x-voter-id': voterId },
    });

    expect(response.statusCode).toBe(200);
    const reports = response.json<ReportDto[]>();
    expect(reports.map((report) => report.id)).toContain(visibleReport.id);
    expect(reports.map((report) => report.id)).not.toContain(outsideReport.id);
    expect(reports.find((report) => report.id === visibleReport.id)?.feedback).toEqual({
      confirmations: 1,
      resolvedReports: 0,
      userFeedback: 'CONFIRM',
    });
  });

  it('rejects inverted viewport bounds', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/reports?south=-34.59&north=-34.61&west=-58.37&east=-58.39',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_BOUNDS' });
  });

  it('returns 404 for an unknown report id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/reports/00000000-0000-4000-8000-000000000000',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'REPORT_NOT_FOUND' });
  });

  it('creates feedback and updates an existing vote instead of duplicating it', async () => {
    const report = await createReport();
    const voterId = '10000000-0000-4000-8000-000000000001';

    const firstVote = await submitFeedback(report.id, voterId, 'CONFIRM');
    expect(firstVote).toEqual({ confirmations: 1, resolvedReports: 0, userFeedback: 'CONFIRM' });

    const repeatedVote = await submitFeedback(report.id, voterId, 'CONFIRM');
    expect(repeatedVote).toEqual({ confirmations: 1, resolvedReports: 0, userFeedback: 'CONFIRM' });

    const changedVote = await submitFeedback(report.id, voterId, 'RESOLVED');
    expect(changedVote).toEqual({ confirmations: 0, resolvedReports: 1, userFeedback: 'RESOLVED' });
  });

  it('returns community aggregates and the current session vote with a report', async () => {
    const report = await createReport();
    const voterIds = [
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
    ];
    await submitFeedback(report.id, voterIds[0]!, 'CONFIRM');
    await submitFeedback(report.id, voterIds[1]!, 'CONFIRM');
    await submitFeedback(report.id, voterIds[2]!, 'RESOLVED');

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports/${report.id}`,
      headers: { 'x-voter-id': voterIds[0]! },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<ReportDto>().feedback).toEqual({
      confirmations: 2,
      resolvedReports: 1,
      userFeedback: 'CONFIRM',
    });
  });

  it('returns 404 when submitting feedback for a nonexistent report', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/00000000-0000-4000-8000-000000000000/feedback',
      headers: { 'x-voter-id': '30000000-0000-4000-8000-000000000001' },
      payload: { type: 'CONFIRM' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'REPORT_NOT_FOUND' });
  });

  it('validates feedback type and voter session ID', async () => {
    const report = await createReport();
    const invalidVoter = await app.inject({
      method: 'POST',
      url: `/api/reports/${report.id}/feedback`,
      headers: { 'x-voter-id': 'not-a-uuid' },
      payload: { type: 'CONFIRM' },
    });
    const invalidType = await app.inject({
      method: 'POST',
      url: `/api/reports/${report.id}/feedback`,
      headers: { 'x-voter-id': '30000000-0000-4000-8000-000000000002' },
      payload: { type: 'LIKE' },
    });

    expect(invalidVoter.statusCode).toBe(400);
    expect(invalidType.statusCode).toBe(400);
  });

  it.each([
    { ...validReport, latitude: -91 },
    { ...validReport, longitude: 181 },
    { ...validReport, type: 'UNKNOWN' },
    { ...validReport, severity: 'URGENT' },
    { ...validReport, description: '   ' },
    { ...validReport, description: 'x'.repeat(501) },
  ])('rejects invalid report input', async (payload) => {
    const response = await app.inject({ method: 'POST', url: '/api/reports', payload });
    expect(response.statusCode).toBe(400);
  });

  it('updates a report status', async () => {
    const created = await createReport();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/reports/${created.id}/status`,
      payload: { status: 'RESOLVED' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<ReportDto>()).toMatchObject({ id: created.id, status: 'RESOLVED' });
  });
});
