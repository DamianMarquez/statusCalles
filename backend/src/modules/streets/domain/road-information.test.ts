import { describe, expect, it } from 'vitest';
import {
  ROAD_TYPES,
  SPECIAL_TREATMENTS,
  SURFACE_CONDITIONS,
  SURFACE_TYPES,
  validateRoadInformationPatch,
} from './road-information.js';

describe('road information catalog and patch validation', () => {
  it('keeps the full classification catalogs recognized', () => {
    expect(ROAD_TYPES).toHaveLength(6);
    expect(SURFACE_TYPES).toHaveLength(9);
    expect(SURFACE_CONDITIONS).toEqual(['GOOD', 'REGULAR', 'POOR', 'VERY_POOR']);
    expect(SPECIAL_TREATMENTS).toContain('BUS_STOP');
  });

  it('accepts partial attributes and multiple special treatments', () => {
    expect(
      validateRoadInformationPatch({
        surfaceType: 'CONCRETE_ASPHALT',
        specialTreatments: ['BUS_STOP', 'INTERSECTION'],
      }),
    ).toBe(true);
  });

  it('keeps concrete with asphalt distinct from asphalt', () => {
    expect(validateRoadInformationPatch({ surfaceType: 'CONCRETE_ASPHALT' })).toBe(true);
    expect(validateRoadInformationPatch({ surfaceType: 'ASPHALT' })).toBe(true);
  });

  it('rejects empty, unknown, repeated, or contradictory patches', () => {
    expect(validateRoadInformationPatch({})).toBe(false);
    expect(validateRoadInformationPatch({ surfaceType: 'GRAVEL' })).toBe(false);
    expect(validateRoadInformationPatch({ specialTreatments: ['BUS_STOP', 'BUS_STOP'] })).toBe(
      false,
    );
    expect(validateRoadInformationPatch({ specialTreatments: ['NONE', 'BUS_STOP'] })).toBe(false);
  });

  it('allows explicit no treatment independently from other attributes', () => {
    expect(validateRoadInformationPatch({ specialTreatments: ['NONE'] })).toBe(true);
  });
});
