import { describe, expect, it } from 'vitest';
import { makeZoneProperties } from '../../test/zoneFixture.js';
import { groupReportsByCategory, summarizeCity } from './cityStats.js';

describe('city stats', () => {
  it('adds up every zone into city totals', () => {
    const summary = summarizeCity([
      makeZoneProperties(1, { totalKm: 100 }),
      makeZoneProperties(2, {
        totalKm: 50,
        segments: 500,
        reportsByType: { POTHOLE: 2, ROAD_BLOCKED: 4 },
        critical: { critical: 2, high: 3, activeReports: 6, class: 2 },
      }),
    ]);
    expect(summary.totalKm).toBe(150);
    expect(summary.segments).toBe(1500);
    expect(summary.surfaceKm.ASPHALT).toBeCloseTo(133, 1);
    expect(summary.knownPct).toBeCloseTo(((66.5 * 2 + 23.75 * 2 + 4.75 * 2) / 150) * 100, 0);
    expect(summary.calming).toBe(40);
    expect(summary.calmingByType).toEqual({ SPEED_BUMP: 30, DIP: 10 });
    expect(summary.publicWorks).toBe(4);
    expect(summary.critical).toBe(3);
    expect(summary.high).toBe(4);
    expect(summary.activeReports).toBe(11);
    // Zona 1: POTHOLE 3, ROAD_WORK 1, FLOOD 1. Zona 2: POTHOLE 2, ROAD_BLOCKED 4.
    expect(summary.reportsByCategory).toEqual({ works: 5, damage: 5, calming: 0, other: 1 });
  });

  it('returns zeros without zones', () => {
    const summary = summarizeCity([]);
    expect(summary.totalKm).toBe(0);
    expect(summary.coveragePct).toBe(0);
    expect(summary.knownPct).toBe(0);
  });

  it('groups reports by the same categories as the map', () => {
    const groups = groupReportsByCategory([
      { type: 'POTHOLE', count: 5 },
      { type: 'ROAD_SUBSIDENCE', count: 2 },
      { type: 'ROAD_WORK', count: 3 },
      { type: 'FLOOD', count: 1 },
    ]);
    expect(groups.map((group) => [group.category, group.count])).toEqual([
      ['works', 3],
      ['damage', 7],
      ['other', 1],
    ]);
    expect(groups[0]).toMatchObject({ label: 'Obras y cortes', icon: '🚧' });
  });
});
