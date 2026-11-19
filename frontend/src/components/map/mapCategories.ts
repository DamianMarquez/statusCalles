import type { ReportType } from '../../api/reportCatalog.js';

/** Grupos de marcas del mapa: cada uno junta reportes de la comunidad y datos importados. */
export type MapCategory = 'works' | 'damage' | 'calming' | 'other';

export const MAP_CATEGORIES: ReadonlyArray<{
  value: MapCategory;
  label: string;
  color: string;
  icon: string;
  /** Tipos de reporte de la comunidad que pertenecen al grupo. */
  reportTypes: readonly ReportType[];
}> = [
  {
    value: 'works',
    label: 'Obras y cortes',
    color: '#e08a1e',
    icon: '🚧',
    reportTypes: ['ROAD_WORK', 'ROAD_BLOCKED'],
  },
  {
    value: 'damage',
    label: 'Baches y daños',
    color: '#c0392b',
    icon: '🕳️',
    reportTypes: [
      'POTHOLE',
      'ROAD_DAMAGE',
      'ROAD_IRREGULARITY',
      'ROAD_ELEVATION',
      'ROAD_SUBSIDENCE',
    ],
  },
  {
    value: 'calming',
    label: 'Reductores y badenes',
    color: '#7b3fb0',
    icon: '🔻',
    reportTypes: [],
  },
  {
    value: 'other',
    label: 'Otros reportes',
    color: '#5d7366',
    icon: '⚠️',
    reportTypes: ['FLOOD', 'TRAFFIC_LIGHT', 'OTHER'],
  },
];

export const ALL_MAP_CATEGORIES: MapCategory[] = MAP_CATEGORIES.map((item) => item.value);

export function categoryOfReportType(type: ReportType): MapCategory {
  return MAP_CATEGORIES.find((item) => item.reportTypes.includes(type))?.value ?? 'other';
}

/** Reductores de velocidad importados de OpenStreetMap. */
export const CALMING_TYPES: ReadonlyArray<{ value: string; label: string; color: string }> = [
  { value: 'SPEED_BUMP', label: 'Lomo de burro corto', color: '#7b3fb0' },
  { value: 'SPEED_HUMP', label: 'Lomo de burro ancho', color: '#a0522d' },
  { value: 'RAISED_CROSSING', label: 'Senda peatonal elevada', color: '#1f77b4' },
  { value: 'DIP', label: 'Badén', color: '#17a589' },
  { value: 'CUSHION', label: 'Cojín berlinés', color: '#d35400' },
  { value: 'NARROWING', label: 'Angostamiento o isleta', color: '#7f8c8d' },
  { value: 'RUMBLE_STRIP', label: 'Banda sonora', color: '#b7950b' },
];

export const PUBLIC_WORK_COLOR = '#e08a1e';

export function calmingLabel(type: string): string {
  return CALMING_TYPES.find((item) => item.value === type)?.label ?? 'Reductor de velocidad';
}
