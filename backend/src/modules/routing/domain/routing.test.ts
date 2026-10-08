import { describe, expect, it } from 'vitest';
import { calculateRoutePenalty, type RouteSegmentEvidence } from './routing.js';

const segment: RouteSegmentEvidence = {
  id: 'segment-1',
  officialName: 'Avenida de ejemplo',
  lengthMeters: 1000,
  score: 30,
  level: 'BAD',
  maximumSeverity: 3,
  activeOfficialCut: false,
};

describe('calculateRoutePenalty', () => {
  it('does not alter fastest routes while retaining issue explanations', () => {
    expect(calculateRoutePenalty(segment, 'FASTEST')).toEqual({
      segmentId: 'segment-1',
      delaySeconds: 0,
      blocked: false,
      reasons: ['score bajo (30/100)', 'severidad alta'],
    });
  });

  it('applies deterministic penalties from score and severity', () => {
    const penalty = calculateRoutePenalty(segment, 'AVOID_BAD_STREETS');
    expect(penalty.segmentId).toBe('segment-1');
    expect(penalty.delaySeconds).toBeCloseTo(
      (1000 / 13.89) * ((55 - 30) / 55) * 2 * 1.4 + (1000 / 13.89) * 0.25,
    );
    expect(penalty.blocked).toBe(false);
  });

  it('treats impassable scores and official cuts as blocked for the blocked preference', () => {
    expect(
      calculateRoutePenalty({ ...segment, score: 0, level: 'IMPASSABLE' }, 'AVOID_BLOCKED_STREETS')
        .blocked,
    ).toBe(true);
    expect(
      calculateRoutePenalty({ ...segment, activeOfficialCut: true }, 'AVOID_BLOCKED_STREETS')
        .blocked,
    ).toBe(true);
  });

  it('penalizes official cuts under avoid-bad preference without hard-blocking them', () => {
    const result = calculateRoutePenalty(
      { ...segment, score: 75, level: 'FAIR', maximumSeverity: null, activeOfficialCut: true },
      'AVOID_BAD_STREETS',
    );
    expect(result.blocked).toBe(false);
    expect(result.delaySeconds).toBeCloseTo((1000 / 13.89) * 5);
    expect(result.reasons).toContain('corte oficial activo');
  });

  it('uses community blockage signals for blocked-route preference', () => {
    const result = calculateRoutePenalty(
      { ...segment, score: 75, maximumSeverity: null, availabilitySignals: ['ROAD_BLOCKED'] },
      'AVOID_BLOCKED_STREETS',
    );
    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain('bloqueo o corte reportado');
  });

  it('adds explicit penalties for works, flooding and traffic without changing physical score', () => {
    const result = calculateRoutePenalty(
      {
        ...segment,
        score: 75,
        maximumSeverity: null,
        availabilitySignals: ['ROAD_WORK', 'FLOOD', 'HIGH_TRAFFIC'],
      },
      'AVOID_BAD_STREETS',
    );
    expect(result.delaySeconds).toBeCloseTo((1000 / 13.89) * 5.5);
    expect(result.reasons).toEqual([
      'obra reportada',
      'inundación reportada',
      'tráfico alto reportado',
    ]);
  });
});
