import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Pool } from 'pg';
import { normalizeGeographicName } from '../../../modules/streets/domain/geography.js';
import { mapOsmSurface } from './osm-surface-mapping.js';
import {
  replaceSourceSurfaces,
  type SurfaceLine,
  type SurfaceMatchResult,
} from './surface-matcher.js';

export const OSM_SURFACE_SOURCE = {
  slug: 'osm-surface',
  name: 'OpenStreetMap: pavimento (surface)',
  provider: 'OpenStreetMap contributors',
  dataset: 'highway + surface',
  license: 'ODbL 1.0',
} as const;

/** Servidores públicos de Overpass, en orden de preferencia (el primero que responda). */
const DEFAULT_OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
/** Caja que rodea a CABA; el cruce con el callejero descarta lo que queda afuera. */
const CABA_BOUNDS = { south: -34.7052, west: -58.5315, north: -34.5265, east: -58.3351 };
/** La consulta se parte en una grilla: los servidores públicos rechazan consultas grandes. */
const TILE_ROWS = 3;
const TILE_COLUMNS = 4;

interface OverpassWay {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Solo calzadas. Veredas (`footway`), escaleras, ciclovías y sendas también llevan `surface`,
 * pero van a pocos metros del eje de la calle y falsearían el pavimento de la calzada.
 */
const ROADWAY_HIGHWAYS = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'pedestrian',
]);

export function isRoadwayHighway(highway: string | undefined): boolean {
  if (!highway) return false;
  return ROADWAY_HIGHWAYS.has(highway.replace(/_link$/, ''));
}

const ROADWAY_FILTER =
  '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian)(_link)?$';

export function buildOverpassQuery(bounds: Bounds = CABA_BOUNDS): string {
  const box = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `[out:json][timeout:180];\nway["highway"~"${ROADWAY_FILTER}"]["surface"](${box});\nout tags geom;`;
}

export function splitBounds(
  bounds: Bounds = CABA_BOUNDS,
  rows = TILE_ROWS,
  columns = TILE_COLUMNS,
): Bounds[] {
  const tiles: Bounds[] = [];
  const height = (bounds.north - bounds.south) / rows;
  const width = (bounds.east - bounds.west) / columns;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push({
        south: bounds.south + row * height,
        north: bounds.south + (row + 1) * height,
        west: bounds.west + column * width,
        east: bounds.west + (column + 1) * width,
      });
    }
  }
  return tiles;
}

export interface ParsedOsmWays {
  total: number;
  lines: SurfaceLine[];
}

export function parseOverpassWays(input: unknown): ParsedOsmWays {
  const elements = (input as { elements?: OverpassWay[] } | null)?.elements;
  if (!Array.isArray(elements)) throw new Error('La respuesta de Overpass no tiene "elements".');
  const lines: SurfaceLine[] = [];
  let total = 0;
  for (const element of elements) {
    if (element.type !== 'way' || !element.geometry) continue;
    // También filtra archivos viejos o exportados a mano que traigan veredas y sendas.
    if (!isRoadwayHighway(element.tags?.highway)) continue;
    total += 1;
    const surfaceType = mapOsmSurface(element.tags?.surface);
    if (!surfaceType) continue;
    const name = element.tags?.name;
    lines.push({
      ref: `way/${element.id}`,
      normalizedName: name ? normalizeGeographicName(name) : null,
      surfaceType,
      coordinates: element.geometry.map((point) => [point.lon, point.lat]),
    });
  }
  return { total, lines };
}

export interface OsmImportSummary extends SurfaceMatchResult {
  ways: number;
  mappedWays: number;
}

export class OsmSurfaceImporter {
  constructor(private readonly pool: Pool) {}

  async import(options: { localFile?: string; cacheDir?: string } = {}): Promise<OsmImportSummary> {
    const overpassUrls = process.env.OVERPASS_URL
      ? [process.env.OVERPASS_URL]
      : DEFAULT_OVERPASS_URLS;
    const overpassUrl = overpassUrls[0] ?? '';
    const source = await this.pool.query<{ id: string }>(
      `INSERT INTO geographic_sources (slug, name, provider, dataset, source_url, license, last_status, last_attempt_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING', NOW(), NOW())
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, provider = EXCLUDED.provider, dataset = EXCLUDED.dataset,
         source_url = EXCLUDED.source_url, license = EXCLUDED.license,
         last_status = 'PROCESSING', last_attempt_at = NOW(), last_error = NULL, updated_at = NOW()
       RETURNING id::text AS id`,
      [
        OSM_SURFACE_SOURCE.slug,
        OSM_SURFACE_SOURCE.name,
        OSM_SURFACE_SOURCE.provider,
        OSM_SURFACE_SOURCE.dataset,
        overpassUrl,
        OSM_SURFACE_SOURCE.license,
      ],
    );
    const sourceId = source.rows[0]?.id;
    if (!sourceId) throw new Error('No se pudo registrar la fuente de OpenStreetMap.');
    try {
      const raw = await this.load(overpassUrls, options);
      const parsed = parseOverpassWays(raw);
      const result = await replaceSourceSurfaces(this.pool, sourceId, parsed.lines);
      await this.pool.query(
        `UPDATE geographic_sources SET last_status = 'SUCCEEDED', last_sync_at = NOW(),
           last_record_count = $2, updated_at = NOW() WHERE id = $1::uuid`,
        [sourceId, result.matchedSegments],
      );
      return { ...result, ways: parsed.total, mappedWays: parsed.lines.length };
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'Error de importación').slice(
        0,
        4000,
      );
      await this.pool.query(
        `UPDATE geographic_sources SET last_status = 'FAILED', last_error = $2, updated_at = NOW() WHERE id = $1::uuid`,
        [sourceId, message],
      );
      throw error;
    }
  }

  private async load(
    overpassUrls: string[],
    options: { localFile?: string; cacheDir?: string },
  ): Promise<unknown> {
    if (options.localFile) return JSON.parse(await readFile(options.localFile, 'utf8')) as unknown;
    const byId = new Map<number, OverpassWay>();
    const tiles = splitBounds();
    for (const [index, tile] of tiles.entries()) {
      const elements = await this.fetchTile(overpassUrls, tile);
      for (const element of elements) byId.set(element.id, element);
      console.info(`Overpass: zona ${index + 1}/${tiles.length}, ${byId.size} vías acumuladas.`);
    }
    const merged = { elements: [...byId.values()] };
    // Se guarda lo descargado para poder reimportar sin volver a consultar el servicio público.
    const cachePath = resolve(options.cacheDir ?? 'data/osm', 'overpass-surface.json');
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(merged));
    return merged;
  }

  /** Pide una zona probando cada servidor, con reintentos y espera creciente. */
  private async fetchTile(overpassUrls: string[], tile: Bounds): Promise<OverpassWay[]> {
    let lastError: unknown = new Error('No hay servidores de Overpass configurados.');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (const url of overpassUrls) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'street-status-importer',
            },
            body: new URLSearchParams({ data: buildOverpassQuery(tile) }),
            signal: AbortSignal.timeout(200_000),
          });
          if (!response.ok) throw new Error(`Overpass (${url}) respondió ${response.status}.`);
          const body = (await response.json()) as { elements?: OverpassWay[] };
          return body.elements ?? [];
        } catch (error) {
          lastError = error;
        }
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 5_000 * (attempt + 1)));
    }
    throw lastError;
  }
}
