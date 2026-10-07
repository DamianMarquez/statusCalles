import Fastify, { type FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAnalyticsRoutes } from './analytics.routes.js';
import type { AnalyticsService } from '../application/analytics-service.js';

const methods = {
  overview: vi.fn(),
  reports: vi.fn(),
  neighborhoods: vi.fn(),
  communes: vi.fn(),
  trends: vi.fn(),
  heatmap: vi.fn(),
  streets: vi.fn(),
  segments: vi.fn(),
  moderationOverview: vi.fn(),
  adminOverview: vi.fn(),
  officialOverview: vi.fn(),
  proximity: vi.fn(),
};

let app: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  for (const method of Object.values(methods)) method.mockResolvedValue({ ok: true });
  app = Fastify({ logger: false });
  app.decorateRequest('authUser', null);
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const role = request.headers['x-test-role'];
    if (role === 'USER' || role === 'MODERATOR' || role === 'ADMIN') {
      request.authUser = {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'test@example.com',
        displayName: 'Test',
        role,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
    }
  });
  await registerAnalyticsRoutes(app, { service: methods as unknown as AnalyticsService });
});

afterEach(async () => {
  await app.close();
});

describe('analytics routes', () => {
  it('passes temporal and geographic filters into the analytics service', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/analytics/overview?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z&type=POTHOLE&severity=3&neighborhoodId=4&communeId=2',
    });
    expect(response.statusCode).toBe(200);
    expect(methods.overview).toHaveBeenCalledWith({
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-02-01T00:00:00.000Z'),
      type: 'POTHOLE',
      severity: 3,
      neighborhoodId: 4,
      communeId: 2,
    });
  });

  it('rejects invalid temporal ranges and enum filters', async () => {
    const range = await app.inject({
      method: 'GET',
      url: '/analytics/trends?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z',
    });
    const type = await app.inject({ method: 'GET', url: '/analytics/reports?type=DROP_TABLE' });
    expect(range.statusCode).toBe(400);
    expect(type.statusCode).toBe(400);
    expect(methods.trends).not.toHaveBeenCalled();
    expect(methods.reports).not.toHaveBeenCalled();
  });

  it('requires bounds for heatmap and validates the area size', async () => {
    const missing = await app.inject({ method: 'GET', url: '/analytics/heatmap' });
    const oversized = await app.inject({
      method: 'GET',
      url: '/analytics/heatmap?south=-35&north=-33&west=-59&east=-58',
    });
    expect(missing.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(400);
    expect(methods.heatmap).not.toHaveBeenCalled();
  });

  it('keeps moderation and administrator analytics behind role checks', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/analytics/moderation/overview' })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/analytics/moderation/overview',
          headers: { 'x-test-role': 'USER' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/analytics/moderation/overview',
          headers: { 'x-test-role': 'MODERATOR' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/analytics/admin/overview',
          headers: { 'x-test-role': 'MODERATOR' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/analytics/admin/overview',
          headers: { 'x-test-role': 'ADMIN' },
        })
      ).statusCode,
    ).toBe(200);
    expect(methods.moderationOverview).toHaveBeenCalledTimes(1);
    expect(methods.adminOverview).toHaveBeenCalledTimes(1);
  });

  it('returns official data aggregates without exposing them as administrator-only data', async () => {
    const response = await app.inject({ method: 'GET', url: '/analytics/official' });
    expect(response.statusCode).toBe(200);
    expect(methods.officialOverview).toHaveBeenCalledOnce();
  });

  it('validates and passes proximity as a bounded point radius request', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: '/analytics/proximity?lat=-34.6&lng=-58.4',
    });
    const response = await app.inject({
      method: 'GET',
      url: '/analytics/proximity?lat=-34.6&lng=-58.4&radius=500',
    });
    expect(missing.statusCode).toBe(400);
    expect(response.statusCode).toBe(200);
    expect(methods.proximity).toHaveBeenCalledWith(
      {},
      { latitude: -34.6, longitude: -58.4, radiusMeters: 500 },
    );
  });
});
