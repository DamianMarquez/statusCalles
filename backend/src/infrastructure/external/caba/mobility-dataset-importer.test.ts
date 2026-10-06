import { describe, expect, it, vi } from 'vitest';
import { parseFeatureCollection } from '../../../modules/streets/domain/geography.js';
import {
  fetchMobilityGeoJson,
  normalizeMobilityFeature,
  normalizeMobilityFeatures,
  validateCabaMobilityUrl,
} from './mobility-dataset-importer.js';

function feature(properties: Record<string, unknown>, geometry: unknown) {
  const collection = parseFeatureCollection({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties, geometry }],
  });
  return collection.features[0]!;
}

describe('CABA mobility dataset mapper', () => {
  it('accepts a mocked official dataset response', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { id: 1, nombre: 'Ciclovía' },
              geometry: {
                type: 'LineString',
                coordinates: [
                  [-58.4, -34.6],
                  [-58.401, -34.601],
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(
      fetchMobilityGeoJson('https://data.example.test/geo.json', fetcher),
    ).resolves.toMatchObject({ type: 'FeatureCollection', features: [expect.any(Object)] });
  });

  it('surfaces upstream failures and invalid GeoJSON', async () => {
    await expect(
      fetchMobilityGeoJson(
        'https://data.example.test',
        vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })),
      ),
    ).rejects.toThrow('HTTP 503');
    await expect(
      fetchMobilityGeoJson(
        'https://data.example.test',
        vi.fn().mockResolvedValue(new Response('{broken', { status: 200 })),
      ),
    ).rejects.toThrow('not valid GeoJSON');
  });

  it('aborts a source request after its configured timeout', async () => {
    const fetcher: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    await expect(
      fetchMobilityGeoJson('https://data.example.test', fetcher, 5),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('requires HTTPS and a GCBA host for remote dataset URLs', () => {
    expect(validateCabaMobilityUrl('https://data.buenosaires.gob.ar/dataset/ciclovias')).toContain(
      'data.buenosaires.gob.ar',
    );
    expect(() => validateCabaMobilityUrl('http://127.0.0.1/data.geojson')).toThrow(
      'official GCBA HTTPS host',
    );
  });

  it('maps official cycleway GeoJSON fields to normalized infrastructure', () => {
    const result = normalizeMobilityFeature(
      feature(
        { id: 10, nombre: 'Av. Ejemplo', tipo: 'Ciclovías mano única', barrio: 'Palermo' },
        {
          type: 'LineString',
          coordinates: [
            [-58.4, -34.6],
            [-58.401, -34.601],
          ],
        },
      ),
      'ciclovias',
    );
    expect(result).toMatchObject({
      externalId: '10',
      type: 'BIKE_LANE',
      name: 'Av. Ejemplo',
      geometry: { type: 'MultiLineString' },
    });
  });

  it('maps Metrobus stop points without inventing identifiers', () => {
    const result = normalizeMobilityFeature(
      feature(
        { CALLE: 'CABILDO AV.', nombre_par: 'Parada 1', COMUNA: '12' },
        {
          type: 'Point',
          coordinates: [-58.476, -34.539],
        },
      ),
      'metrobusStops',
    );
    expect(result.type).toBe('METROBUS_STOP');
    expect(result.externalId).toMatch(/^[a-f0-9]{64}$/);
    expect(result.geometry.type).toBe('Point');
  });

  it('rejects unsupported geometry and out-of-range coordinates', () => {
    expect(() =>
      normalizeMobilityFeature(
        feature({ id: 1 }, { type: 'Polygon', coordinates: [] }),
        'ciclovias',
      ),
    ).toThrow('Unsupported ciclovias geometry type.');
    expect(() =>
      normalizeMobilityFeature(
        feature({ id: 1 }, { type: 'Point', coordinates: [181, 0] }),
        'metrobusStops',
      ),
    ).toThrow('Invalid Metrobus stop coordinate.');
  });

  it('uses stable keys when Metrobus corridors have no source identifier', () => {
    const source = feature(
      { METROBUS: 'MTB Ejemplo', NOM_MAPA: 'AV. EJEMPLO' },
      {
        type: 'MultiLineString',
        coordinates: [
          [
            [-58.4, -34.6],
            [-58.401, -34.601],
          ],
        ],
      },
    );
    expect(normalizeMobilityFeature(source, 'metrobus').externalId).toBe(
      normalizeMobilityFeature(source, 'metrobus').externalId,
    );
  });

  it('preserves prior imports for an empty feed and rejects duplicate feed identifiers', () => {
    expect(() => normalizeMobilityFeatures([], 'ciclovias')).toThrow(
      'Empty mobility dataset; existing records were preserved.',
    );
    const duplicate = feature(
      { id: 22, nombre: 'Ciclovía' },
      {
        type: 'LineString',
        coordinates: [
          [-58.4, -34.6],
          [-58.401, -34.601],
        ],
      },
    );
    expect(() => normalizeMobilityFeatures([duplicate, duplicate], 'ciclovias')).toThrow(
      'duplicate external identifiers',
    );
  });
});
