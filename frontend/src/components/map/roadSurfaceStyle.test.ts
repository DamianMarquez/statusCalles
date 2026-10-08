import { describe, expect, it } from 'vitest';
import { SURFACE_TYPE_OPTIONS } from '../../api/roadInformationTypes.js';
import { roadSurfaceLineStyle } from './roadSurfaceStyle.js';

describe('roadSurfaceLineStyle', () => {
  it('defines a visible, distinct style for every surface type', () => {
    const colors = SURFACE_TYPE_OPTIONS.map(
      (item) => roadSurfaceLineStyle(item.value, 18, 'GOOD').color,
    );
    expect(new Set(colors).size).toBe(SURFACE_TYPE_OPTIONS.length);
    expect(colors).toHaveLength(9);
  });

  it('keeps concrete with asphalt distinct and emphasizes poor condition', () => {
    expect(roadSurfaceLineStyle('CONCRETE_ASPHALT', 18, 'GOOD').color).not.toBe(
      roadSurfaceLineStyle('ASPHALT', 18, 'GOOD').color,
    );
    expect(roadSurfaceLineStyle('ASPHALT', 18, 'VERY_POOR').weight).toBeGreaterThan(
      roadSurfaceLineStyle('ASPHALT', 18, 'REGULAR').weight,
    );
  });
});
