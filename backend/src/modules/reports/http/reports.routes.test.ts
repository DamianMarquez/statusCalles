import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../infrastructure/database/database.js';
import { getTestDatabaseUrl } from '../../../infrastructure/database/config.js';
import { DrizzleReportRepository } from '../../../infrastructure/database/report-repository.drizzle.js';
import { DrizzleReportFeedbackRepository } from '../../../infrastructure/database/report-feedback-repository.drizzle.js';
import { buildApp } from '../../../app/build-app.js';
import { DrizzleStreetScoreRepository } from '../../../infrastructure/database/street-score-repository.drizzle.js';
import { DrizzleAuthRepository } from '../../../infrastructure/database/auth-repository.drizzle.js';
import { DrizzleStreetCatalogRepository } from '../../../infrastructure/database/street-catalog-repository.drizzle.js';
import type { ReportDto } from './report.dto.js';
import type { ReportFeedbackType } from '../domain/report-feedback.js';
import { randomUUID } from 'node:crypto';

process.env.RATE_LIMIT_REPORTS_MAX = '500';

const { database, pool } = createDatabase(getTestDatabaseUrl());
const app = buildApp(
  new DrizzleReportRepository(database),
  new DrizzleReportFeedbackRepository(database),
  {
    logger: false,
    streetScoreRepository: new DrizzleStreetScoreRepository(database),
    authRepository: new DrizzleAuthRepository(database),
    moderationDatabase: database,
    streetCatalogRepository: new DrizzleStreetCatalogRepository(database),
  },
);
const createdIds: string[] = [];
const testUsers: { id: string; email: string; cookie: string }[] = [];

async function registerTestUser(index: number) {
  const email = `report-test-${index}-${randomUUID()}@example.com`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      displayName: `Report tester ${index}`,
      password: 'street-status-password-2026',
    },
  });
  expect(response.statusCode).toBe(201);
  const rawCookie = response.headers['set-cookie'];
  const cookie = (Array.isArray(rawCookie) ? rawCookie[0] : rawCookie)?.split(';')[0];
  if (!cookie) throw new Error('Registration response did not set the session cookie.');
  const user = response.json<{ user: { id: string } }>().user;
  expect(response.json()).not.toHaveProperty('passwordHash');
  expect(response.json()).not.toHaveProperty('token');
  testUsers.push({ id: user.id, email, cookie });
  return testUsers.at(-1)!;
}

const validReport = {
  type: 'POTHOLE',
  severity: 'HIGH',
  description: 'Bache grande',
  latitude: -34.6037,
  longitude: -58.3816,
} as const;

async function createReport(payload: unknown = validReport, cookie?: string): Promise<ReportDto> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/reports',
    payload: { ...(payload as object), allowSimilar: true },
    headers: cookie ? { cookie } : undefined,
  });
  expect(response.statusCode).toBe(201);
  const report = response.json<ReportDto>();
  createdIds.push(report.id);
  return report;
}

async function submitFeedback(
  reportId: string,
  cookie: string,
  type: ReportFeedbackType,
): Promise<ReportDto['feedback']> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/reports/${reportId}/feedback`,
    headers: { cookie },
    payload: { type },
  });
  expect(response.statusCode).toBe(200);
  return response.json<ReportDto>().feedback;
}

describe('reports API with PostgreSQL/PostGIS', () => {
  beforeAll(async () => {
    await app.ready();
    await registerTestUser(1);
    await registerTestUser(2);
    await registerTestUser(3);
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await pool.query('DELETE FROM moderation_audit WHERE report_id = ANY($1::uuid[])', [
        createdIds,
      ]);
      await pool.query('DELETE FROM street_reports WHERE id = ANY($1::uuid[])', [createdIds]);
    }
    if (testUsers.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        testUsers.map((user) => user.id),
      ]);
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

  it('warns about nearby same-type reports and accepts an explicit override', async () => {
    await createReport({ ...validReport, latitude: -34.6041, longitude: -58.3818 });
    const response = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: { ...validReport, latitude: -34.6041, longitude: -58.3818 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'SIMILAR_REPORT_EXISTS',
      message: 'Ya existe un reporte similar cerca de esta ubicación.',
      similarReport: { distanceMeters: 0 },
    });

    const override = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: { ...validReport, latitude: -34.6041, longitude: -58.3818, allowSimilar: true },
    });
    expect(override.statusCode).toBe(201);
    createdIds.push(override.json<ReportDto>().id);
  });

  it('accepts one abuse flag per account and protects admin moderation with role checks', async () => {
    const report = await createReport();
    const user = testUsers[0]!;
    const flag = await app.inject({
      method: 'POST',
      url: `/api/reports/${report.id}/flags`,
      headers: { cookie: user.cookie },
      payload: { reason: 'SPAM' },
    });
    expect(flag.statusCode).toBe(201);
    const repeated = await app.inject({
      method: 'POST',
      url: `/api/reports/${report.id}/flags`,
      headers: { cookie: user.cookie },
      payload: { reason: 'SPAM' },
    });
    expect(repeated.statusCode).toBe(409);

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/reports',
      headers: { cookie: user.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
    const admin = testUsers[2]!;
    await pool.query("UPDATE users SET role = 'ADMIN' WHERE id = $1", [admin.id]);
    const queue = await app.inject({
      method: 'GET',
      url: '/api/admin/reports',
      headers: { cookie: admin.cookie },
    });
    expect(queue.statusCode).toBe(200);
    expect(
      queue.json<Array<{ id: string; flag_count: number }>>().some((item) => item.id === report.id),
    ).toBe(true);

    const hidden = await app.inject({
      method: 'PATCH',
      url: `/api/admin/reports/${report.id}/moderation`,
      headers: { cookie: admin.cookie },
      payload: { status: 'HIDDEN', note: 'Contenido denunciado para revisión.' },
    });
    expect(hidden.statusCode).toBe(200);
    const noLongerPublic = await app.inject({ method: 'GET', url: `/api/reports/${report.id}` });
    expect(noLongerPublic.statusCode).toBe(404);
    const audit = await pool.query('SELECT * FROM moderation_audit WHERE report_id = $1', [
      report.id,
    ]);
    expect(audit.rowCount).toBe(1);
    await pool.query("UPDATE users SET role = 'USER' WHERE id = $1", [admin.id]);
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
    const reports = response.json<{ items: ReportDto[]; hasMore: boolean }>().items;
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
    const voter = testUsers[0]!;
    await submitFeedback(visibleReport.id, voter.cookie, 'CONFIRM');

    const response = await app.inject({
      method: 'GET',
      url: '/api/reports?south=-34.61&north=-34.59&west=-58.39&east=-58.37',
      headers: { cookie: voter.cookie },
    });

    expect(response.statusCode).toBe(200);
    const reports = response.json<{ items: ReportDto[]; hasMore: boolean }>().items;
    expect(reports.map((report) => report.id)).toContain(visibleReport.id);
    expect(reports.map((report) => report.id)).not.toContain(outsideReport.id);
    expect(reports.find((report) => report.id === visibleReport.id)?.feedback).toEqual({
      confirmations: 1,
      resolvedReports: 0,
      userFeedback: 'CONFIRM',
    });
  });

  it('combines multiple types, lifecycle status, severity, and server-relative time filters', async () => {
    const fromDate = new Date(Date.now() - 86_400_000).toISOString();
    const toDate = new Date(Date.now() + 86_400_000).toISOString();
    const pothole = await createReport({ ...validReport, description: 'Filtro bache uno' });
    const flood = await createReport({
      ...validReport,
      type: 'FLOOD',
      description: 'Filtro inundación',
      latitude: -34.6039,
    });
    await createReport({
      ...validReport,
      type: 'ROAD_WORK',
      description: 'Filtro obra',
      latitude: -34.6041,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports?south=-34.61&north=-34.59&west=-58.39&east=-58.37&types=POTHOLE,FLOOD&statuses=ACTIVE&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&minSeverity=HIGH`,
    });
    expect(response.statusCode).toBe(200);
    const page = response.json<{ items: ReportDto[]; hasMore: boolean }>();
    expect(page.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([pothole.id, flood.id]),
    );
    expect(page.items.some((item) => item.type === 'ROAD_WORK')).toBe(false);
    expect(page.items.every((item) => item.status === 'ACTIVE')).toBe(true);
    expect(page.hasMore).toBe(false);
  });

  it('validates report filter enums and date ranges', async () => {
    const base = '/api/reports?south=-34.61&north=-34.59&west=-58.39&east=-58.37';
    for (const suffix of [
      '&types=DROP_TABLE',
      '&statuses=REJECTED',
      '&fromDate=not-a-date',
      '&fromDate=2026-10-05T00%3A00%3A00.000Z&toDate=2026-10-01T00%3A00%3A00.000Z',
      '&period=7d&fromDate=2026-10-01T00%3A00%3A00.000Z',
    ]) {
      const response = await app.inject({ method: 'GET', url: `${base}${suffix}` });
      expect(response.statusCode).toBe(400);
    }
  });

  it('limits map results and returns hasMore without an unbounded marker payload', async () => {
    await createReport({ ...validReport, description: 'Paginación uno' });
    await createReport({ ...validReport, description: 'Paginación dos', latitude: -34.6041 });
    const response = await app.inject({
      method: 'GET',
      url: '/api/reports?south=-34.61&north=-34.59&west=-58.39&east=-58.37&limit=1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: ReportDto[]; hasMore: boolean }>()).toMatchObject({
      items: expect.any(Array),
      hasMore: true,
    });
    expect(response.json<{ items: ReportDto[] }>().items).toHaveLength(1);
  });

  it('restricts onlyMine to the authenticated session and exposes an owner report list', async () => {
    const owner = testUsers[0]!;
    const other = testUsers[1]!;
    const ownReport = await createReport(
      { ...validReport, description: 'Privado del propietario' },
      owner.cookie,
    );
    const otherReport = await createReport(
      { ...validReport, description: 'Privado de otra cuenta', latitude: -34.6041 },
      other.cookie,
    );

    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/reports?south=-34.61&north=-34.59&west=-58.39&east=-58.37&onlyMine=true',
    });
    expect(unauthenticated.statusCode).toBe(401);
    const mapPage = await app.inject({
      method: 'GET',
      url: '/api/reports?south=-34.61&north=-34.59&west=-58.39&east=-58.37&onlyMine=true',
      headers: { cookie: owner.cookie },
    });
    expect(mapPage.statusCode).toBe(200);
    const mappedIds = mapPage.json<{ items: ReportDto[] }>().items.map((item) => item.id);
    expect(mappedIds).toContain(ownReport.id);
    expect(mappedIds).not.toContain(otherReport.id);

    const mine = await app.inject({
      method: 'GET',
      url: '/api/users/me/reports',
      headers: { cookie: owner.cookie },
    });
    expect(mine.statusCode).toBe(200);
    const ownItems = mine.json<{ items: Array<ReportDto & { feedbackCount: number }> }>().items;
    expect(ownItems.map((item) => item.id)).toContain(ownReport.id);
    expect(ownItems.map((item) => item.id)).not.toContain(otherReport.id);
    expect(ownItems.find((item) => item.id === ownReport.id)).toMatchObject({
      publiclyVisible: true,
      feedbackCount: 0,
    });

    const impersonation = await app.inject({
      method: 'GET',
      url: `/api/users/me/reports?userId=${other.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(impersonation.statusCode).toBe(200);
    expect(impersonation.json<{ items: ReportDto[] }>().items.map((item) => item.id)).toContain(
      ownReport.id,
    );
    expect(impersonation.json<{ items: ReportDto[] }>().items.map((item) => item.id)).not.toContain(
      otherReport.id,
    );

    const admin = testUsers[2]!;
    await pool.query("UPDATE users SET role = 'ADMIN' WHERE id = $1", [admin.id]);
    const hide = await app.inject({
      method: 'PATCH',
      url: `/api/admin/reports/${ownReport.id}/moderation`,
      headers: { cookie: admin.cookie },
      payload: { status: 'HIDDEN', note: 'Ocultado en prueba de privacidad.' },
    });
    expect(hide.statusCode).toBe(200);
    const publicPage = await app.inject({
      method: 'GET',
      url: '/api/reports?south=-34.61&north=-34.59&west=-58.39&east=-58.37',
    });
    expect(publicPage.json<{ items: ReportDto[] }>().items.map((item) => item.id)).not.toContain(
      ownReport.id,
    );
    const privateMapPage = await app.inject({
      method: 'GET',
      url: '/api/reports?south=-34.61&north=-34.59&west=-58.39&east=-58.37&onlyMine=true',
      headers: { cookie: owner.cookie },
    });
    expect(
      privateMapPage
        .json<{ items: Array<ReportDto & { publiclyVisible: boolean }> }>()
        .items.find((item) => item.id === ownReport.id),
    ).toMatchObject({ publiclyVisible: false });
    await pool.query("UPDATE users SET role = 'USER' WHERE id = $1", [admin.id]);
  });

  it('associates a report with an official street when a nearby segment is within tolerance', async () => {
    const report = await createReport({
      ...validReport,
      description: 'Reporte sobre un tramo oficial',
      latitude: -34.53451590464167,
      longitude: -58.462187566063186,
    });
    expect(report.street).toMatchObject({
      officialName: 'CANTILO, INT.',
      neighborhoodName: 'Nuñez',
      communeName: 'Comuna 13',
    });
    const score = await app.inject({
      method: 'GET',
      url: `/api/streets/${report.street!.id}/score`,
    });
    const explanation = await app.inject({
      method: 'GET',
      url: `/api/streets/${report.street!.id}/score/explanation`,
    });
    expect(score.statusCode).toBe(200);
    expect(score.json()).toMatchObject({
      id: report.street!.id,
      targetType: 'STREET',
      officialName: 'CANTILO, INT.',
      score: expect.any(Number),
      level: expect.any(String),
      confidence: expect.any(String),
      factors: expect.arrayContaining([
        expect.objectContaining({ source: 'SYSTEM', code: 'NEUTRAL_BASELINE' }),
        expect.objectContaining({ source: 'COMMUNITY', code: 'REPORT_SEVERITY' }),
      ]),
      segments: expect.any(Array),
    });
    expect(explanation.json()).toMatchObject({
      score: score.json().score,
      factors: score.json().factors,
      metrics: score.json().metrics,
    });
  });

  it('keeps valid reports unassociated when there is no nearby official street', async () => {
    const report = await createReport({
      ...validReport,
      description: 'Reporte fuera de la red oficial',
      latitude: 0,
      longitude: 0,
    });
    expect(report.street).toBeNull();
  });

  it('serves official streets, neighborhoods, communes, and nearby reports by street', async () => {
    const nearby = await app.inject({
      method: 'GET',
      url: '/api/streets/nearby?lat=-34.5345159046&lng=-58.4621875661&radius=150',
    });
    expect(nearby.statusCode).toBe(200);
    const street = nearby
      .json<Array<{ id: string; officialName: string }>>()
      .find((item) => item.officialName === 'CANTILO, INT.');
    expect(street).toBeDefined();
    const detail = await app.inject({ method: 'GET', url: `/api/streets/${street!.id}` });
    expect(detail.json()).toMatchObject({
      officialName: 'CANTILO, INT.',
      neighborhoods: expect.arrayContaining(['Nuñez']),
      communes: ['Comuna 13'],
    });
    const associatedReport = await createReport({
      ...validReport,
      latitude: -34.53451590464167,
      longitude: -58.462187566063186,
    });
    const reports = await app.inject({ method: 'GET', url: `/api/streets/${street!.id}/reports` });
    expect(reports.json<ReportDto[]>().map((item) => item.id)).toContain(associatedReport.id);
    const neighborhoods = await app.inject({ method: 'GET', url: '/api/neighborhoods' });
    const communes = await app.inject({ method: 'GET', url: '/api/communes' });
    expect(neighborhoods.json<unknown[]>()).toHaveLength(48);
    expect(communes.json<unknown[]>()).toHaveLength(15);
  });

  it('validates nearby search bounds and returns 404 for an unknown official street', async () => {
    const invalidNearby = await app.inject({
      method: 'GET',
      url: '/api/streets/nearby?lat=-34.6&lng=-58.4&radius=6000',
    });
    const unknownStreet = await app.inject({
      method: 'GET',
      url: '/api/streets/00000000-0000-4000-8000-000000000001',
    });
    expect(invalidNearby.statusCode).toBe(400);
    expect(unknownStreet.statusCode).toBe(404);
  });

  it('rejects inverted viewport bounds', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/reports?south=-34.59&north=-34.61&west=-58.37&east=-58.39',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_BOUNDS' });
  });

  it('returns condition features as GeoJSON from official street geometry', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/streets/condition?south=-34.61&north=-34.59&west=-58.39&east=-58.37&zoom=16',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      type: 'FeatureCollection',
      features: expect.any(Array),
    });
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
    const cookie = testUsers[0]!.cookie;

    const firstVote = await submitFeedback(report.id, cookie, 'CONFIRM');
    expect(firstVote).toEqual({ confirmations: 1, resolvedReports: 0, userFeedback: 'CONFIRM' });
    const storedVote = await pool.query(
      'SELECT user_id, voter_id FROM report_feedback WHERE report_id = $1',
      [report.id],
    );
    expect(storedVote.rows[0]).toEqual({ user_id: testUsers[0]!.id, voter_id: null });

    const repeatedVote = await submitFeedback(report.id, cookie, 'CONFIRM');
    expect(repeatedVote).toEqual({ confirmations: 1, resolvedReports: 0, userFeedback: 'CONFIRM' });

    const changedVote = await submitFeedback(report.id, cookie, 'RESOLVED');
    expect(changedVote).toEqual({ confirmations: 0, resolvedReports: 1, userFeedback: 'RESOLVED' });
  });

  it('returns community aggregates and the current session vote with a report', async () => {
    const report = await createReport();
    await submitFeedback(report.id, testUsers[0]!.cookie, 'CONFIRM');
    await submitFeedback(report.id, testUsers[1]!.cookie, 'CONFIRM');
    await submitFeedback(report.id, testUsers[2]!.cookie, 'RESOLVED');

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports/${report.id}`,
      headers: { cookie: testUsers[0]!.cookie },
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
      headers: { cookie: testUsers[0]!.cookie },
      payload: { type: 'CONFIRM' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'REPORT_NOT_FOUND' });
  });

  it('requires an account for feedback and validates the feedback type', async () => {
    const report = await createReport();
    const anonymous = await app.inject({
      method: 'POST',
      url: `/api/reports/${report.id}/feedback`,
      headers: {},
      payload: { type: 'CONFIRM' },
    });
    const invalidType = await app.inject({
      method: 'POST',
      url: `/api/reports/${report.id}/feedback`,
      headers: { cookie: testUsers[0]!.cookie },
      payload: { type: 'LIKE' },
    });

    expect(anonymous.statusCode).toBe(401);
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
    const owner = testUsers[0]!;
    const created = await createReport(validReport, owner.cookie);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/reports/${created.id}/status`,
      headers: { cookie: owner.cookie },
      payload: { status: 'RESOLVED' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<ReportDto>()).toMatchObject({ id: created.id, status: 'RESOLVED' });
  });

  it('prevents an unrelated account from changing a report status', async () => {
    const owner = testUsers[0]!;
    const report = await createReport(validReport, owner.cookie);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/reports/${report.id}/status`,
      headers: { cookie: testUsers[1]!.cookie },
      payload: { status: 'RESOLVED' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('associates authenticated report creation with its account', async () => {
    const author = testUsers[1]!;
    const report = await createReport(validReport, author.cookie);
    const result = await pool.query('SELECT user_id FROM street_reports WHERE id = $1', [
      report.id,
    ]);
    expect(result.rows[0]?.user_id).toBe(author.id);
  });

  it('logs in with a correct password and rejects an incorrect password', async () => {
    const user = testUsers[0]!;
    const valid = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'street-status-password-2026' },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).not.toHaveProperty('passwordHash');
    expect(valid.json()).not.toHaveProperty('token');
    const setCookie = valid.headers['set-cookie'];
    const cookieValue = Array.isArray(setCookie) ? setCookie[0]! : setCookie!;
    expect(cookieValue).toContain('HttpOnly');
    expect(cookieValue).toContain('SameSite=Lax');
    expect(cookieValue).toContain('Path=/api');

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'incorrect-password-2026' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const untrustedOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://attacker.example' },
      payload: { email: user.email, password: 'street-status-password-2026' },
    });
    expect(untrustedOrigin.statusCode).toBe(403);
  });

  it('registers an account with a protected session cookie', async () => {
    const user = await registerTestUser(4);
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(user.cookie).toContain('street_status_session=');
    expect(user.cookie).not.toContain('Secure'); // Secure is enabled only in production.
  });

  it('stores only a password hash and rejects registering the same email again', async () => {
    const user = testUsers[1]!;
    const stored = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    expect(stored.rows[0]?.password_hash).not.toBe('street-status-password-2026');
    expect(stored.rows[0]?.password_hash).toMatch(/^scrypt\$32768\$8\$1\$/);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: user.email.toUpperCase(),
        displayName: 'Duplicate account',
        password: 'another-long-password-2026',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.body).not.toContain('password');
  });

  it('returns profile statistics to a session and revokes the session at logout', async () => {
    const user = testUsers[2]!;
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: user.cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json<{ user: { id: string } }>().user.id).toBe(user.id);

    const profile = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { cookie: user.cookie },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({
      id: user.id,
      displayName: 'Report tester 3',
      createdAt: expect.any(String),
      reportCount: expect.any(Number),
      confirmationsGiven: expect.any(Number),
      reputation: {
        confirmedReports: expect.any(Number),
        resolvedReports: expect.any(Number),
        usefulFeedback: expect.any(Number),
      },
    });

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: user.cookie },
    });
    expect(logout.statusCode).toBe(200);
    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: user.cookie },
    });
    expect(afterLogout.json()).toEqual({ user: null });
  });

  it('rejects protected profile and status access without a session', async () => {
    const report = await createReport();
    const profile = await app.inject({ method: 'GET', url: '/api/users/me' });
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/reports/${report.id}/status`,
      payload: { status: 'RESOLVED' },
    });
    expect(profile.statusCode).toBe(401);
    expect(update.statusCode).toBe(401);
  });
});
