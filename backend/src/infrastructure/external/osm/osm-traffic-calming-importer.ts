import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Pool } from 'pg';
import {
  markSourceFailed,
  markSourceSucceeded,
  registerSource,
  replaceInfrastructurePoints,
  type InfrastructurePoint,
} from '../infrastructure-points.js';
import { boundsToOverpass, fetchOverpassElements, overpassUrlsFromEnv } from './overpass-client.js';
import { mapTrafficCalming } from './traffic-calming-mapping.js';

export const OSM_TRAFFIC_CALMING_SOURCE = {
  slug: 'osm-traffic-calming',
  name: 'OpenStreetMap: reductores de velocidad',
  provider: 'OpenStreetMap contributors',
  dataset: 'traffic_calming',
  license: 'ODbL 1.0',
} as const;

export function buildTrafficCalmingQuery(): string {
  const box = boundsToOverpass();
  return `[out:json][timeout:120];\n(node["traffic_calming"](${box});way["traffic_calming"](${box}););\nout tags center;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface ParsedTrafficCalming {
  total: number;
  points: InfrastructurePoint[];
}

/** Puntos de reductores; las vías (poco frecuentes) se representan por su centro. */
export function parseTrafficCalming(input: unknown): ParsedTrafficCalming {
  const elements = (input as { elements?: OverpassElement[] } | null)?.elements;
  if (!Array.isArray(elements)) throw new Error('La respuesta de Overpass no tiene "elements".');
  const points: InfrastructurePoint[] = [];
  for (const element of elements) {
    const type = mapTrafficCalming(element.tags?.traffic_calming);
    if (!type) continue;
    const longitude = element.lon ?? element.center?.lon;
    const latitude = element.lat ?? element.center?.lat;
    if (typeof longitude !== 'number' || typeof latitude !== 'number') continue;
    const tags = element.tags ?? {};
    points.push({
      externalId: `${element.type}/${element.id}`,
      type,
      name: tags.name ?? '',
      longitude,
      latitude,
      metadata: {
        osm: `${element.type}/${element.id}`,
        calming: tags.traffic_calming,
        ...(tags.maxspeed ? { maxspeed: tags.maxspeed } : {}),
        ...(tags.direction ? { direction: tags.direction } : {}),
      },
    });
  }
  return { total: elements.length, points };
}

export interface TrafficCalmingSummary {
  elements: number;
  mapped: number;
  inserted: number;
  outsideCaba: number;
  byType: Record<string, number>;
}

export class OsmTrafficCalmingImporter {
  constructor(private readonly pool: Pool) {}

  async import(
    options: { localFile?: string; cacheDir?: string } = {},
  ): Promise<TrafficCalmingSummary> {
    const urls = overpassUrlsFromEnv();
    const sourceId = await registerSource(this.pool, {
      ...OSM_TRAFFIC_CALMING_SOURCE,
      sourceUrl: urls[0] ?? '',
    });
    try {
      const raw = await this.load(urls, options);
      const parsed = parseTrafficCalming(raw);
      const result = await replaceInfrastructurePoints(this.pool, sourceId, parsed.points);
      await markSourceSucceeded(this.pool, sourceId, result.inserted);
      const byType: Record<string, number> = {};
      for (const point of parsed.points) byType[point.type] = (byType[point.type] ?? 0) + 1;
      return {
        elements: parsed.total,
        mapped: parsed.points.length,
        inserted: result.inserted,
        outsideCaba: result.outsideCaba,
        byType,
      };
    } catch (error) {
      await markSourceFailed(this.pool, sourceId, error);
      throw error;
    }
  }

  private async load(
    urls: string[],
    options: { localFile?: string; cacheDir?: string },
  ): Promise<unknown> {
    if (options.localFile) return JSON.parse(await readFile(options.localFile, 'utf8')) as unknown;
    const elements = await fetchOverpassElements<OverpassElement>(buildTrafficCalmingQuery(), urls);
    const payload = { elements };
    // Se guarda lo descargado para poder reimportar sin volver a consultar el servicio público.
    const cachePath = resolve(options.cacheDir ?? 'data/osm', 'overpass-calming.json');
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(payload));
    return payload;
  }
}
