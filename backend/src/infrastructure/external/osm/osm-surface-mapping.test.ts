import { describe, expect, it } from 'vitest';
import { mapOsmSurface } from './osm-surface-mapping.js';

describe('mapOsmSurface', () => {
  it.each([
    ['asphalt', 'ASPHALT'],
    ['concrete', 'CONCRETE'],
    ['concrete:plates', 'CONCRETE'],
    ['sett', 'GRANITE_COBBLESTONE'],
    ['cobblestone', 'GRANITE_COBBLESTONE'],
    ['granite', 'GRANITE_COBBLESTONE'],
    ['paving_stones', 'INTERLOCKING_PAVER'],
    ['Asphalt', 'ASPHALT'],
    ['asphalt;concrete', 'ASPHALT'],
  ])('maps %s to %s', (surface, expected) => {
    expect(mapOsmSurface(surface)).toBe(expected);
  });

  it('returns null for surfaces without an equivalent', () => {
    expect(mapOsmSurface('gravel')).toBeNull();
    expect(mapOsmSurface('unpaved')).toBeNull();
    expect(mapOsmSurface('dirt')).toBeNull();
    expect(mapOsmSurface(undefined)).toBeNull();
    expect(mapOsmSurface('')).toBeNull();
  });
});

import { isRoadwayHighway, parseOverpassWays } from './osm-surface-importer.js';

describe('roadway filter', () => {
  it('keeps roadways and drops sidewalks, steps and cycleways', () => {
    for (const highway of [
      'residential',
      'primary',
      'secondary_link',
      'motorway_link',
      'pedestrian',
    ]) {
      expect(isRoadwayHighway(highway)).toBe(true);
    }
    for (const highway of ['footway', 'steps', 'cycleway', 'path', 'corridor', undefined]) {
      expect(isRoadwayHighway(highway)).toBe(false);
    }
  });

  it('ignores sidewalks when parsing an Overpass export', () => {
    const geometry = [
      { lat: -34.6, lon: -58.4 },
      { lat: -34.6, lon: -58.39 },
    ];
    const parsed = parseOverpassWays({
      elements: [
        {
          type: 'way',
          id: 1,
          tags: { highway: 'residential', surface: 'asphalt', name: 'Corrientes' },
          geometry,
        },
        { type: 'way', id: 2, tags: { highway: 'footway', surface: 'paving_stones' }, geometry },
      ],
    });
    expect(parsed.lines.map((line) => line.ref)).toEqual(['way/1']);
  });
});
