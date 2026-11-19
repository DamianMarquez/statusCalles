import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../database/database.js';
import { getTestDatabaseUrl } from '../../database/config.js';
import { DrizzleStreetScoreRepository } from '../../database/street-score-repository.drizzle.js';
import { replaceSourceSurfaces, type SurfaceLine } from './surface-matcher.js';

const { database, pool } = createDatabase(getTestDatabaseUrl());
const sourceId = randomUUID();
const baselineSourceId = randomUUID();
const streetId = randomUUID();
const alongId = randomUUID();
const parallelId = randomUUID();
const crossingId = randomUUID();

// Un tramo de ~92 m, otro paralelo a ~30 m y otro que lo cruza en perpendicular.
const segments: Array<[string, string]> = [
  [alongId, 'MULTILINESTRING((-58.4000 -34.6000, -58.3990 -34.6000))'],
  [parallelId, 'MULTILINESTRING((-58.4000 -34.6003, -58.3990 -34.6003))'],
  [crossingId, 'MULTILINESTRING((-58.3995 -34.6010, -58.3995 -34.5990))'],
];

// Línea de la fuente a ~3 m del primer tramo.
const line: SurfaceLine = {
  ref: 'way/1',
  normalizedName: null,
  surfaceType: 'GRANITE_COBBLESTONE',
  coordinates: [
    [-58.4001, -34.60003],
    [-58.3989, -34.60003],
  ],
};

describe('surface matcher PostGIS integration', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO geographic_sources (id, slug, name, provider, dataset, source_url, license)
       VALUES ($1, $2, 'Test surface', 'tests', 'surface', 'https://example.invalid', 'test'),
              ($3, $4, 'Test streets', 'tests', 'streets', 'https://example.invalid', 'test')`,
      [sourceId, `surface-test-${sourceId}`, baselineSourceId, `streets-test-${baselineSourceId}`],
    );
    await pool.query(
      `INSERT INTO streets (id, source_code, official_name, normalized_name, source_id)
       VALUES ($1, $2, 'Calle Prueba', 'calle prueba', $3)`,
      [streetId, `surface-${streetId}`, baselineSourceId],
    );
    for (const [id, wkt] of segments) {
      await pool.query(
        `INSERT INTO street_segments (id, source_segment_id, street_id, road_class, geometry, source_id)
         VALUES ($1, $2, $3, 'LOCAL', ST_GeomFromText($4, 4326), $5)`,
        [id, `surface-segment-${id}`, streetId, wkt, baselineSourceId],
      );
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM street_segment_information WHERE segment_id = ANY($1::uuid[])', [
      [alongId, parallelId, crossingId],
    ]);
    await pool.query('DELETE FROM street_segments WHERE id = ANY($1::uuid[])', [
      [alongId, parallelId, crossingId],
    ]);
    await pool.query('DELETE FROM streets WHERE id = $1', [streetId]);
    await pool.query('DELETE FROM geographic_sources WHERE id = ANY($1::uuid[])', [
      [sourceId, baselineSourceId],
    ]);
    await pool.end();
  });

  it('assigns the line only to the segment it covers, not to parallel or crossing ones', async () => {
    const result = await replaceSourceSurfaces(pool, sourceId, [line]);
    const rows = await pool.query<{ segment_id: string; surface_type: string }>(
      'SELECT segment_id::text, surface_type::text FROM street_segment_surface_baseline WHERE source_id = $1::uuid',
      [sourceId],
    );
    expect(rows.rows.map((row) => row.segment_id)).toEqual([alongId]);
    expect(rows.rows[0]?.surface_type).toBe('GRANITE_COBBLESTONE');
    expect(result.matchedSegments).toBe(1);
    expect(result.bySurface).toEqual({ GRANITE_COBBLESTONE: 1 });
  });

  it('shows the base pavement in the map and lets the community value win', async () => {
    const repository = new DrizzleStreetScoreRepository(database);
    const bounds = { south: -34.601, north: -34.599, west: -58.401, east: -58.398 };
    const feature = async () =>
      (await repository.findConditionFeatures(bounds, 16, ['LOCAL'])).find(
        (item) => item.id === alongId,
      );

    expect((await feature())?.roadInformation).toMatchObject({
      surfaceType: 'GRANITE_COBBLESTONE',
    });

    await pool.query(
      `INSERT INTO street_segment_information (segment_id, surface_type, updated_at)
       VALUES ($1, 'CONCRETE', NOW())`,
      [alongId],
    );
    expect((await feature())?.roadInformation).toMatchObject({
      surfaceType: 'CONCRETE',
      surfaceSource: 'COMMUNITY',
    });
  });

  it('reimporting replaces only the base and never touches community data', async () => {
    await replaceSourceSurfaces(pool, sourceId, []);
    const base = await pool.query(
      'SELECT 1 FROM street_segment_surface_baseline WHERE source_id = $1::uuid',
      [sourceId],
    );
    expect(base.rowCount).toBe(0);
    const community = await pool.query<{ surface_type: string }>(
      'SELECT surface_type::text FROM street_segment_information WHERE segment_id = $1::uuid',
      [alongId],
    );
    expect(community.rows[0]?.surface_type).toBe('CONCRETE');
  });
});
