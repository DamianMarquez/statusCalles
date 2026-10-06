import { describe, expect, it } from 'vitest';
import { emptyReportFeedbackSummary } from './report-feedback.js';
import { ReportFreshnessPolicy } from './report-freshness-policy.js';
import type { StreetReport } from './street-report.js';

const policy = new ReportFreshnessPolicy();
const evaluatedAt = new Date('2026-10-06T12:00:00.000Z');

function makeReport(createdAt: string, status: StreetReport['status'] = 'ACTIVE'): StreetReport {
  const created = new Date(createdAt);
  return {
    id: 'report-1',
    type: 'POTHOLE',
    severity: 'HIGH',
    description: '',
    location: { latitude: -34.6037, longitude: -58.3816 },
    status,
    createdAt: created,
    updatedAt: created,
  };
}

describe('ReportFreshnessPolicy', () => {
  it('marks a recent report fresh and active', () => {
    const result = policy.evaluate(
      makeReport('2026-10-06T11:50:00.000Z'),
      emptyReportFeedbackSummary,
      evaluatedAt,
    );

    expect(result.status).toBe('ACTIVE');
    expect(result.freshness.level).toBe('FRESH');
  });

  it('marks an old report stale without deleting its history', () => {
    const result = policy.evaluate(
      makeReport('2026-02-06T12:00:00.000Z'),
      emptyReportFeedbackSummary,
      evaluatedAt,
    );

    expect(result.status).toBe('STALE');
    expect(result.freshness.level).toBe('STALE');
    expect(result.freshness.confidence).toBe(0);
  });

  it('keeps resolved reports resolved and visually distinct', () => {
    const result = policy.evaluate(
      makeReport('2026-10-06T11:50:00.000Z', 'RESOLVED'),
      emptyReportFeedbackSummary,
      evaluatedAt,
    );

    expect(result.status).toBe('RESOLVED');
    expect(result.freshness.level).toBe('RESOLVED');
    expect(result.freshness.confidence).toBe(0);
  });

  it('gives recent confirmations more weight than old confirmations', () => {
    const recentWeight = policy.confirmationWeight(
      new Date('2026-10-05T12:00:00.000Z'),
      evaluatedAt,
    );
    const oldWeight = policy.confirmationWeight(new Date('2026-06-06T12:00:00.000Z'), evaluatedAt);
    const report = makeReport('2026-02-06T12:00:00.000Z');
    const recentResult = policy.evaluate(
      report,
      {
        ...emptyReportFeedbackSummary,
        weightedConfirmations: recentWeight,
        latestConfirmationAt: new Date('2026-10-05T12:00:00.000Z'),
      },
      evaluatedAt,
    );
    const oldResult = policy.evaluate(
      report,
      {
        ...emptyReportFeedbackSummary,
        weightedConfirmations: oldWeight,
        latestConfirmationAt: new Date('2026-06-06T12:00:00.000Z'),
      },
      evaluatedAt,
    );

    expect(recentResult.freshness.confidence).toBeGreaterThan(oldResult.freshness.confidence);
    expect(recentResult.status).toBe('ACTIVE');
    expect(oldResult.status).toBe('STALE');
  });

  it('transitions stale reports back to active on a new confirmation but never reopens resolved reports', () => {
    const staleReport = makeReport('2026-02-06T12:00:00.000Z', 'STALE');
    const newConfirmation = {
      ...emptyReportFeedbackSummary,
      weightedConfirmations: 1,
      latestConfirmationAt: evaluatedAt,
    };
    const reopened = policy.evaluate(staleReport, newConfirmation, evaluatedAt);
    const resolved = policy.evaluate(
      { ...staleReport, status: 'RESOLVED' },
      newConfirmation,
      evaluatedAt,
    );

    expect(reopened.status).toBe('ACTIVE');
    expect(reopened.freshness.level).toBe('FRESH');
    expect(resolved.status).toBe('RESOLVED');
  });
});
