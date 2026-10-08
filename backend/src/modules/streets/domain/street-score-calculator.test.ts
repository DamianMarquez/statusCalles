import { describe, expect, it } from 'vitest';
import { emptyReportFeedbackSummary } from '../../reports/domain/report-feedback.js';
import type { StreetReport } from '../../reports/domain/street-report.js';
import { StreetScoreCalculator, type ScoreReportEvidence } from './street-score-calculator.js';

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
): ScoreReportEvidence {
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
  it('penalizes a single mild issue less than severe clustered reports', () => {
    const mild = calculator.calculateSegment({
      targetId: 'mild',
      reports: [input('LOW')],
      calculatedAt: asOf,
    });
    const severe = calculator.calculateSegment({
      targetId: 'severe',
      reports: [input('CRITICAL'), input('HIGH', { actorId: 'other' })],
      calculatedAt: asOf,
    });
    expect(mild.score).toBeGreaterThan(severe.score);
    expect(severe.metrics.highSeverityReports).toBe(2);
  });

  it('reduces the impact of old reports using the freshness half-life', () => {
    const recent = calculator.calculateSegment({
      targetId: 'recent',
      reports: [input('HIGH')],
      calculatedAt: asOf,
    });
    const aging = calculator.calculateSegment({
      targetId: 'aging',
      reports: [input('HIGH', { ageDays: 20 })],
      calculatedAt: asOf,
    });
    const stale = calculator.calculateSegment({
      targetId: 'stale',
      reports: [input('HIGH', { ageDays: 40, status: 'STALE' })],
      calculatedAt: asOf,
    });
    expect(aging.score).toBeGreaterThan(recent.score);
    expect(stale.metrics.activeReports).toBe(0);
    expect(stale.hasEvidence).toBe(true);
    expect(recent.score).toBeLessThan(100);
  });

  it('does not let resolved reports reduce the score and reports them as historical context', () => {
    const result = calculator.calculateSegment({
      targetId: 'street',
      reports: [
        input('CRITICAL', { status: 'RESOLVED', actorId: 'resolved' }),
        input('LOW', { actorId: 'one' }),
        input('LOW', { actorId: 'two' }),
      ],
      calculatedAt: asOf,
    });
    expect(result.score).toBeLessThan(100);
    expect(result.metrics.resolvedReports).toBe(1);
    expect(result.metrics.activeReports).toBe(2);
  });

  it('shows a lower score when active reports have more weighted confirmations', () => {
    const plain = calculator.calculateSegment({
      targetId: 'plain',
      reports: [input('HIGH'), input('HIGH', { actorId: 'other' })],
      calculatedAt: asOf,
    });
    const confirmed = calculator.calculateSegment({
      targetId: 'confirmed',
      reports: [
        input('HIGH', { confirmations: 8, weightedConfirmations: 8 }),
        input('HIGH', { actorId: 'other', confirmations: 8, weightedConfirmations: 8 }),
      ],
      calculatedAt: asOf,
    });
    expect(confirmed.score).toBeLessThan(plain.score);
    expect(confirmed.metrics.confirmations).toBe(16);
  });

  it('lets resolution feedback reduce a report penalty', () => {
    const plain = calculator.calculateSegment({
      targetId: 'plain',
      reports: [input('HIGH'), input('HIGH', { actorId: 'other' })],
      calculatedAt: asOf,
    });
    const resolvedVotes = calculator.calculateSegment({
      targetId: 'resolved-votes',
      reports: [
        input('HIGH', { resolvedVotes: 4, weightedResolvedReports: 4 }),
        input('HIGH', { actorId: 'other', resolvedVotes: 4, weightedResolvedReports: 4 }),
      ],
      calculatedAt: asOf,
    });
    expect(resolvedVotes.score).toBeGreaterThan(plain.score);
  });

  it('returns a neutral score with low confidence and no data for an unreported segment', () => {
    const result = calculator.calculateSegment({
      targetId: 'segment-1',
      reports: [],
      calculatedAt: asOf,
    });
    expect(result).toMatchObject({
      score: 75,
      level: 'GOOD',
      confidence: 'LOW',
      hasEvidence: false,
    });
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

  it('scores the three new physical report kinds using the common severity/freshness policy', () => {
    for (const type of ['ROAD_IRREGULARITY', 'ROAD_ELEVATION', 'ROAD_SUBSIDENCE'] as const) {
      const reportInput = input('HIGH');
      reportInput.report.type = type;
      const result = calculator.calculateSegment({
        targetId: type,
        reports: [reportInput],
        calculatedAt: asOf,
      });
      expect(result.hasEvidence).toBe(true);
      expect(result.metrics.activeReports).toBe(1);
      expect(result.factors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'REPORT_SEVERITY' }),
          expect.objectContaining({ code: 'REPORT_FRESHNESS' }),
        ]),
      );
    }
  });

  it('does not let a blocked-road report degrade physical condition', () => {
    const roadBlock = input('CRITICAL');
    roadBlock.report.type = 'ROAD_BLOCKED';
    const blocked = calculator.calculateSegment({
      targetId: 'blocked',
      reports: [roadBlock],
      calculatedAt: asOf,
    });
    const empty = calculator.calculateSegment({
      targetId: 'empty',
      reports: [],
      calculatedAt: asOf,
    });
    expect(blocked.score).toBe(empty.score);
    expect(blocked.hasEvidence).toBe(false);
    expect(blocked.availability.status).toBe('BLOCKED');
  });

  it('preserves availability signals when a street has no physical evidence', () => {
    const roadBlock = input('CRITICAL');
    roadBlock.report.type = 'ROAD_BLOCKED';
    const result = calculator.calculateStreet({
      targetId: 'street-blocked',
      officialName: 'Avenida Ejemplo',
      calculatedAt: asOf,
      segments: [{ id: 'segment-blocked', reports: [roadBlock] }],
    });
    expect(result.hasEvidence).toBe(false);
    expect(result.score).toBe(75);
    expect(result.availability.status).toBe('BLOCKED');
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

  it('keeps cuts and traffic in availability without changing physical condition', () => {
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
    expect(official.score).toBe(community.score);
    expect(official.factors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OFFICIAL_INCIDENTS' }),
        expect.objectContaining({ code: 'OFFICIAL_TRAFFIC' }),
      ]),
    );
    expect(official.availability).toMatchObject({
      status: 'BLOCKED',
      signals: expect.arrayContaining(['TRAFFIC_CUT', 'HIGH_TRAFFIC']),
    });
    expect(official.confidence).toBe('LOW');
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
    expect(worst.level).toBe('CRITICAL');
    expect(best.score).toBe(100);
    expect(best.level).toBe('EXCELLENT');
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
