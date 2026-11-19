import { randomUUID } from 'node:crypto';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';
import { getTestDatabaseUrl } from './config.js';
import {
  DrizzleStreetTileRepository,
  STREET_TILE_LAYER,
} from './street-tile-repository.drizzle.js';

const { database, pool } = createDatabase(getTestDatabaseUrl());
const repository = new DrizzleStreetTileRepository(database);
const sourceId = randomUUID();
const baselineSourceId = randomUUID();
const streetId = randomUUID();
const scoredId = randomUUID();
const plainId = randomUUID();

// Un punto de prueba lejos del microcentro para no mezclarse con calles reales.
const LNG = -58.5;
const LAT = -34.68;

function tileFor(zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((LNG + 180) / 360) * n);
  const latRad = (LAT * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

async function features(
  zoom: number,
  classes: Array<'PRIMARY' | 'SECONDARY' | 'LOCAL' | 'UNKNOWN'>,
) {
  const { x, y } = tileFor(zoom);
  const buffer = await repository.findTile(zoom, x, y, classes);
  if (!buffer) return [];
  const layer = new VectorTile(new PbfReader(buffer)).layers[STREET_TILE_LAYER];
  if (!layer) return [];
  const result: Array<Record<string, unknown>> = [];
  for (let index = 0; index < layer.length; index += 1) {
    result.push(layer.feature(index).properties as Record<string, unknown>);
  }
  return result;
}

const result = (score: number, level: string, reports: number) => ({
  score,
  level,
  hasEvidence: true,
  confidence: 'MEDIUM',
  factors: [],
  metrics: { reports, activeReports: reports },
  availability: { status: 'BLOCKED', signals: ['ROAD_BLOCKED'] },
  calculatedAt: '2026-10-08T11:00:00.000Z',
});

describe('street tiles PostGIS integration', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO geographic_sources (id, slug, name, provider, dataset, source_url, license)
       VALUES ($1, $2, 'Tile test', 'tests', 'tiles', 'https://example.invalid', 'test'),
              ($3, 'osm-surface-tile-test', 'x', 'tests', 'x', 'https://example.invalid', 'test')`,
      [baselineSourceId, `tile-test-${baselineSourceId}`, sourceId],
    );
    await pool.query(
      `INSERT INTO streets (id, source_code, official_name, normalized_name, source_id)
       VALUES ($1, $2, 'Calle Tile', 'calle tile', $3)`,
      [streetId, `tile-${streetId}`, baselineSourceId],
    );
    await pool.query(
      `INSERT INTO street_segments (id, source_segment_id, street_id, road_class, geometry, source_id)
       VALUES ($1, $3, $5, 'LOCAL', ST_GeomFromText('MULTILINESTRING((-58.5005 -34.68, -58.4995 -34.68))', 4326), $6),
              ($2, $4, $5, 'LOCAL', ST_GeomFromText('MULTILINESTRING((-58.5005 -34.6803, -58.4995 -34.6803))', 4326), $6)`,
      [
        scoredId,
        plainId,
        `tile-seg-${scoredId}`,
        `tile-seg-${plainId}`,
        streetId,
        baselineSourceId,
      ],
    );
    await pool.query(
      `INSERT INTO street_segment_scores (segment_id, street_id, score, level, has_evidence, result, calculated_at)
       VALUES ($1, $2, 38, 'BAD', true, $3::jsonb, NOW())`,
      [scoredId, streetId, JSON.stringify(result(38, 'BAD', 2))],
    );
    await pool.query(
      `INSERT INTO street_scores (street_id, score, level, has_evidence, result, calculated_at)
       VALUES ($1, 61, 'ACCEPTABLE', true, $2::jsonb, NOW())`,
      [streetId, JSON.stringify(result(61, 'ACCEPTABLE', 5))],
    );
    await pool.query(
      `INSERT INTO street_segment_information (segment_id, surface_type, surface_condition, special_treatments, updated_at)
       VALUES ($1, 'CONCRETE', 'POOR', ARRAY['BUS_STOP']::special_treatment[], NOW())`,
      [scoredId],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM street_segment_information WHERE segment_id = ANY($1::uuid[])', [
      [scoredId, plainId],
    ]);
    await pool.query('DELETE FROM street_scores WHERE street_id = $1', [streetId]);
    await pool.query('DELETE FROM street_segments WHERE id = ANY($1::uuid[])', [
      [scoredId, plainId],
    ]);
    await pool.query('DELETE FROM streets WHERE id = $1', [streetId]);
    await pool.query('DELETE FROM geographic_sources WHERE id = ANY($1::uuid[])', [
      [baselineSourceId, sourceId],
    ]);
    await pool.end();
  });

  it('uses each segment score and its pavement at segment zoom', async () => {
    const all = await features(16, ['LOCAL']);
    const scored = all.find((feature) => feature.id === scoredId);
    const plain = all.find((feature) => feature.id === plainId);
    expect(scored).toMatchObject({
      sid: streetId,
      n: 'Calle Tile',
      rc: 'LOCAL',
      sc: 38,
      lv: 'BAD',
      ev: true,
      ar: 2,
      av: 'BLOCKED',
      st: 'CONCRETE',
      ss: 'COMMUNITY',
      sco: 'POOR',
      tr: 'BUS_STOP',
    });
    expect(Number(scored?.len)).toBeGreaterThan(60);
    expect(plain).toMatchObject({ ev: false });
    expect(plain?.sc).toBeUndefined();
  });

  it('uses the street score for every segment of the street below segment zoom', async () => {
    const all = await features(14, ['LOCAL']);
    const ours = all.filter((feature) => feature.sid === streetId);
    expect(ours).toHaveLength(2);
    for (const feature of ours)
      expect(feature).toMatchObject({ sc: 61, lv: 'ACCEPTABLE', ev: true });
  });

  it('respects the requested road classes and returns nothing when none match', async () => {
    expect((await features(14, ['PRIMARY'])).some((feature) => feature.sid === streetId)).toBe(
      false,
    );
    expect(await features(14, [])).toEqual([]);
  });
});
