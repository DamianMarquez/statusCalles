import { describe, expect, it } from 'vitest';
import { chaikin, simplifyLine, smoothGeometry } from './smooth.js';

describe('smooth', () => {
  it('simplifyLine quita puntos alineados y conserva extremos', () => {
    const line = [
      [0, 0],
      [1, 0.0000001],
      [2, 0],
      [3, 0],
    ];
    expect(simplifyLine(line)).toEqual([
      [0, 0],
      [3, 0],
    ]);
  });

  it('chaikin en línea abierta conserva extremos y agrega puntos', () => {
    const line = [
      [0, 0],
      [1, 1],
      [2, 0],
    ];
    const result = chaikin(line, 2, false);
    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([2, 0]);
    expect(result.length).toBeGreaterThan(line.length);
  });

  it('chaikin en anillo mantiene el polígono cerrado', () => {
    const ring = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    const result = chaikin(ring, 2, true);
    expect(result[0]).toEqual(result[result.length - 1]);
    expect(result.length).toBeGreaterThan(ring.length);
  });

  it('smoothGeometry no modifica puntos', () => {
    const point = { type: 'Point' as const, coordinates: [1, 2] };
    expect(smoothGeometry(point)).toBe(point);
  });
});
