import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from '../../database/database.js';
import { parseFeatureCollection } from '../../../modules/streets/domain/geography.js';
import type { MobilityInfrastructureType } from '../../../modules/mobility/domain/mobility-data.js';

export const cabaMobilityDatasets = {
  ciclovias: {
    slug: 'gcba-ciclovias',
    name: 'Ciclovías oficiales de CABA',
    dataset: 'Ciclovías (GeoJSON)',
    type: 'BIKE_LANE' as const,
    url: 'https://data.buenosaires.gob.ar/dataset/ciclovias/resource/9119760a-a35a-4808-ac04-1fc0f668edaa/download',
  },
  metrobus: {
    slug: 'gcba-metrobus-corredores',
    name: 'Corredores Metrobus de CABA',
    dataset: 'Metrobus / Recorrido de Metrobus (GeoJSON)',
    type: 'METROBUS_CORRIDOR' as const,
    url: 'https://data.buenosaires.gob.ar/dataset/metrobus/resource/ae8e105d-4899-4ff7-b06a-cf3485dae99d/download',
  },
  metrobusStops: {
    slug: 'gcba-metrobus-paradas',
    name: 'Estaciones Metrobus de CABA',
    dataset: 'Metrobus / Estaciones de Metrobus (GeoJSON)',
    type: 'METROBUS_STOP' as const,
    url: 'https://data.buenosaires.gob.ar/dataset/metrobus/resource/13f6872a-f726-4094-b426-bc55d7b63efe/download',
  },
} as const;

export type CabaMobilityDataset = keyof typeof cabaMobilityDatasets;

function parseMobilityCollection(input: unknown) {
  if (
    input &&
    typeof input === 'object' &&
    (input as { type?: unknown }).type === 'FeatureCollection' &&
    Array.isArray((input as { features?: unknown }).features) &&
    (input as { features: unknown[] }).features.length === 0
  )
    throw new Error('Empty mobility dataset; existing records were preserved.');
  return parseFeatureCollection(input);
}

export function validateCabaMobilityUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid official mobility dataset URL.');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    !['data.buenosaires.gob.ar', 'cdn.buenosaires.gob.ar'].includes(parsed.hostname)
  )
    throw new Error('Mobility dataset URL must use an official GCBA HTTPS host.');
  return parsed.toString();
}

interface NormalizedItem {
  externalId: string;
  name: string;
  type: MobilityInfrastructureType;
  geometry: { type: 'Point' | 'MultiLineString'; coordinates: unknown };
  properties: Record<string, unknown>;
}

function field(properties: Record<string, unknown>, ...names: string[]): unknown {
  const key = Object.keys(properties).find((candidate) =>
    names.some((name) => candidate.toLowerCase() === name.toLowerCase()),
  );
  return key ? properties[key] : undefined;
}

function validPosition(position: unknown): position is number[] {
  return (
    Array.isArray(position) &&
    position.length >= 2 &&
    typeof position[0] === 'number' &&
    Number.isFinite(position[0]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    typeof position[1] === 'number' &&
    Number.isFinite(position[1]) &&
    position[1] >= -90 &&
    position[1] <= 90
  );
}

export function normalizeMobilityFeature(
  feature: ReturnType<typeof parseFeatureCollection>['features'][number],
  dataset: CabaMobilityDataset,
): NormalizedItem {
  const source = cabaMobilityDatasets[dataset];
  const properties = feature.properties;
  const externalId = field(properties, 'id');
  let geometry: NormalizedItem['geometry'];
  if (!feature.geometry) throw new Error('Mobility feature has no geometry.');
  if (source.type === 'METROBUS_STOP' && feature.geometry.type === 'Point') {
    if (!validPosition(feature.geometry.coordinates))
      throw new Error('Invalid Metrobus stop coordinate.');
    geometry = { type: 'Point', coordinates: feature.geometry.coordinates };
  } else if (feature.geometry.type === 'LineString') {
    const line = feature.geometry.coordinates;
    if (!Array.isArray(line) || line.length < 2 || !line.every(validPosition))
      throw new Error('Invalid mobility line geometry.');
    geometry = { type: 'MultiLineString', coordinates: [line] };
  } else if (feature.geometry.type === 'MultiLineString') {
    const lines = feature.geometry.coordinates;
    if (
      !Array.isArray(lines) ||
      lines.length === 0 ||
      !lines.every((line) => Array.isArray(line) && line.length >= 2 && line.every(validPosition))
    )
      throw new Error('Invalid mobility multiline geometry.');
    geometry = { type: 'MultiLineString', coordinates: lines };
  } else {
    throw new Error(`Unsupported ${dataset} geometry type.`);
  }

  const rawName = field(properties, 'nombre', 'METROBUS', 'nombre_par', 'NOM_MAPA');
  const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : source.name;
  const stableData = JSON.stringify({ properties, geometry });
  const key =
    typeof externalId === 'string' || typeof externalId === 'number'
      ? String(externalId)
      : createHash('sha256').update(stableData).digest('hex');
  return { externalId: key, name: name.slice(0, 200), type: source.type, geometry, properties };
}

export function normalizeMobilityFeatures(
  features: ReturnType<typeof parseFeatureCollection>['features'],
  dataset: CabaMobilityDataset,
): NormalizedItem[] {
  const items = features.map((feature, index) => {
    try {
      return normalizeMobilityFeature(feature, dataset);
    } catch (error) {
      throw new Error(
        `Invalid mobility feature ${index + 1}: ${error instanceof Error ? error.message : 'invalid feature'}`,
      );
    }
  });
  if (items.length === 0)
    throw new Error('Empty mobility dataset; existing records were preserved.');
  if (new Set(items.map((item) => item.externalId)).size !== items.length)
    throw new Error('Mobility dataset contains duplicate external identifiers.');
  return items;
}

export async function fetchMobilityGeoJson(
  url: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 60_000,
) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Official mobility dataset returned HTTP ${response.status}.`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 100 * 1024 * 1024) throw new Error('Mobility dataset exceeds the 100 MB limit.');
  const content = await response.text();
  if (Buffer.byteLength(content) > 100 * 1024 * 1024)
    throw new Error('Mobility dataset exceeds the 100 MB limit.');
  let input: unknown;
  try {
    input = JSON.parse(content);
  } catch {
    throw new Error('Mobility dataset is not valid GeoJSON.');
  }
  return parseMobilityCollection(input);
}

async function readCollection(url: string, localFile?: string) {
  if (!localFile) return fetchMobilityGeoJson(url);
  const content = await readFile(localFile, 'utf8');
  let input: unknown;
  try {
    input = JSON.parse(content);
  } catch {
    throw new Error('Mobility dataset is not valid GeoJSON.');
  }
  return parseMobilityCollection(input);
}

export class CabaMobilityDatasetImporter {
  constructor(private readonly database: StreetStatusDatabase) {}

  async sync(dataset: CabaMobilityDataset, options: { localFile?: string; url?: string } = {}) {
    const source = cabaMobilityDatasets[dataset];
    const url = validateCabaMobilityUrl(
      options.url ??
        process.env[
          `CABA_${dataset.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_URL`
        ] ??
        source.url,
    );
    const sourceRows = await this.database.execute<{ id: string }>(sql`
      INSERT INTO geographic_sources (slug, name, provider, dataset, source_url, license, last_status, last_attempt_at, updated_at)
      VALUES (${source.slug}, ${source.name}, 'Gobierno de la Ciudad Autónoma de Buenos Aires', ${source.dataset}, ${url}, 'CC-BY-2.5-AR', 'PROCESSING', NOW(), NOW())
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, dataset = EXCLUDED.dataset,
        source_url = EXCLUDED.source_url, last_status = 'PROCESSING', last_attempt_at = NOW(),
        last_error = NULL, updated_at = NOW()
      RETURNING id::text AS id
    `);
    const sourceId = sourceRows.rows[0]?.id;
    if (!sourceId) throw new Error('Could not register official mobility source.');

    try {
      const collection = await readCollection(url, options.localFile);
      const items = normalizeMobilityFeatures(collection.features, dataset);

      await this.database.transaction(async (tx) => {
        for (let offset = 0; offset < items.length; offset += 100) {
          const batch = items.slice(offset, offset + 100);
          const values = batch.map(
            (item) => sql`(
            ${item.externalId}, ${item.type}, ${item.name}, ${JSON.stringify(item.geometry)},
            ${JSON.stringify(item.properties)}::jsonb
          )`,
          );
          await tx.execute(sql`
            INSERT INTO mobility_infrastructure (source_id, external_id, type, name, geometry, metadata, updated_at)
            SELECT ${sourceId}::uuid, v.external_id, v.type, v.name,
              ST_SetSRID(ST_GeomFromGeoJSON(v.geometry::text), 4326), v.metadata, NOW()
            FROM (VALUES ${sql.join(values, sql`, `)}) AS v(external_id, type, name, geometry, metadata)
            ON CONFLICT (source_id, external_id) DO UPDATE SET type = EXCLUDED.type,
              name = EXCLUDED.name, geometry = EXCLUDED.geometry, metadata = EXCLUDED.metadata, updated_at = NOW()
          `);
        }
        const ids = items.map((item) => item.externalId);
        await tx.execute(sql`
          DELETE FROM mobility_infrastructure
          WHERE source_id = ${sourceId}::uuid AND NOT (external_id = ANY(${ids}))
        `);
        await tx.execute(sql`
          UPDATE geographic_sources SET last_status = 'SUCCEEDED', last_sync_at = NOW(),
            last_record_count = ${items.length}, last_error = NULL, updated_at = NOW()
          WHERE id = ${sourceId}::uuid
        `);
      });
      return items.length;
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'Unknown import error').slice(
        0,
        4000,
      );
      await this.database.execute(sql`
        UPDATE geographic_sources SET last_status = 'FAILED', last_error = ${message}, updated_at = NOW()
        WHERE id = ${sourceId}::uuid
      `);
      throw error;
    }
  }
}
