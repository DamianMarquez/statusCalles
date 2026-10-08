import { describe, expect, it } from 'vitest';
import {
  normalizeCommuneFeature,
  normalizeGeographicName,
  normalizeNeighborhoodFeature,
  normalizeStreetFeature,
  parseFeatureCollection,
  type GeoJsonFeature,
} from './geography.js';

const lineFeature: GeoJsonFeature = {
  type: 'Feature',
  properties: {
    id: 71,
    codigo: 3054,
    nomoficial: 'Av. Álvarez Thomas',
    red_jerarq: 'VÍA DISTRIBUIDORA PRINCIPAL',
    BARRIO: 'Villa Ortúzar',
    COMUNA: 15,
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-58.48, -34.57],
      [-58.47, -34.56],
    ],
  },
};

describe('CABA geographic data normalization', () => {
  it('normalizes accents and whitespace for matching names across datasets', () => {
    expect(normalizeGeographicName('  Villa   Ortúzar ')).toBe('VILLA ORTUZAR');
  });

  it('adapts the official Callejero feature into a named street segment', () => {
    expect(normalizeStreetFeature(lineFeature)).toMatchObject({
      sourceSegmentId: '71',
      sourceCode: '3054',
      officialName: 'Av. Álvarez Thomas',
      roadClass: 'PRIMARY',
      normalizedName: 'AV. ALVAREZ THOMAS',
      neighborhoodName: 'Villa Ortúzar',
      communeNumber: 15,
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [-58.48, -34.57],
            [-58.47, -34.56],
          ],
        ],
      },
    });
  });

  it('normalizes official neighborhood and commune polygons', () => {
    const ring = [
      [-58.5, -34.6],
      [-58.4, -34.6],
      [-58.4, -34.5],
      [-58.5, -34.6],
    ];
    const neighborhood = normalizeNeighborhoodFeature({
      type: 'Feature',
      properties: { id: 3, nombre: 'San Cristóbal', comuna: 3 },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
    const commune = normalizeCommuneFeature({
      type: 'Feature',
      properties: { id: 3, comuna: 3 },
      geometry: { type: 'MultiPolygon', coordinates: [[ring]] },
    });
    expect(neighborhood).toMatchObject({
      sourceId: 3,
      name: 'San Cristóbal',
      normalizedName: 'SAN CRISTOBAL',
      communeNumber: 3,
    });
    expect(commune).toMatchObject({
      sourceId: 3,
      name: 'Comuna 3',
      geometry: { type: 'MultiPolygon' },
    });
  });

  it('rejects invalid geometries and malformed collections before persistence', () => {
    expect(() =>
      normalizeStreetFeature({
        ...lineFeature,
        geometry: { type: 'Point', coordinates: [-58, -34] },
      }),
    ).toThrow('Unsupported or invalid street geometry: Point.');
    expect(() =>
      normalizeNeighborhoodFeature({
        type: 'Feature',
        properties: { id: 1, nombre: 'Barrio', comuna: 1 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 1],
            ],
          ],
        },
      }),
    ).toThrow('Unsupported or invalid boundary geometry: Polygon.');
    expect(() => parseFeatureCollection({ type: 'FeatureCollection', features: [] })).toThrow(
      'non-empty',
    );
  });
});
