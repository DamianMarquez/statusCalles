import { API_BASE_URL } from './apiBaseUrl.js';

export type ZoneLevel = 'commune' | 'neighborhood';

export interface ZoneProperties {
  id: number;
  name: string;
  level: ZoneLevel;
  communeId: number | null;
  totalKm: number;
  condition: {
    avgScore: number | null;
    level: string | null;
    scoredSegments: number;
    coveragePct: number;
    scoredKm: number;
    sufficient: boolean;
  };
  surface: {
    dominant: { type: string; pct: number } | null;
    top: Array<{ type: string; pct: number }>;
    knownPct: number;
    kmByType: Record<string, number>;
  };
  intervention: {
    index: number;
    publicWorks: number;
    reportedWorks: number;
    reportedCuts: number;
    calming: number;
    calmingByType: Record<string, number>;
    calmingPerKm: number;
  };
  critical: {
    critical: number;
    high: number;
    activeReports: number;
    class: 0 | 1 | 2 | 3;
  };
  segments: number;
  reportsByType: Record<string, number>;
}

export interface ZoneFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
    properties: ZoneProperties;
  }>;
}

/** Comunas o barrios con sus métricas calculadas por el servidor. */
export async function getZones(
  level: ZoneLevel,
  signal?: AbortSignal,
): Promise<ZoneFeatureCollection> {
  const response = await fetch(`${API_BASE_URL}/zones?level=${level}`, {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('No pudimos cargar las zonas del mapa.');
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { type?: unknown }).type !== 'FeatureCollection' ||
    !Array.isArray((body as { features?: unknown }).features)
  )
    throw new Error('El servicio devolvió zonas inválidas.');
  return body as ZoneFeatureCollection;
}
