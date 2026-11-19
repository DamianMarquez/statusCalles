import { describe, expect, it } from 'vitest';
import { buildTrafficCalmingQuery, parseTrafficCalming } from './osm-traffic-calming-importer.js';

describe('parseTrafficCalming', () => {
  it('maps nodes, uses the center of ways and ignores unknown values', () => {
    const parsed = parseTrafficCalming({
      elements: [
        { type: 'node', id: 1, lat: -34.6, lon: -58.4, tags: { traffic_calming: 'bump' } },
        {
          type: 'way',
          id: 2,
          center: { lat: -34.61, lon: -58.41 },
          tags: { traffic_calming: 'table', name: 'Senda elevada' },
        },
        { type: 'node', id: 3, lat: -34.62, lon: -58.42, tags: { traffic_calming: 'yes' } },
        { type: 'way', id: 4, tags: { traffic_calming: 'hump' } },
      ],
    });
    expect(parsed.total).toBe(4);
    expect(parsed.points.map((point) => [point.externalId, point.type])).toEqual([
      ['node/1', 'SPEED_BUMP'],
      ['way/2', 'RAISED_CROSSING'],
    ]);
    expect(parsed.points[1]).toMatchObject({
      latitude: -34.61,
      longitude: -58.41,
      name: 'Senda elevada',
    });
  });

  it('fails clearly when the response is not an Overpass document', () => {
    expect(() => parseTrafficCalming({})).toThrow(/elements/);
  });

  it('asks for nodes and ways inside the CABA box', () => {
    const query = buildTrafficCalmingQuery();
    expect(query).toContain('node["traffic_calming"]');
    expect(query).toContain('way["traffic_calming"]');
    expect(query).toContain('out tags center');
  });
});
