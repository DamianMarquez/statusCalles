import { describe, expect, it } from 'vitest';
import { emptyReportFeedbackSummary } from '../../reports/domain/report-feedback.js';
import type { StreetReport } from '../../reports/domain/street-report.js';
import { StreetScoreCalculator, type StreetScoreInput } from './street-score-calculator.js';

const calculator = new StreetScoreCalculator();
const asOf = new Date('2026-10-06T12:00:00.000Z');

function input(
  severity: StreetReport['severity'],
  options: {
    ageDays?: number;
    latitude?: number;
    longitude?: number;
    status?: StreetReport['status'];
    confirmations?: number;
    resolvedVotes?: number;
    weightedConfirmations?: number;
    weightedResolvedReports?: number;
  } = {},
): StreetScoreInput {
  const createdAt = new Date(asOf.getTime() - (options.ageDays ?? 0) * 86_400_000);
  return {
    report: {
      id: `${severity}-${options.ageDays ?? 0}-${options.latitude ?? -34.6}-${options.longitude ?? -58.38}`,
      type: 'POTHOLE',
      severity,
      description: '',
      location: {
        latitude: options.latitude ?? -34.6,
        longitude: options.longitude ?? -58.38,
      },
      status: options.status ?? 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    feedback: {
      ...emptyReportFeedbackSummary,
      confirmations: options.confirmations ?? 0,
      resolvedReports: options.resolvedVotes ?? 0,
      weightedConfirmations: options.weightedConfirmations ?? 0,
      weightedResolvedReports: options.weightedResolvedReports ?? 0,
    },
  };
}

describe('StreetScoreCalculator', () => {
  it('returns no score when there is not enough report evidence', () => {
    expect(calculator.calculate([], asOf)).toEqual([]);
    expect(calculator.calculate([input('LOW')], asOf)).toEqual([]);
  });

  it('penalizes a single mild issue less than severe clustered reports', () => {
    const mild = calculator.calculate([input('LOW'), input('LOW')], asOf)[0]!;
    const severe = calculator.calculate([input('CRITICAL'), input('HIGH')], asOf)[0]!;
    expect(mild.score).toBeGreaterThan(severe.score);
    expect(severe.reasons.highSeverityReports).toBe(2);
  });

  it('reduces the impact of old reports using the freshness half-life', () => {
    const recent = calculator.calculate([input('HIGH'), input('HIGH')], asOf)[0]!;
    const aging = calculator.calculate(
      [input('HIGH', { ageDays: 20 }), input('HIGH', { ageDays: 20, longitude: -58.379 })],
      asOf,
    )[0]!;
    const stale = calculator.calculate(
      [input('HIGH', { ageDays: 40 }), input('HIGH', { ageDays: 40, longitude: -58.379 })],
      asOf,
    );
    expect(aging.score).toBeGreaterThan(recent.score);
    expect(stale).toEqual([]);
    expect(recent.score).toBeLessThan(100);
  });

  it('does not let resolved reports reduce the score and reports them as historical context', () => {
    const area = calculator.calculate(
      [
        input('CRITICAL', { status: 'RESOLVED' }),
        input('LOW'),
        input('LOW', { longitude: -58.379 }),
      ],
      asOf,
    )[0]!;
    expect(area.score).toBeLessThan(100);
    expect(area.reasons.resolvedReports).toBe(1);
    expect(area.reasons.activeReports).toBe(2);
  });

  it('shows a lower score when active reports have more weighted confirmations', () => {
    const plain = calculator.calculate(
      [input('HIGH'), input('HIGH', { longitude: -58.379 })],
      asOf,
    )[0]!;
    const confirmed = calculator.calculate(
      [
        input('HIGH', { confirmations: 8, weightedConfirmations: 8 }),
        input('HIGH', { longitude: -58.379, confirmations: 8, weightedConfirmations: 8 }),
      ],
      asOf,
    )[0]!;
    expect(confirmed.score).toBeLessThan(plain.score);
    expect(confirmed.reasons.confirmations).toBe(16);
  });

  it('lets resolution feedback reduce a report penalty', () => {
    const plain = calculator.calculate(
      [input('HIGH'), input('HIGH', { longitude: -58.379 })],
      asOf,
    )[0]!;
    const resolvedVotes = calculator.calculate(
      [
        input('HIGH', { resolvedVotes: 4, weightedResolvedReports: 4 }),
        input('HIGH', { longitude: -58.379, resolvedVotes: 4, weightedResolvedReports: 4 }),
      ],
      asOf,
    )[0]!;
    expect(resolvedVotes.score).toBeGreaterThan(plain.score);
  });

  it('keeps separate geographic concentrations in separate areas', () => {
    expect(
      calculator.calculate(
        [input('LOW'), input('LOW', { longitude: -58.379 }), input('HIGH', { longitude: -58.3 })],
        asOf,
      ),
    ).toHaveLength(1);
  });
});
