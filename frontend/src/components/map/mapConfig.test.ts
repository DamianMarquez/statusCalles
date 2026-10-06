import { describe, expect, it } from 'vitest';
import { mapConfig } from './mapConfig.js';

describe('map configuration', () => {
  it('starts around Buenos Aires and uses the standard OpenStreetMap tiles', () => {
    expect(mapConfig.center[0]).toBeCloseTo(-34.6, 1);
    expect(mapConfig.center[1]).toBeCloseTo(-58.4, 1);
    expect(mapConfig.tileUrl).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(mapConfig.tileAttribution).toContain('OpenStreetMap');
  });

  it('limits the zoom and pan to a regional area', () => {
    expect(mapConfig.minZoom).toBeGreaterThan(0);
    expect(mapConfig.maxZoom).toBeGreaterThan(mapConfig.minZoom);
    expect(mapConfig.maxBounds).toHaveLength(2);
  });
});
