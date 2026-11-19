import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import {
  markSourceFailed,
  markSourceSucceeded,
  registerSource,
  replaceInfrastructurePoints,
  type InfrastructurePoint,
} from '../infrastructure-points.js';
import { validateCabaMobilityUrl } from './mobility-dataset-importer.js';

export const BA_OBRAS_SOURCE = {
  slug: 'gcba-ba-obras',
  name: 'Obras públicas del GCBA (BA Obras)',
  provider: 'Gobierno de la Ciudad Autónoma de Buenos Aires',
  dataset: 'BA Obras',
  license: 'CC-BY-2.5-AR',
} as const;

const DEFAULT_URL =
  'https://data.buenosaires.gob.ar/dataset/ba-obras/resource/ef7449c8-1ba6-459b-9cd2-de6eda5ecc99/download';
const MAX_BYTES = 100 * 1024 * 1024;
// El portal rechaza clientes sin un User-Agent de navegador.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/** Marco de CABA, para descartar coordenadas mal cargadas. */
const CABA = { south: -34.7052, north: -34.5265, west: -58.5315, east: -58.3351 };

/** Lector de CSV con comillas dobles, separador configurable y BOM. */
export function parseCsv(text: string, separator = ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

function parseCoordinate(value: string | undefined): number | null {
  if (!value || value.trim().toUpperCase() === 'NA') return null;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return null;
  return value.trim().slice(0, 10);
}

export interface ParsedBaObras {
  rows: number;
  withoutCoordinates: number;
  outsideCaba: number;
  points: InfrastructurePoint[];
}

/**
 * Obras públicas con coordenadas. No se guardan CUIT, razón social ni montos: el mapa solo
 * necesita saber qué obra es, dónde, de qué organismo y cuándo.
 */
export function parseBaObras(text: string): ParsedBaObras {
  const table = parseCsv(text);
  const header = table[0]?.map((name) => name.trim().toUpperCase());
  if (!header) throw new Error('El CSV de BA Obras está vacío.');
  const column = (name: string) => header.indexOf(name);
  const required = ['OBRA_NOMBRE', 'LATITUD', 'LONGITUD'].map(column);
  if (required.some((position) => position < 0))
    throw new Error('El CSV de BA Obras no tiene las columnas esperadas.');
  const cell = (row: string[], name: string) => row[column(name)]?.trim() || undefined;

  const points: InfrastructurePoint[] = [];
  const seen = new Set<string>();
  let withoutCoordinates = 0;
  let outsideCaba = 0;
  const body = table.slice(1);
  for (const row of body) {
    const latitude = parseCoordinate(cell(row, 'LATITUD'));
    const longitude = parseCoordinate(cell(row, 'LONGITUD'));
    if (latitude === null || longitude === null) {
      withoutCoordinates += 1;
      continue;
    }
    if (
      latitude < CABA.south ||
      latitude > CABA.north ||
      longitude < CABA.west ||
      longitude > CABA.east
    ) {
      outsideCaba += 1;
      continue;
    }
    const name = cell(row, 'OBRA_NOMBRE') ?? 'Obra pública';
    const startDate = parseDate(cell(row, 'FECHA_INICIO'));
    const externalId = createHash('sha256')
      .update(`${name}|${startDate ?? ''}|${latitude}|${longitude}`)
      .digest('hex')
      .slice(0, 40);
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    points.push({
      externalId,
      type: 'PUBLIC_WORK',
      name: name.slice(0, 200),
      longitude,
      latitude,
      metadata: {
        jurisdiction: cell(row, 'NOMBRE_JURISDICCION') ?? null,
        startDate,
        endDate: parseDate(cell(row, 'FECHA_FIN')),
        address: cell(row, 'CALLE') ?? null,
      },
    });
  }
  return { rows: body.length, withoutCoordinates, outsideCaba, points };
}

export interface BaObrasSummary extends ParsedBaObras {
  inserted: number;
}

export class BaObrasImporter {
  constructor(private readonly pool: Pool) {}

  async import(options: { localFile?: string; url?: string } = {}): Promise<BaObrasSummary> {
    const url = validateCabaMobilityUrl(
      options.url ?? process.env.CABA_BA_OBRAS_URL ?? DEFAULT_URL,
    );
    const sourceId = await registerSource(this.pool, { ...BA_OBRAS_SOURCE, sourceUrl: url });
    try {
      const text = options.localFile
        ? await readFile(options.localFile, 'utf8')
        : await download(url);
      const parsed = parseBaObras(text);
      if (parsed.points.length === 0)
        throw new Error(
          'BA Obras no trae obras con coordenadas; se conservan los datos anteriores.',
        );
      const result = await replaceInfrastructurePoints(this.pool, sourceId, parsed.points);
      await markSourceSucceeded(this.pool, sourceId, result.inserted);
      return { ...parsed, inserted: result.inserted };
    } catch (error) {
      await markSourceFailed(this.pool, sourceId, error);
      throw error;
    }
  }
}

async function download(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/csv,*/*' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`BA Data respondió ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error('El CSV de BA Obras supera el tamaño permitido.');
  if (text.trimStart().startsWith('<'))
    throw new Error('BA Data devolvió una página en lugar del CSV (¿bloqueo del portal?).');
  return text;
}
