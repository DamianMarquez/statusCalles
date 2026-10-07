import { describe, expect, it } from 'vitest';
import { emptyReportFeedbackSummary } from '../../reports/domain/report-feedback.js';
import type { StreetReport } from '../../reports/domain/street-report.js';
import { StreetScoreCalculator, type StreetScoreInput } from './street-score-calculator.js';

const calculator = new StreetScoreCalculator();
const asOf = new Date('2026-10-06T12:00:00.000Z');
let idSequence = 0;

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
    actorId?: string | null;
  } = {},
): StreetScoreInput {
  const createdAt = new Date(asOf.getTime() - (options.ageDays ?? 0) * 86_400_000);
  return {
    report: {
      id: `report-${++idSequence}`,
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
    actorId: options.actorId,
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

  it('returns a neutral score with low confidence and no data for an unreported segment', () => {
    const result = calculator.calculateSegment({
      targetId: 'segment-1',
      reports: [],
      calculatedAt: asOf,
    });
    expect(result).toMatchObject({ score: 75, level: 'FAIR', confidence: 'LOW' });
    expect(result.factors[0]).toMatchObject({
      source: 'SYSTEM',
      impact: 75,
      code: 'NEUTRAL_BASELINE',
    });
    expect(result.metrics.activeReports).toBe(0);
    expect(result.sourceStatus).toEqual({
      community: 'AVAILABLE',
      officialIncidents: 'UNAVAILABLE',
      traffic: 'UNAVAILABLE',
    });
  });

  it('shows severity and recency as separate deterministic factors', () => {
    const low = calculator.calculateSegment({
      targetId: 'segment-low',
      reports: [input('LOW')],
      calculatedAt: asOf,
    });
    const critical = calculator.calculateSegment({
      targetId: 'segment-critical',
      reports: [input('CRITICAL')],
      calculatedAt: asOf,
    });
    expect(critical.score).toBeLessThan(low.score);
    expect(critical.factors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'REPORT_SEVERITY', source: 'COMMUNITY' }),
        expect.objectContaining({ code: 'REPORT_FRESHNESS', source: 'COMMUNITY' }),
      ]),
    );
  });

  it('caps a person to one report contribution per segment', () => {
    const one = calculator.calculateSegment({
      targetId: 'segment-1',
      reports: [input('CRITICAL', { actorId: 'same-user' })],
      calculatedAt: asOf,
    });
    const many = calculator.calculateSegment({
      targetId: 'segment-1',
      reports: [
        input('CRITICAL', { actorId: 'same-user' }),
        input('CRITICAL', { actorId: 'same-user' }),
        input('HIGH', { actorId: 'same-user' }),
      ],
      calculatedAt: asOf,
    });
    expect(many.score).toBe(one.score);
    expect(many.factors).toContainEqual(
      expect.objectContaining({ code: 'REPORTER_CONTRIBUTION_CAP', source: 'SYSTEM', impact: 0 }),
    );
  });

  it('factors an active official road cut and high traffic separately from community signals', () => {
    const community = calculator.calculateSegment({
      targetId: 'segment-1',
      reports: [],
      calculatedAt: asOf,
    });
    const official = calculator.calculateSegment({
      targetId: 'segment-1',
      reports: [],
      calculatedAt: asOf,
      officialIncidents: [{ id: 'cut-1', type: 'TRAFFIC_CUT', active: true }],
      traffic: { level: 'HIGH', measuredAt: asOf },
    });
    expect(official.score).toBeLessThan(community.score);
    expect(official.factors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OFFICIAL_INCIDENTS', source: 'OFFICIAL', impact: -8 }),
        expect.objectContaining({ code: 'OFFICIAL_TRAFFIC', source: 'OFFICIAL', impact: -5 }),
      ]),
    );
    expect(official.confidence).toBe('MEDIUM');
    expect(official.sourceStatus).toEqual({
      community: 'AVAILABLE',
      officialIncidents: 'AVAILABLE',
      traffic: 'AVAILABLE',
    });
  });

  it('rewards a month without active reports only when historical evidence exists', () => {
    const noData = calculator.calculateSegment({
      targetId: 'empty',
      reports: [],
      calculatedAt: asOf,
    });
    const history = calculator.calculateSegment({
      targetId: 'old',
      reports: [input('CRITICAL', { ageDays: 40, status: 'STALE' })],
      calculatedAt: asOf,
    });
    expect(noData.score).toBe(75);
    expect(history.score).toBe(80);
    expect(history.factors).toContainEqual(
      expect.objectContaining({ code: 'NO_RECENT_REPORTS', impact: 5 }),
    );
  });

  it('clamps extreme incident/report combinations to the score boundaries', () => {
    const worst = calculator.calculateSegment({
      targetId: 'worst',
      reports: Array.from({ length: 12 }, (_, index) =>
        input('CRITICAL', { actorId: `user-${index}` }),
      ),
      officialIncidents: Array.from({ length: 20 }, (_, index) => ({
        id: `incident-${index}`,
        type: 'ACCIDENT' as const,
        active: true,
      })),
      calculatedAt: asOf,
    });
    const best = calculator.calculateSegment({
      targetId: 'best',
      reports: Array.from({ length: 8 }, (_, index) =>
        input('LOW', {
          status: 'RESOLVED',
          resolvedVotes: 30,
          weightedResolvedReports: 30,
          actorId: `resolver-${index}`,
        }),
      ),
      calculatedAt: asOf,
    });
    expect(worst.score).toBe(0);
    expect(worst.level).toBe('IMPASSABLE');
    expect(best.score).toBe(100);
    expect(best.level).toBe('GOOD');
  });

  it('aggregates only segments with evidence and keeps segment explanations', () => {
    const street = calculator.calculateStreet({
      targetId: 'street-1',
      officialName: 'Avenida Ejemplo',
      calculatedAt: asOf,
      segments: [
        { id: 'segment-a', reports: [input('HIGH')] },
        { id: 'segment-b', reports: [] },
      ],
    });
    expect(street.targetType).toBe('STREET');
    expect(street.segments).toHaveLength(1);
    expect(street.score).toBe(street.segments![0]!.score);
  });

  it('repeats the same result for the same input and evaluation time', () => {
    const reports = [input('HIGH'), input('MEDIUM', { longitude: -58.379 })];
    expect(
      calculator.calculateSegment({ targetId: 'deterministic', reports, calculatedAt: asOf }),
    ).toEqual(
      calculator.calculateSegment({ targetId: 'deterministic', reports, calculatedAt: asOf }),
    );
  });
});
