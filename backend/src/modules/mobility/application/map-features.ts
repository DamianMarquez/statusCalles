/** Categorías de marcas oficiales/OSM que el mapa puede pedir. */
export const MAP_FEATURE_CATEGORIES = ['calming', 'works'] as const;
export type MapFeatureCategory = (typeof MAP_FEATURE_CATEGORIES)[number];

/** Tipos guardados en `mobility_infrastructure` que pertenecen a cada categoría. */
export const MAP_FEATURE_TYPES: Record<MapFeatureCategory, readonly string[]> = {
  calming: [
    'SPEED_BUMP',
    'SPEED_HUMP',
    'RAISED_CROSSING',
    'DIP',
    'CUSHION',
    'NARROWING',
    'RUMBLE_STRIP',
  ],
  works: ['PUBLIC_WORK'],
};

export interface MapFeature {
  id: string;
  type: string;
  name: string;
  /** Slug de la fuente (osm-traffic-calming, gcba-ba-obras). */
  source: string;
  longitude: number;
  latitude: number;
  metadata: Record<string, unknown>;
}

export interface MapFeaturesRepository {
  findFeatures(categories: MapFeatureCategory[]): Promise<MapFeature[]>;
}

export function toFeatureCollection(features: MapFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((feature) => ({
      type: 'Feature' as const,
      id: feature.id,
      geometry: { type: 'Point' as const, coordinates: [feature.longitude, feature.latitude] },
      properties: {
        id: feature.id,
        type: feature.type,
        name: feature.name,
        source: feature.source,
        ...feature.metadata,
      },
    })),
  };
}
