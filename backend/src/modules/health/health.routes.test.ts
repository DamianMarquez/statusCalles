import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app/build-app.js';
import type { ReportRepository } from '../reports/application/report-repository.js';

const unusedReportRepository: ReportRepository = {
  create: async () => {
    throw new Error('Not used in this test.');
  },
  findNearby: async () => [],
  findInViewport: async () => [],
  findById: async () => null,
  updateStatus: async () => null,
};

describe('GET /api/health', () => {
  it('returns the service status', async () => {
    const app = buildApp(unusedReportRepository, { logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
