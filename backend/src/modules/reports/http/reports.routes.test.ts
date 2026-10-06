import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../infrastructure/database/database.js';
import { getDatabaseUrl } from '../../../infrastructure/database/config.js';
import { DrizzleReportRepository } from '../../../infrastructure/database/report-repository.drizzle.js';
import { buildApp } from '../../../app/build-app.js';
import type { ReportDto } from './report.dto.js';

const { database, pool } = createDatabase(getDatabaseUrl());
const app = buildApp(new DrizzleReportRepository(database), { logger: false });
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

  it('returns 404 for an unknown report id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/reports/00000000-0000-4000-8000-000000000000',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'REPORT_NOT_FOUND' });
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
