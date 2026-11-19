import { describe, expect, it } from 'vitest';
import { isValidTileCoordinate, roadClassesForTileZoom } from './street-tiles.js';

describe('street tiles domain', () => {
  it('adds road classes as the zoom increases', () => {
    expect(roadClassesForTileZoom(9)).toEqual([]);
    expect(roadClassesForTileZoom(10)).toEqual(['PRIMARY']);
    expect(roadClassesForTileZoom(11)).toEqual(['PRIMARY', 'SECONDARY']);
    expect(roadClassesForTileZoom(12)).toEqual(['PRIMARY', 'SECONDARY']);
    expect(roadClassesForTileZoom(13)).toEqual(['PRIMARY', 'SECONDARY', 'LOCAL', 'UNKNOWN']);
    expect(roadClassesForTileZoom(16)).toEqual(['PRIMARY', 'SECONDARY', 'LOCAL', 'UNKNOWN']);
  });

  it('validates tile coordinates', () => {
    expect(isValidTileCoordinate(13, 2767, 4936)).toBe(true);
    expect(isValidTileCoordinate(0, 0, 0)).toBe(true);
    expect(isValidTileCoordinate(3, 8, 0)).toBe(false);
    expect(isValidTileCoordinate(3, -1, 0)).toBe(false);
    expect(isValidTileCoordinate(21, 0, 0)).toBe(false);
    expect(isValidTileCoordinate(3, 1.5, 0)).toBe(false);
  });
});
