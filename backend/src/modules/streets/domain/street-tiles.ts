import type { StreetRoadClass } from './street-road-class.js';

/** El mapa descarga tiles hasta este zoom; más cerca se sobre-escala el mismo tile. */
export const STREET_TILE_MAX_ZOOM = 16;
/** Desde este zoom el tile trae el puntaje de cada tramo; antes, el de la calle completa. */
export const STREET_TILE_SEGMENT_ZOOM = 16;

export const STREET_TILE_ZOOM_CONFIG = {
  primaryMinZoom: 10,
  secondaryMinZoom: 11,
  localMinZoom: 13,
} as const;

/** Clases viales incluidas en un tile según su zoom (vacío = no hay calles a ese zoom). */
export function roadClassesForTileZoom(zoom: number): StreetRoadClass[] {
  if (zoom < STREET_TILE_ZOOM_CONFIG.primaryMinZoom) return [];
  if (zoom < STREET_TILE_ZOOM_CONFIG.secondaryMinZoom) return ['PRIMARY'];
  if (zoom < STREET_TILE_ZOOM_CONFIG.localMinZoom) return ['PRIMARY', 'SECONDARY'];
  return ['PRIMARY', 'SECONDARY', 'LOCAL', 'UNKNOWN'];
}

export function isValidTileCoordinate(zoom: number, x: number, y: number): boolean {
  if (!Number.isInteger(zoom) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (zoom < 0 || zoom > 20) return false;
  const limit = 2 ** zoom;
  return x >= 0 && y >= 0 && x < limit && y < limit;
}
