import { API_BASE_URL } from './apiBaseUrl.js';

export interface MapFeatureProperties {
  id: string;
  type: string;
  name: string;
  /** Slug de la fuente: osm-traffic-calming o gcba-ba-obras. */
  source: string;
  /** Solo en obras públicas. */
  jurisdiction?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  address?: string | null;
  /** Solo en reductores. */
  maxspeed?: string;
}

export interface MapFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: string;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: MapFeatureProperties;
  }>;
}

/** Marcas de toda la ciudad (reductores y obras públicas); cambian por importación, no al instante. */
export async function getMapFeatures(signal?: AbortSignal): Promise<MapFeatureCollection> {
  const response = await fetch(`${API_BASE_URL}/map-features?categories=calming,works`, {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('No pudimos cargar las marcas del mapa.');
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { type?: unknown }).type !== 'FeatureCollection' ||
    !Array.isArray((body as { features?: unknown }).features)
  )
    throw new Error('El servicio devolvió marcas inválidas.');
  return body as MapFeatureCollection;
}
