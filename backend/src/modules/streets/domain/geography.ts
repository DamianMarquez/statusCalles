export interface GeoJsonFeature {
  type: 'Feature';
  id?: string | number;
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface NormalizedStreetSegment {
  sourceSegmentId: string;
  sourceCode: string;
  officialName: string;
  normalizedName: string;
  geometry: { type: 'MultiLineString'; coordinates: number[][][] };
  roadClass: StreetRoadClass;
  properties: Record<string, unknown>;
  neighborhoodName: string | null;
  communeNumber: number | null;
}

export interface NormalizedBoundary {
  sourceId: number;
  name: string;
  normalizedName: string;
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
  communeNumber?: number;
}

export function normalizeGeographicName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es-AR');
}

function property(properties: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const match = Object.entries(properties).find(
      ([candidate]) => candidate.toLowerCase() === key.toLowerCase(),
    );
    if (match && match[1] !== null && match[1] !== undefined && match[1] !== '') return match[1];
  }
  return undefined;
}

function scalarString(value: unknown, label: string): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') {
    throw new Error(`Invalid ${label} in official CABA dataset.`);
  }
  return String(value).trim();
}

function positiveInteger(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error(`Invalid ${label} in official CABA dataset.`);
  return number;
}

function isPosition(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function isLine(value: unknown): value is number[][] {
  return Array.isArray(value) && value.length >= 2 && value.every(isPosition);
}

function isRing(value: unknown): value is number[][] {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) return false;
  const first = value[0]!;
  const last = value.at(-1)!;
  return first[0] === last[0] && first[1] === last[1];
}

function isPolygon(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

function normalizeLineGeometry(
  geometry: GeoJsonFeature['geometry'],
): NormalizedStreetSegment['geometry'] {
  if (!geometry) throw new Error('Street record is missing geometry.');
  if (geometry.type === 'LineString' && isLine(geometry.coordinates)) {
    return { type: 'MultiLineString', coordinates: [geometry.coordinates] };
  }
  if (
    geometry.type === 'MultiLineString' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.every(isLine)
  ) {
    return { type: 'MultiLineString', coordinates: geometry.coordinates };
  }
  throw new Error(`Unsupported or invalid street geometry: ${geometry.type}.`);
}

function normalizePolygonGeometry(
  geometry: GeoJsonFeature['geometry'],
): NormalizedBoundary['geometry'] {
  if (!geometry) throw new Error('Boundary record is missing geometry.');
  if (geometry.type === 'Polygon' && isPolygon(geometry.coordinates)) {
    return { type: 'MultiPolygon', coordinates: [geometry.coordinates] };
  }
  if (
    geometry.type === 'MultiPolygon' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.every(isPolygon)
  ) {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates };
  }
  throw new Error(`Unsupported or invalid boundary geometry: ${geometry.type}.`);
}

export function normalizeStreetFeature(feature: GeoJsonFeature): NormalizedStreetSegment {
  const properties = feature.properties ?? {};
  const sourceSegmentId = scalarString(
    property(properties, 'id') ?? feature.id,
    'street segment id',
  );
  const sourceCode = scalarString(property(properties, 'codigo'), 'street code');
  const officialName = scalarString(property(properties, 'nomoficial'), 'official street name');
  const barrio = property(properties, 'BARRIO', 'barrio');
  const commune = property(properties, 'COMUNA', 'comuna');
  let communeNumber: number | null = null;
  if (commune !== undefined && commune !== null && String(commune).trim() !== '') {
    const digits = String(commune).match(/\d+/)?.[0];
    if (digits) communeNumber = positiveInteger(digits, 'commune number');
  }
  return {
    sourceSegmentId,
    sourceCode,
    officialName,
    normalizedName: normalizeGeographicName(officialName),
    geometry: normalizeLineGeometry(feature.geometry),
    roadClass: normalizeStreetRoadClass(property(properties, 'red_jerarq')),
    properties,
    neighborhoodName: typeof barrio === 'string' && barrio.trim() ? barrio.trim() : null,
    communeNumber,
  };
}

export function normalizeNeighborhoodFeature(feature: GeoJsonFeature): NormalizedBoundary {
  const name = scalarString(property(feature.properties, 'nombre', 'name'), 'neighborhood name');
  return {
    sourceId: positiveInteger(property(feature.properties, 'id') ?? feature.id, 'neighborhood id'),
    name,
    normalizedName: normalizeGeographicName(name),
    communeNumber: positiveInteger(
      property(feature.properties, 'comuna'),
      'neighborhood commune number',
    ),
    geometry: normalizePolygonGeometry(feature.geometry),
  };
}

export function normalizeCommuneFeature(feature: GeoJsonFeature): NormalizedBoundary {
  const number = positiveInteger(
    property(feature.properties, 'comuna') ?? property(feature.properties, 'id') ?? feature.id,
    'commune number',
  );
  const name = `Comuna ${number}`;
  return {
    sourceId: number,
    name,
    normalizedName: normalizeGeographicName(name),
    geometry: normalizePolygonGeometry(feature.geometry),
  };
}

export function parseFeatureCollection(input: unknown): GeoJsonFeatureCollection {
  if (!input || typeof input !== 'object') throw new Error('Dataset is not a GeoJSON object.');
  const collection = input as Partial<GeoJsonFeatureCollection>;
  if (
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features) ||
    collection.features.length === 0
  ) {
    throw new Error('Expected a non-empty GeoJSON FeatureCollection.');
  }
  for (const [index, feature] of collection.features.entries()) {
    if (
      !feature ||
      feature.type !== 'Feature' ||
      !feature.properties ||
      typeof feature.properties !== 'object'
    ) {
      throw new Error(`Invalid GeoJSON feature at index ${index}.`);
    }
  }
  return collection as GeoJsonFeatureCollection;
}
import { normalizeStreetRoadClass, type StreetRoadClass } from './street-road-class.js';
