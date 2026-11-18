import { describe, expect, it } from 'vitest';
import { SURFACE_TYPE_OPTIONS } from '../../api/roadInformationTypes.js';
import { roadSurfaceLineStyle, surfaceConditionDashArray } from './roadSurfaceStyle.js';

describe('roadSurfaceLineStyle', () => {
  it('defines a visible, distinct style for every surface type', () => {
    const colors = SURFACE_TYPE_OPTIONS.map(
      (item) => roadSurfaceLineStyle(item.value, 18, 'GOOD').color,
    );
    expect(new Set(colors).size).toBe(SURFACE_TYPE_OPTIONS.length);
    expect(colors).toHaveLength(9);
  });

  it('keeps pavement type in the color and uses condition only for its line pattern', () => {
    expect(roadSurfaceLineStyle('CONCRETE_ASPHALT', 18, 'GOOD').color).not.toBe(
      roadSurfaceLineStyle('ASPHALT', 18, 'GOOD').color,
    );
    expect(roadSurfaceLineStyle('ASPHALT', 18, 'VERY_POOR').dashArray).toBe('1 3');
    expect(roadSurfaceLineStyle('ASPHALT', 18, 'REGULAR').dashArray).toBe('8 4');
    expect(roadSurfaceLineStyle('ASPHALT', 18, 'GOOD').dashArray).toBeUndefined();
    expect(roadSurfaceLineStyle('ASPHALT', 18, 'VERY_POOR').weight).toBe(
      roadSurfaceLineStyle('ASPHALT', 18, 'REGULAR').weight,
    );
  });

  it('shows a neutral patterned band when surface type is unknown', () => {
    const style = roadSurfaceLineStyle(null, 16, 'POOR');
    expect(style.color).toBe('#7b8490');
    expect(style.dashArray).toBe('4 3');
  });

  it('uses a distinct dash pattern for missing pavement condition', () => {
    expect(surfaceConditionDashArray(null)).toBe('2 4');
    expect(new Set(['', '8 4', '4 3', '1 3', surfaceConditionDashArray(null)]).size).toBe(5);
  });
});
