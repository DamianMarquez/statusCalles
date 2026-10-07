import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../database/database.js';
import { getTestDatabaseUrl } from '../../database/config.js';
import { CabaDatasetImporter, cabaDatasets } from './caba-dataset-importer.js';

const { database, pool } = createDatabase(getTestDatabaseUrl());
const source = cabaDatasets.streets;
const sourceSegmentId = `test-${randomUUID()}`;
const secondSourceSegmentId = `test-${randomUUID()}`;
const sourceCode = `test-${randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), 'street-status-caba-'));
const datasetFile = join(directory, 'streets.geojson');
let previousSource: Record<string, unknown> | undefined;

describe('CABA dataset importer', () => {
  beforeAll(async () => {
    const result = await pool.query(
      'SELECT id, last_status, last_record_count, last_sync_at, last_error FROM geographic_sources WHERE slug = $1',
      [source.slug],
    );
    previousSource = result.rows[0] as Record<string, unknown> | undefined;
    await writeFile(
      datasetFile,
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          ...['Calle de prueba', 'Colectora de prueba'].map((name, index) => ({
            type: 'Feature',
            properties: {
              id: index === 0 ? sourceSegmentId : secondSourceSegmentId,
              codigo: sourceCode,
              nomoficial: name,
              BARRIO: 'Nuñez',
              COMUNA: 13,
            },
            geometry: {
              type: 'LineString',
              coordinates: [
                [-58.46, -34.54],
                [-58.459, -34.539],
              ],
            },
          })),
        ],
      }),
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM street_segments WHERE source_segment_id = $1', [sourceSegmentId]);
    await pool.query('DELETE FROM street_segments WHERE source_segment_id = $1', [
      secondSourceSegmentId,
    ]);
    await pool.query('DELETE FROM streets WHERE source_code = $1', [sourceCode]);
    if (previousSource) {
      await pool.query(
        `UPDATE geographic_sources SET last_status = $2, last_record_count = $3,
          last_sync_at = $4, last_error = $5 WHERE id = $1`,
        [
          previousSource.id,
          previousSource.last_status,
          previousSource.last_record_count,
          previousSource.last_sync_at,
          previousSource.last_error,
        ],
      );
    } else {
      await pool.query('DELETE FROM geographic_sources WHERE slug = $1', [source.slug]);
    }
    await rm(directory, { recursive: true, force: true });
    await pool.end();
  });

  it('is idempotent and updates the same official segment instead of duplicating it', async () => {
    const importer = new CabaDatasetImporter(database);
    await expect(importer.import('streets', { localFile: datasetFile })).resolves.toBe(2);
    await expect(importer.import('streets', { localFile: datasetFile })).resolves.toBe(2);
    const segments = await pool.query(
      'SELECT count(*)::int AS count FROM street_segments WHERE source_segment_id = ANY($1)',
      [[sourceSegmentId, secondSourceSegmentId]],
    );
    const streets = await pool.query(
      'SELECT count(*)::int AS count FROM streets WHERE source_code = $1',
      [sourceCode],
    );
    expect(segments.rows[0]?.count).toBe(2);
    expect(streets.rows[0]?.count).toBe(2);
  });
});
