import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app/build-app.js';
import type { ReportRepository } from '../reports/application/report-repository.js';
import type { ReportFeedbackRepository } from '../reports/application/report-feedback-repository.js';

const unusedReportRepository: ReportRepository = {
  create: async () => {
    throw new Error('Not used in this test.');
  },
  findNearby: async () => [],
  findInViewport: async () => ({ items: [], hasMore: false }),
  findMine: async () => ({ items: [], hasMore: false }),
  findSimilar: async () => null,
  findById: async () => null,
  findByStreetId: async () => [],
  isOwner: async () => false,
  updateStatus: async () => null,
};

const unusedFeedbackRepository: ReportFeedbackRepository = {
  submit: async () => null,
  summariesForReports: async () => new Map(),
};

describe('GET /api/health', () => {
  it('returns the service status', async () => {
    const app = buildApp(unusedReportRepository, unusedFeedbackRepository, { logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });

    const removedRoutingEndpoint = await app.inject({
      method: 'POST',
      url: '/api/routing',
      payload: {},
    });
    expect(removedRoutingEndpoint.statusCode).toBe(404);
    await app.close();
  });

  it('reports readiness only when the database check succeeds', async () => {
    const app = buildApp(unusedReportRepository, unusedFeedbackRepository, {
      logger: false,
      checkDatabase: async () => undefined,
    });
    const response = await app.inject({ method: 'GET', url: '/api/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'ok' });
    await app.close();
  });

  it('keeps liveness healthy and reports readiness unavailable when the database is down', async () => {
    const app = buildApp(unusedReportRepository, unusedFeedbackRepository, {
      logger: false,
      checkDatabase: async () => {
        throw new Error('database unavailable');
      },
    });

    const live = await app.inject({ method: 'GET', url: '/api/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });

    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: 'unavailable', database: 'unavailable' });
    await app.close();
  });
});
