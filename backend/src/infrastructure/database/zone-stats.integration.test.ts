import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';
import { getTestDatabaseUrl } from './config.js';
import { DrizzleZoneStatsRepository } from './zone-stats-repository.drizzle.js';
import { computeZoneMetrics } from '../../modules/zones/domain/zone-metrics.js';

const { database, pool } = createDatabase(getTestDatabaseUrl());
// Tablas propias de la prueba: así no se agregan comunas ni barrios falsos a los reales
// (otros tests cuentan 15 comunas y 48 barrios en la misma base).
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const communeTable = `zone_test_communes_${suffix}`;
const neighborhoodTable = `zone_test_neighborhoods_${suffix}`;
const repository = new DrizzleZoneStatsRepository(database, {
  commune: communeTable,
  neighborhood: neighborhoodTable,
});

// Un cuadrado de ~1 km en una zona del GBA que no se cruza con las comunas reales.
const WEST = -58.55;
const SOUTH = -34.95;
const EAST = -58.54;
const NORTH = -34.94;
const COMMUNE_ID = 9901;
const NEIGHBORHOOD_ID = 99901;

const sourceId = randomUUID();
const marksSource = randomUUID();
const streetId = randomUUID();
const asphaltId = randomUUID();
const cobbleId = randomUUID();
const outsideId = randomUUID();
const reportIds = [randomUUID(), randomUUID(), randomUUID()];
const marker = `zone-${randomUUID()}`;

const polygon = `MULTIPOLYGON(((${WEST} ${SOUTH}, ${EAST} ${SOUTH}, ${EAST} ${NORTH}, ${WEST} ${NORTH}, ${WEST} ${SOUTH})))`;
const baselineResult = (score: number) => ({
  score,
  level: 'ACCEPTABLE',
  hasEvidence: true,
  confidence: 'LOW',
  factors: [],
  metrics: { reports: 1, activeReports: 1 },
  availability: { status: 'UNKNOWN', signals: [] },
  calculatedAt: '2026-10-08T11:00:00.000Z',
});

describe('zone stats PostGIS integration', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO geographic_sources (id, slug, name, provider, dataset, source_url, license)
       VALUES ($1, $2, 'zone test', 'tests', 'x', 'https://example.invalid', 'test'),
              ($3, $4, 'marks test', 'tests', 'x', 'https://example.invalid', 'test')`,
      [sourceId, `zones-${marker}`, marksSource, `marks-${marker}`],
    );
    for (const table of [communeTable, neighborhoodTable]) {
      await pool.query(
        `CREATE TABLE ${table} (id integer PRIMARY KEY, name text NOT NULL, commune_id integer,
           geometry geometry(MultiPolygon, 4326) NOT NULL)`,
      );
    }
    await pool.query(
      `INSERT INTO ${communeTable} (id, name, geometry) VALUES ($1, 'Comuna de prueba', ST_GeomFromText($2, 4326))`,
      [COMMUNE_ID, polygon],
    );
    await pool.query(
      `INSERT INTO ${neighborhoodTable} (id, name, commune_id, geometry)
       VALUES ($1, 'Barrio de prueba', $2, ST_GeomFromText($3, 4326))`,
      [NEIGHBORHOOD_ID, COMMUNE_ID, polygon],
    );
    await pool.query(
      `INSERT INTO streets (id, source_code, official_name, normalized_name, source_id)
       VALUES ($1, $2, 'Calle Zona', 'calle zona', $3)`,
      [streetId, `zone-${streetId}`, sourceId],
    );
    // Dos tramos adentro (sin commune_id: la zona se asigna por ubicación) y uno afuera.
    await pool.query(
      `INSERT INTO street_segments (id, source_segment_id, street_id, road_class, geometry, source_id)
       VALUES ($1, $4, $7, 'LOCAL', ST_GeomFromText('MULTILINESTRING((-58.549 -34.945, -58.545 -34.945))', 4326), $8),
              ($2, $5, $7, 'LOCAL', ST_GeomFromText('MULTILINESTRING((-58.549 -34.943, -58.546 -34.943))', 4326), $8),
              ($3, $6, $7, 'LOCAL', ST_GeomFromText('MULTILINESTRING((-58.300 -34.945, -58.296 -34.945))', 4326), $8)`,
      [
        asphaltId,
        cobbleId,
        outsideId,
        `seg-${asphaltId}`,
        `seg-${cobbleId}`,
        `seg-${outsideId}`,
        streetId,
        sourceId,
      ],
    );
    await pool.query(
      `INSERT INTO street_segment_surface_baseline (segment_id, source_id, surface_type, match_ratio)
       VALUES ($1, $3, 'ASPHALT', 1), ($2, $3, 'GRANITE_COBBLESTONE', 1)`,
      [asphaltId, cobbleId, sourceId],
    );
    await pool.query(
      `INSERT INTO street_segment_scores (segment_id, street_id, score, level, has_evidence, result, calculated_at)
       VALUES ($1, $2, 40, 'BAD', true, $3::jsonb, NOW())`,
      [asphaltId, streetId, JSON.stringify(baselineResult(40))],
    );
    // Se insertan directo: el importador descarta lo que cae fuera de las comunas reales.
    await pool.query(
      `INSERT INTO mobility_infrastructure (source_id, external_id, type, name, geometry, metadata)
       VALUES ($1, $2, 'SPEED_BUMP', '', ST_SetSRID(ST_MakePoint(-58.547, -34.944), 4326), '{}'::jsonb),
              ($1, $3, 'PUBLIC_WORK', 'Obra de prueba', ST_SetSRID(ST_MakePoint(-58.546, -34.9445), 4326),
               '{"startDate":"2025-01-01","endDate":"2999-12-31"}'::jsonb)`,
      [marksSource, `${marker}-bump`, `${marker}-work`],
    );
    // Un reporte crítico activo, uno alto resuelto (no cuenta) y una obra reportada.
    await pool.query(
      `INSERT INTO street_reports (id, type, severity, description, location, status)
       VALUES ($1, 'POTHOLE', 4, 'zone test', ST_SetSRID(ST_MakePoint(-58.547, -34.9441), 4326)::geography, 'ACTIVE'),
              ($2, 'POTHOLE', 3, 'zone test', ST_SetSRID(ST_MakePoint(-58.547, -34.9442), 4326)::geography, 'RESOLVED'),
              ($3, 'ROAD_WORK', 2, 'zone test', ST_SetSRID(ST_MakePoint(-58.547, -34.9443), 4326)::geography, 'ACTIVE')`,
      reportIds,
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM street_reports WHERE id = ANY($1::uuid[])', [reportIds]);
    await pool.query('DELETE FROM mobility_infrastructure WHERE source_id = $1::uuid', [
      marksSource,
    ]);
    await pool.query('DELETE FROM street_segments WHERE id = ANY($1::uuid[])', [
      [asphaltId, cobbleId, outsideId],
    ]);
    await pool.query('DELETE FROM streets WHERE id = $1', [streetId]);
    for (const table of [communeTable, neighborhoodTable]) {
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await pool.query('DELETE FROM geographic_sources WHERE id = ANY($1::uuid[])', [
      [sourceId, marksSource],
    ]);
    await pool.end();
  });

  it('adds up streets, pavement, scores, marks and community reports of a commune', async () => {
    const zones = await repository.findZones('commune');
    const ours = zones.find((zone) => zone.id === COMMUNE_ID);
    expect(ours).toBeDefined();
    expect(ours?.segments).toBe(2);
    expect(ours?.totalKm).toBeGreaterThan(0.5);
    expect(Object.keys(ours?.surfaceKm ?? {}).sort()).toEqual(['ASPHALT', 'GRANITE_COBBLESTONE']);
    expect(ours?.scoredSegments).toBe(1);
    expect(ours?.scoreSum).toBe(40);
    expect(ours?.calming).toEqual({ SPEED_BUMP: 1 });
    expect(ours?.publicWorks).toBe(1);
    expect(ours?.reportedWorks).toBe(1);
    expect(ours?.criticalReports).toBe(1);
    // El reporte alto está resuelto: no cuenta como activo.
    expect(ours?.highReports).toBe(0);
    expect(ours?.activeReports).toBe(2);
    expect(ours?.reportsByType).toEqual({ POTHOLE: 1, ROAD_WORK: 1 });
    expect(computeZoneMetrics(ours!).surface.dominant?.type).toBe('ASPHALT');
  });

  it('does the same for neighborhoods and keeps their commune', async () => {
    const zones = await repository.findZones('neighborhood');
    const ours = zones.find((zone) => zone.id === NEIGHBORHOOD_ID);
    expect(ours).toMatchObject({ communeId: COMMUNE_ID, segments: 2, publicWorks: 1 });
  });

  it('returns polygons as GeoJSON', async () => {
    const ours = (await repository.findZones('commune')).find((zone) => zone.id === COMMUNE_ID);
    expect((ours?.geometry as { type: string }).type).toMatch(/Polygon/);
  });
});
