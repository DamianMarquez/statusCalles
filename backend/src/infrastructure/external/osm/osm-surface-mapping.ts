import type { SurfaceType } from '../../../modules/streets/domain/road-information.js';

/**
 * Traduce la etiqueta `surface` de OpenStreetMap a nuestros tipos de pavimento.
 * OSM no distingue asfalto especial, granitullo ni permeable: eso queda a cargo de la
 * comunidad. Los valores sin equivalente (tierra, ripio, etc.) devuelven null.
 */
const OSM_SURFACE_TO_TYPE: Record<string, SurfaceType> = {
  asphalt: 'ASPHALT',
  concrete: 'CONCRETE',
  'concrete:plates': 'CONCRETE',
  'concrete:lanes': 'CONCRETE',
  sett: 'GRANITE_COBBLESTONE',
  cobblestone: 'GRANITE_COBBLESTONE',
  granite: 'GRANITE_COBBLESTONE',
  paving_stones: 'INTERLOCKING_PAVER',
};

export function mapOsmSurface(surface: string | undefined | null): SurfaceType | null {
  if (!surface) return null;
  // OSM admite varios valores separados por ";": se usa el primero.
  const first = surface.split(';')[0]?.trim().toLowerCase() ?? '';
  return OSM_SURFACE_TO_TYPE[first] ?? null;
}
