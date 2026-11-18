import { describe, expect, it } from 'vitest';
import { mapConfig } from './mapConfig.js';

describe('map configuration', () => {
  it('starts around Buenos Aires with [lng, lat] order', () => {
    expect(mapConfig.center[0]).toBeCloseTo(-58.4, 1);
    expect(mapConfig.center[1]).toBeCloseTo(-34.6, 1);
  });

  it('falls back to a working style when none is configured', () => {
    expect(mapConfig.style).toBeTruthy();
  });

  it('limits the zoom and pan to a regional area', () => {
    expect(mapConfig.minZoom).toBeGreaterThan(0);
    expect(mapConfig.maxZoom).toBeGreaterThan(mapConfig.minZoom);
    expect(mapConfig.maxBounds).toHaveLength(2);
  });
});
