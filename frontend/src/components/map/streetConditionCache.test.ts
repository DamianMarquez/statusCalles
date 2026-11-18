import { describe, expect, it } from 'vitest';
import {
  ConditionCache,
  conditionCacheKey,
  gridSizeForZoom,
  snapBounds,
} from './streetConditionCache.js';

const empty = { type: 'FeatureCollection' as const, features: [] };

describe('street condition cache', () => {
  it('snaps the viewport outwards to the grid so small moves repeat the same query', () => {
    const a = snapBounds({ south: -34.6063, north: -34.5996, west: -58.389, east: -58.381 }, 16);
    const b = snapBounds({ south: -34.6061, north: -34.5994, west: -58.3888, east: -58.3808 }, 16);
    expect(a).toEqual(b);
    expect(a.south).toBeLessThanOrEqual(-34.6063);
    expect(a.north).toBeGreaterThanOrEqual(-34.5996);
    expect(a.west).toBeLessThanOrEqual(-58.389);
    expect(a.east).toBeGreaterThanOrEqual(-58.381);
  });

  it('uses a coarser grid when zoomed out', () => {
    expect(gridSizeForZoom(11)).toBeGreaterThan(gridSizeForZoom(13));
    expect(gridSizeForZoom(13)).toBeGreaterThan(gridSizeForZoom(15));
    expect(gridSizeForZoom(15)).toBeGreaterThan(gridSizeForZoom(17));
  });

  it('builds distinct keys per zoom, levels and road classes', () => {
    const bounds = { south: 0, north: 1, west: 0, east: 1 };
    const base = conditionCacheKey(bounds, 16, null, ['LOCAL']);
    expect(conditionCacheKey(bounds, 16.4, null, ['LOCAL'])).toBe(base);
    expect(conditionCacheKey(bounds, 15, null, ['LOCAL'])).not.toBe(base);
    expect(conditionCacheKey(bounds, 16, ['BAD'], ['LOCAL'])).not.toBe(base);
    expect(conditionCacheKey(bounds, 16, null, ['PRIMARY'])).not.toBe(base);
  });

  it('expires entries and evicts the oldest beyond the limit', () => {
    let now = 0;
    const cache = new ConditionCache(2, 1000, () => now);
    cache.set('a', empty);
    cache.set('b', empty);
    cache.set('c', empty);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(empty);
    now = 2000;
    expect(cache.get('b')).toBeNull();
  });
});
