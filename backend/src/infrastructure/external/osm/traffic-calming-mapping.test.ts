import { describe, expect, it } from 'vitest';
import { mapTrafficCalming } from './traffic-calming-mapping.js';

describe('mapTrafficCalming', () => {
  it.each([
    ['bump', 'SPEED_BUMP'],
    ['mini_bumps', 'SPEED_BUMP'],
    ['hump', 'SPEED_HUMP'],
    ['table', 'RAISED_CROSSING'],
    ['dip', 'DIP'],
    ['cushion', 'CUSHION'],
    ['island', 'NARROWING'],
    ['choker', 'NARROWING'],
    ['chicane', 'NARROWING'],
    ['rumble_strip', 'RUMBLE_STRIP'],
    ['Bump', 'SPEED_BUMP'],
    ['yes;hump', 'SPEED_HUMP'],
  ])('maps %s to %s', (value, expected) => {
    expect(mapTrafficCalming(value)).toBe(expected);
  });

  it('ignores values without an equivalent', () => {
    expect(mapTrafficCalming('yes')).toBeNull();
    expect(mapTrafficCalming('no')).toBeNull();
    expect(mapTrafficCalming('choked_table')).toBeNull();
    expect(mapTrafficCalming(undefined)).toBeNull();
    expect(mapTrafficCalming('')).toBeNull();
  });
});
