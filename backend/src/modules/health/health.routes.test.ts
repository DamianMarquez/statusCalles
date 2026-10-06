import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app/build-app.js';
import type { ReportRepository } from '../reports/application/report-repository.js';
import type { ReportFeedbackRepository } from '../reports/application/report-feedback-repository.js';

const unusedReportRepository: ReportRepository = {
  create: async () => {
    throw new Error('Not used in this test.');
  },
  findNearby: async () => [],
  findInViewport: async () => [],
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
    await app.close();
  });
});
