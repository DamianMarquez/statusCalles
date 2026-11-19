import { describe, expect, it } from 'vitest';
import type { ZoneProperties } from '../../api/zonesApi.js';
import {
  CRITICAL_CLASSES,
  INTERVENTION_RAMP,
  NO_DATA_ZONE_COLOR,
  quintileBreaks,
  quintileIndex,
  scoreRampColor,
  zoneColor,
} from './zoneColors.js';

function zone(overrides: Partial<ZoneProperties> = {}): ZoneProperties {
  return {
    id: 1,
    name: 'Comuna 1',
    level: 'commune',
    communeId: null,
    totalKm: 100,
    condition: {
      avgScore: 70,
      level: 'ACCEPTABLE',
      scoredSegments: 10,
      coveragePct: 4,
      sufficient: true,
    },
    surface: { dominant: { type: 'CONCRETE', pct: 55 }, top: [], knownPct: 95 },
    intervention: {
      index: 10,
      publicWorks: 1,
      reportedWorks: 0,
      reportedCuts: 0,
      calming: 5,
      calmingByType: {},
      calmingPerKm: 0.05,
    },
    critical: { critical: 0, high: 0, activeReports: 0, class: 0 },
    ...overrides,
  };
}

describe('zone colors', () => {
  it('uses the same ramp as the streets for the state', () => {
    expect(scoreRampColor(0)).toBe('#7f1d1d');
    expect(scoreRampColor(100)).toBe('#17804a');
    expect(scoreRampColor(75)).toBe('#d49a00');
    expect(scoreRampColor(-10)).toBe('#7f1d1d');
  });

  it('colors the state gray when there is not enough evidence', () => {
    const insufficient = zone({
      condition: {
        avgScore: null,
        level: null,
        scoredSegments: 2,
        coveragePct: 0,
        sufficient: false,
      },
    });
    expect(zoneColor(insufficient, 'condition', [])).toBe(NO_DATA_ZONE_COLOR);
    expect(zoneColor(zone(), 'condition', [])).toBe(scoreRampColor(70));
  });

  it('colors the pavement by the dominant type, gray without data', () => {
    expect(zoneColor(zone(), 'surface', [])).not.toBe(NO_DATA_ZONE_COLOR);
    expect(
      zoneColor(zone({ surface: { dominant: null, top: [], knownPct: 0 } }), 'surface', []),
    ).toBe(NO_DATA_ZONE_COLOR);
  });

  it('splits the intervention index into quintiles among the zones', () => {
    const breaks = quintileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(breaks).toEqual([3, 5, 7, 9]);
    expect(quintileIndex(1, breaks)).toBe(0);
    expect(quintileIndex(10, breaks)).toBe(4);
    const low = zone({ intervention: { ...zone().intervention, index: 1 } });
    const high = zone({ intervention: { ...zone().intervention, index: 10 } });
    expect(zoneColor(low, 'intervention', breaks)).toBe(INTERVENTION_RAMP[0]);
    expect(zoneColor(high, 'intervention', breaks)).toBe(INTERVENTION_RAMP[4]);
    expect(quintileBreaks([])).toEqual([0, 0, 0, 0]);
  });

  it('colors the critical reports by class', () => {
    const many = zone({ critical: { critical: 5, high: 3, activeReports: 9, class: 3 } });
    expect(zoneColor(many, 'critical', [])).toBe(CRITICAL_CLASSES[3]!.color);
    expect(zoneColor(zone(), 'critical', [])).toBe(CRITICAL_CLASSES[0]!.color);
  });
});
