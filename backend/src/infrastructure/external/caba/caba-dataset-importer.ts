import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from '../../database/database.js';
import {
  normalizeCommuneFeature,
  normalizeNeighborhoodFeature,
  normalizeStreetFeature,
  normalizeGeographicName,
  parseFeatureCollection,
  type GeoJsonFeatureCollection,
  type NormalizedBoundary,
  type NormalizedStreetSegment,
} from '../../../modules/streets/domain/geography.js';

export const cabaDatasets = {
  streets: {
    slug: 'gcba-callejero',
    name: 'Callejero oficial de CABA',
    dataset: 'Calles / Callejero (GeoJson)',
    url: 'https://data.buenosaires.gob.ar/dataset/calles/resource/2941f731-0a2e-4391-b8c9-a2912a80c081/download',
  },
  neighborhoods: {
    slug: 'gcba-barrios',
    name: 'Barrios oficiales de CABA',
    dataset: 'Barrios (GeoJSON)',
    url: 'https://data.buenosaires.gob.ar/dataset/barrios/resource/1c3d185b-fdc9-474b-b41b-9bd960a3806e/download',
  },
  communes: {
    slug: 'gcba-comunas',
    name: 'Comunas oficiales de CABA',
    dataset: 'Comunas (GeoJSON)',
    url: 'https://data.buenosaires.gob.ar/dataset/comunas/resource/b0b627ac-5b47-4574-89ac-6999b63598ee/download',
  },
} as const;

type DatasetKind = keyof typeof cabaDatasets;
type ImportSource = (typeof cabaDatasets)[DatasetKind];

async function loadDataset(
  sourceUrl: string,
  localFile?: string,
): Promise<GeoJsonFeatureCollection> {
  let text: string;
  if (localFile) {
    text = await readFile(localFile, 'utf8');
  } else {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Dataset download failed with HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > 250 * 1024 * 1024)
      throw new Error('Dataset exceeds the 250 MB import limit.');
    text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > 250 * 1024 * 1024) {
      throw new Error('Dataset exceeds the 250 MB import limit.');
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Dataset is not valid JSON/GeoJSON.');
  }
  return parseFeatureCollection(parsed);
}

function normalizeAll<T>(
  features: GeoJsonFeatureCollection['features'],
  convert: (feature: GeoJsonFeatureCollection['features'][number]) => T,
): T[] {
  return features.map((feature, index) => {
    try {
      return convert(feature);
    } catch (error) {
      throw new Error(
        `Invalid feature ${index + 1}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  });
}

function ensureUnique(keys: string[], label: string): void {
  if (new Set(keys).size !== keys.length)
    throw new Error(`The dataset contains duplicate ${label} identifiers.`);
}

async function sourceId(
  database: StreetStatusDatabase,
  kind: DatasetKind,
  sourceUrl: string,
): Promise<string> {
  const source = cabaDatasets[kind];
  const result = await database.execute<{ id: string }>(sql`
    INSERT INTO geographic_sources (slug, name, provider, dataset, source_url, license, last_status, last_attempt_at, updated_at)
    VALUES (${source.slug}, ${source.name}, 'Gobierno de la Ciudad Autónoma de Buenos Aires', ${source.dataset}, ${sourceUrl}, 'CC-BY-2.5-AR', 'PROCESSING', NOW(), NOW())
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, provider = EXCLUDED.provider, dataset = EXCLUDED.dataset,
      source_url = EXCLUDED.source_url, license = EXCLUDED.license,
      last_status = 'PROCESSING', last_attempt_at = NOW(), last_error = NULL, updated_at = NOW()
    RETURNING id::text AS id
  `);
  const row = result.rows[0];
  if (!row) throw new Error('Could not register the official CABA source.');
  return row.id;
}

async function markFailure(
  database: StreetStatusDatabase,
  kind: DatasetKind,
  error: unknown,
): Promise<void> {
  const message = (error instanceof Error ? error.message : 'Unknown import error').slice(0, 4000);
  await database.execute(sql`
    UPDATE geographic_sources SET last_status = 'FAILED', last_error = ${message}, updated_at = NOW()
    WHERE slug = ${cabaDatasets[kind].slug}
  `);
}

async function importBoundaries(
  database: StreetStatusDatabase,
  kind: 'communes' | 'neighborhoods',
  source: ImportSource,
  features: NormalizedBoundary[],
  rawFeatures: GeoJsonFeatureCollection['features'],
  sourceRecordId: string,
): Promise<number> {
  return database.transaction(async (tx) => {
    if (kind === 'communes') {
      for (let offset = 0; offset < features.length; offset += 100) {
        const batch = features.slice(offset, offset + 100);
        const raw = rawFeatures.slice(offset, offset + batch.length);
        const values = batch.map(
          (item, index) => sql`(
          ${item.sourceId}, ${item.name},
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(item.geometry)}), 4326)),
          ${sourceRecordId}::uuid, ${JSON.stringify(raw[index]?.properties ?? {})}::jsonb, NOW()
        )`,
        );
        const inserted = await tx.execute(sql`
          INSERT INTO communes (id, name, geometry, source_id, metadata, updated_at)
          VALUES ${sql.join(values, sql`, `)}
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, geometry = EXCLUDED.geometry,
            source_id = EXCLUDED.source_id, metadata = EXCLUDED.metadata, updated_at = NOW()
          RETURNING id
        `);
        if (inserted.rows.length !== batch.length)
          throw new Error('Some commune geometries were rejected.');
        await tx
          .execute(
            sql`
          SELECT 1 FROM communes
          WHERE id IN (${sql.join(
            batch.map((item) => sql`${item.sourceId}`),
            sql`, `,
          )})
            AND NOT ST_IsValid(geometry)
        `,
          )
          .then((result) => {
            if (result.rows.length > 0)
              throw new Error('A commune geometry is invalid in PostGIS.');
          });
      }
    } else {
      for (let offset = 0; offset < features.length; offset += 100) {
        const batch = features.slice(offset, offset + 100);
        const raw = rawFeatures.slice(offset, offset + batch.length);
        const values = batch.map(
          (item, index) => sql`(
          ${item.sourceId}, ${item.name}, ${item.normalizedName}, ${item.communeNumber},
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(item.geometry)}), 4326)),
          ${sourceRecordId}::uuid, ${JSON.stringify(raw[index]?.properties ?? {})}::jsonb, NOW()
        )`,
        );
        const inserted = await tx.execute(sql`
          INSERT INTO neighborhoods (id, name, normalized_name, commune_id, geometry, source_id, metadata, updated_at)
          VALUES ${sql.join(values, sql`, `)}
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, normalized_name = EXCLUDED.normalized_name,
            commune_id = EXCLUDED.commune_id, geometry = EXCLUDED.geometry, source_id = EXCLUDED.source_id,
            metadata = EXCLUDED.metadata, updated_at = NOW()
          RETURNING id
        `);
        if (inserted.rows.length !== batch.length)
          throw new Error('Some neighborhood geometries were rejected.');
        const geometryCheck = await tx.execute(sql`
          SELECT id FROM neighborhoods
          WHERE id IN (${sql.join(
            batch.map((item) => sql`${item.sourceId}`),
            sql`, `,
          )})
            AND NOT ST_IsValid(geometry)
        `);
        if (geometryCheck.rows.length > 0)
          throw new Error('A neighborhood geometry is invalid in PostGIS.');
      }
    }
    return features.length;
  });
}

async function importStreetSegments(
  database: StreetStatusDatabase,
  features: NormalizedStreetSegment[],
  rawFeatures: GeoJsonFeatureCollection['features'],
  sourceRecordId: string,
): Promise<number> {
  return database.transaction(async (tx) => {
    const streets = new Map<string, NormalizedStreetSegment>();
    for (const segment of features) {
      const key = `${segment.sourceCode}\u0000${segment.normalizedName}`;
      if (!streets.has(key)) streets.set(key, segment);
    }
    const streetValues = [...streets.values()].map(
      (street) => sql`(
      ${street.sourceCode}, ${street.officialName}, ${street.normalizedName},
      ${sourceRecordId}::uuid, ${JSON.stringify(street.properties)}::jsonb, NOW()
    )`,
    );
    for (let offset = 0; offset < streetValues.length; offset += 200) {
      await tx.execute(sql`
        INSERT INTO streets (source_code, official_name, normalized_name, source_id, metadata, updated_at)
        VALUES ${sql.join(streetValues.slice(offset, offset + 200), sql`, `)}
        ON CONFLICT (source_code, normalized_name) DO UPDATE SET official_name = EXCLUDED.official_name,
          source_id = EXCLUDED.source_id,
          metadata = EXCLUDED.metadata, updated_at = NOW()
      `);
    }

    for (let offset = 0; offset < features.length; offset += 100) {
      const batch = features.slice(offset, offset + 100);
      const raw = rawFeatures.slice(offset, offset + batch.length);
      const values = batch.map(
        (segment, index) => sql`(
        ${segment.sourceSegmentId}, ${segment.sourceCode}, ${segment.normalizedName}, ${segment.neighborhoodName ? normalizeGeographicName(segment.neighborhoodName) : null},
        ${segment.communeNumber}, ${JSON.stringify(segment.geometry)}, ${sourceRecordId}::uuid,
        ${JSON.stringify(raw[index]?.properties ?? segment.properties)}::jsonb
      )`,
      );
      const result = await tx.execute(sql`
        INSERT INTO street_segments (source_segment_id, street_id, neighborhood_id, commune_id, geometry, source_id, metadata, updated_at)
        SELECT v.source_segment_id, s.id, n.id, c.id,
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(v.geometry_json::text), 4326)), v.source_id, v.metadata, NOW()
        FROM (VALUES ${sql.join(values, sql`, `)}) AS v(source_segment_id, source_code, normalized_name, neighborhood_name, commune_number, geometry_json, source_id, metadata)
        JOIN streets s ON s.source_code = v.source_code AND s.normalized_name = v.normalized_name
        LEFT JOIN neighborhoods n ON n.normalized_name = v.neighborhood_name
        LEFT JOIN communes c ON c.id = v.commune_number::integer
        ON CONFLICT (source_segment_id) DO UPDATE SET street_id = EXCLUDED.street_id,
          neighborhood_id = EXCLUDED.neighborhood_id, commune_id = EXCLUDED.commune_id,
          geometry = EXCLUDED.geometry, source_id = EXCLUDED.source_id, metadata = EXCLUDED.metadata, updated_at = NOW()
        RETURNING source_segment_id
      `);
      if (result.rows.length !== batch.length) {
        throw new Error(
          'Some street segments could not be associated with their official street or boundary data.',
        );
      }
    }
    return features.length;
  });
}

export class CabaDatasetImporter {
  constructor(private readonly database: StreetStatusDatabase) {}

  async import(
    kind: DatasetKind,
    options: { url?: string; localFile?: string } = {},
  ): Promise<number> {
    const source = cabaDatasets[kind];
    const sourceUrl = options.url ?? process.env[`CABA_${kind.toUpperCase()}_URL`] ?? source.url;
    const sourceRecordId = await sourceId(this.database, kind, sourceUrl);
    try {
      const collection = await loadDataset(sourceUrl, options.localFile);
      let count: number;
      if (kind === 'streets') {
        const records = normalizeAll(collection.features, normalizeStreetFeature);
        ensureUnique(
          records.map((item) => item.sourceSegmentId),
          'street segment',
        );
        count = await importStreetSegments(
          this.database,
          records,
          collection.features,
          sourceRecordId,
        );
      } else {
        const records = normalizeAll(
          collection.features,
          kind === 'communes' ? normalizeCommuneFeature : normalizeNeighborhoodFeature,
        );
        ensureUnique(
          records.map((item) => String(item.sourceId)),
          kind === 'communes' ? 'commune' : 'neighborhood',
        );
        count = await importBoundaries(
          this.database,
          kind,
          source,
          records,
          collection.features,
          sourceRecordId,
        );
      }
      await this.database.execute(sql`
        UPDATE geographic_sources SET last_status = 'SUCCEEDED', last_sync_at = NOW(),
          last_record_count = ${count}, last_error = NULL, updated_at = NOW()
        WHERE id = ${sourceRecordId}::uuid
      `);
      return count;
    } catch (error) {
      await markFailure(this.database, kind, error);
      throw error;
    }
  }
}
