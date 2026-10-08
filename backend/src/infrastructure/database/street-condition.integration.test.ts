import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';
import { getTestDatabaseUrl } from './config.js';
import { DrizzleStreetScoreRepository } from './street-score-repository.drizzle.js';
import { StreetScoreService } from '../../modules/streets/application/street-score-service.js';

const { database, pool } = createDatabase(getTestDatabaseUrl());
const sourceId = randomUUID();
const streetId = randomUUID();
const segmentId = randomUUID();
const outsideSegmentId = randomUUID();
const reportId = randomUUID();
const sourceSlug = `condition-test-${randomUUID()}`;
const service = new StreetScoreService(new DrizzleStreetScoreRepository(database));

describe('Street condition PostGIS integration', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO geographic_sources (id, slug, name, provider, dataset, source_url, license)
       VALUES ($1, $2, 'Test source', 'Street Status tests', 'Street condition', 'https://example.invalid', 'test')`,
      [sourceId, sourceSlug],
    );
    await pool.query(
      `INSERT INTO streets (id, source_code, official_name, normalized_name, source_id)
       VALUES ($1, $2, 'Avenida Ejemplo', 'avenida ejemplo', $3)`,
      [streetId, `condition-${streetId}`, sourceId],
    );
    await pool.query(
      `INSERT INTO street_segments (id, source_segment_id, street_id, geometry, source_id)
       VALUES
         ($1, $3, $4, ST_GeomFromText('MULTILINESTRING((-58.400 -34.600, -58.390 -34.600))', 4326), $5),
         ($2, $6, $4, ST_GeomFromText('MULTILINESTRING((-58.600 -34.600, -58.590 -34.600))', 4326), $5)`,
      [
        segmentId,
        outsideSegmentId,
        `segment-${segmentId}`,
        streetId,
        sourceId,
        `segment-${outsideSegmentId}`,
      ],
    );
    await pool.query(
      `INSERT INTO street_reports (id, street_id, street_segment_id, type, severity, description, location)
       VALUES ($1, $2, $3, 'POTHOLE', 3, 'Test physical evidence', ST_SetSRID(ST_MakePoint(-58.395, -34.600), 4326)::geography)`,
      [reportId, streetId, segmentId],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM street_reports WHERE id = $1', [reportId]);
    await pool.query('DELETE FROM street_segments WHERE id = ANY($1::uuid[])', [
      [segmentId, outsideSegmentId],
    ]);
    await pool.query('DELETE FROM streets WHERE id = $1', [streetId]);
    await pool.query('DELETE FROM geographic_sources WHERE id = $1', [sourceId]);
    await pool.end();
  });

  it('uses the viewport GiST query, returns official GeoJSON, aggregates by street at low zoom, and applies level filters', async () => {
    const bounds = { south: -34.61, north: -34.59, west: -58.41, east: -58.38 };
    const close = await service.findConditionInViewport(bounds, 16);
    const ourCloseFeature = close.features.find((feature) => feature.id === segmentId);
    expect(ourCloseFeature).toMatchObject({
      id: segmentId,
      geometry: { type: 'LineString' },
      properties: {
        targetType: 'SEGMENT',
        streetName: 'Avenida Ejemplo',
        hasEvidence: true,
        level: 'UNCOMFORTABLE',
      },
    });

    expect(close.features.some((feature) => feature.id === outsideSegmentId)).toBe(false);
    const far = await service.findConditionInViewport(bounds, 12);
    const ourFarFeature = far.features.find((feature) => feature.id === streetId);
    expect(ourFarFeature).toMatchObject({
      id: streetId,
      geometry: { type: 'MultiLineString' },
      properties: { targetType: 'STREET', score: 57, hasEvidence: true },
    });

    const filtered = await service.findConditionInViewport(bounds, 16, ['CRITICAL']);
    expect(filtered.features.some((feature) => feature.id === segmentId)).toBe(false);
  });
});
