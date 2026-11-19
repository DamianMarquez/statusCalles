import { describe, expect, it } from 'vitest';
import { computeZoneMetrics, criticalClass, scoreToLevel, type ZoneRaw } from './zone-metrics.js';

function zone(overrides: Partial<ZoneRaw> = {}): ZoneRaw {
  return {
    id: 1,
    name: 'Comuna 1',
    communeId: null,
    geometry: null,
    totalKm: 100,
    segments: 1000,
    scoredSegments: 0,
    scoreSum: 0,
    scoredKm: 0,
    surfaceKm: {},
    publicWorks: 0,
    calming: {},
    reportedWorks: 0,
    reportedCuts: 0,
    criticalReports: 0,
    highReports: 0,
    activeReports: 0,
    reportsByType: {},
    ...overrides,
  };
}

describe('zone metrics', () => {
  it('maps scores to the same levels as the streets', () => {
    expect(scoreToLevel(95)).toBe('EXCELLENT');
    expect(scoreToLevel(74.6)).toBe('GOOD');
    expect(scoreToLevel(40)).toBe('BAD');
    expect(scoreToLevel(3)).toBe('CRITICAL');
  });

  it('shows no condition when there are too few scored segments', () => {
    const metrics = computeZoneMetrics(zone({ scoredSegments: 4, scoreSum: 160, scoredKm: 0.5 }));
    expect(metrics.condition).toMatchObject({
      avgScore: null,
      level: null,
      sufficient: false,
      scoredSegments: 4,
    });
  });

  it('averages the score of the scored segments once there is enough evidence', () => {
    const metrics = computeZoneMetrics(zone({ scoredSegments: 10, scoreSum: 520, scoredKm: 5 }));
    expect(metrics.condition).toMatchObject({
      avgScore: 52,
      level: 'UNCOMFORTABLE',
      sufficient: true,
      coveragePct: 5,
    });
  });

  it('finds the dominant pavement by kilometres with its share of the known ones', () => {
    const metrics = computeZoneMetrics(
      zone({ surfaceKm: { ASPHALT: 60, CONCRETE: 30, GRANITE_COBBLESTONE: 6, PERMEABLE: 4 } }),
    );
    expect(metrics.surface.dominant).toEqual({ type: 'ASPHALT', pct: 60 });
    expect(metrics.surface.top.map((item) => item.type)).toEqual([
      'ASPHALT',
      'CONCRETE',
      'GRANITE_COBBLESTONE',
    ]);
    expect(metrics.surface.knownPct).toBe(100);
  });

  it('has no dominant pavement without data', () => {
    expect(computeZoneMetrics(zone()).surface.dominant).toBeNull();
  });

  it('weights works and cuts far above speed reducers, per 10 km', () => {
    const metrics = computeZoneMetrics(
      zone({
        totalKm: 50,
        publicWorks: 2,
        reportedCuts: 1,
        reportedWorks: 1,
        calming: { SPEED_BUMP: 30, DIP: 10 },
      }),
    );
    // (2*10 + 1*10 + 1*10 + 40*1) / 50 km * 10 = 16
    expect(metrics.intervention.index).toBe(16);
    expect(metrics.intervention).toMatchObject({
      publicWorks: 2,
      reportedWorks: 1,
      reportedCuts: 1,
      calming: 40,
      calmingPerKm: 0.8,
    });
  });

  it('classifies critical reports', () => {
    expect([0, 1, 2, 3, 5, 6, 20].map(criticalClass)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    const metrics = computeZoneMetrics(
      zone({ criticalReports: 2, highReports: 2, activeReports: 9 }),
    );
    expect(metrics.critical).toEqual({ critical: 2, high: 2, activeReports: 9, class: 2 });
  });

  it('does not divide by zero in a zone without streets', () => {
    const metrics = computeZoneMetrics(zone({ totalKm: 0, publicWorks: 1 }));
    expect(metrics.intervention.index).toBe(0);
    expect(metrics.condition.coveragePct).toBe(0);
  });

  it('exposes kilometres per pavement type, scored kilometres, segments and reports by type', () => {
    const metrics = computeZoneMetrics(
      zone({
        totalKm: 10,
        segments: 120,
        scoredKm: 1.234,
        surfaceKm: { ASPHALT: 6.5555, CONCRETE: 2 },
        reportsByType: { POTHOLE: 3, ROAD_WORK: 1 },
      }),
    );
    expect(metrics.surface.kmByType).toEqual({ ASPHALT: 6.56, CONCRETE: 2 });
    expect(metrics.condition.scoredKm).toBe(1.2);
    expect(metrics.segments).toBe(120);
    expect(metrics.reportsByType).toEqual({ POTHOLE: 3, ROAD_WORK: 1 });
  });
});
