import { describe, expect, it } from 'vitest';
import { normalizeStreetRoadClass, visibleRoadClassesAtZoom } from './street-road-class.js';

describe('official street hierarchy', () => {
  it.each([
    ['VÍA TRONCAL', 'PRIMARY'],
    ['VÍA DISTRIBUIDORA PRINCIPAL', 'PRIMARY'],
    ['VÍA DISTRIBUIDORA COMPLEMENTARIA', 'SECONDARY'],
    ['VÍA LOCAL', 'LOCAL'],
    ['unrecognized source value', 'UNKNOWN'],
    [null, 'UNKNOWN'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeStreetRoadClass(input)).toBe(expected);
  });

  it('adds road classes progressively by zoom', () => {
    expect(visibleRoadClassesAtZoom(11)).toEqual(['PRIMARY']);
    expect(visibleRoadClassesAtZoom(12)).toEqual(['PRIMARY', 'SECONDARY']);
    expect(visibleRoadClassesAtZoom(14)).toEqual(['PRIMARY', 'SECONDARY', 'LOCAL', 'UNKNOWN']);
  });
});
