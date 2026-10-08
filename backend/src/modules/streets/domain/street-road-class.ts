export const STREET_ROAD_CLASSES = ['PRIMARY', 'SECONDARY', 'LOCAL', 'UNKNOWN'] as const;
export type StreetRoadClass = (typeof STREET_ROAD_CLASSES)[number];
export const STREET_ROAD_CLASS_FILTERS = ['PRIMARY', 'SECONDARY', 'LOCAL'] as const;

const hierarchyMap: Record<string, StreetRoadClass> = {
  'VÍA TRONCAL': 'PRIMARY',
  'VIA TRONCAL': 'PRIMARY',
  'VÍA DISTRIBUIDORA PRINCIPAL': 'PRIMARY',
  'VIA DISTRIBUIDORA PRINCIPAL': 'PRIMARY',
  'VÍA DISTRIBUIDORA COMPLEMENTARIA': 'SECONDARY',
  'VIA DISTRIBUIDORA COMPLEMENTARIA': 'SECONDARY',
  'VÍA LOCAL': 'LOCAL',
  'VIA LOCAL': 'LOCAL',
};

export function normalizeStreetRoadClass(value: unknown): StreetRoadClass {
  if (typeof value !== 'string') return 'UNKNOWN';
  const normalized = value.trim().toLocaleUpperCase('es-AR');
  return hierarchyMap[normalized] ?? 'UNKNOWN';
}

export const STREET_LAYER_ZOOM_CONFIG = {
  secondaryMinZoom: 12,
  localMinZoom: 14,
  detailedSegmentMinZoom: 16,
} as const;

export function visibleRoadClassesAtZoom(zoom: number): StreetRoadClass[] {
  if (zoom < STREET_LAYER_ZOOM_CONFIG.secondaryMinZoom) return ['PRIMARY'];
  if (zoom < STREET_LAYER_ZOOM_CONFIG.localMinZoom) return ['PRIMARY', 'SECONDARY'];
  return ['PRIMARY', 'SECONDARY', 'LOCAL', 'UNKNOWN'];
}
