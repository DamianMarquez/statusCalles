export const REPORT_TYPE_OPTIONS = [
  {
    value: 'POTHOLE',
    label: 'Bache',
    pluralLabel: 'Baches',
    popupLabel: 'BACHE',
    icon: '🕳️',
    markerClass: 'pothole',
  },
  {
    value: 'FLOOD',
    label: 'Inundación',
    pluralLabel: 'Inundaciones',
    popupLabel: 'INUNDACIÓN',
    icon: '🌊',
    markerClass: 'flooding',
  },
  {
    value: 'ROAD_DAMAGE',
    label: 'Daño de calzada',
    pluralLabel: 'Pavimento deteriorado',
    popupLabel: 'PAVIMENTO DETERIORADO',
    icon: '🛣️',
    markerClass: 'road-damage',
  },
  {
    value: 'ROAD_IRREGULARITY',
    label: 'Irregularidad u ondulación',
    pluralLabel: 'Irregularidades u ondulaciones',
    popupLabel: 'IRREGULARIDAD U ONDULACIÓN',
    icon: '〰️',
    markerClass: 'road-damage',
  },
  {
    value: 'ROAD_ELEVATION',
    label: 'Elevación anómala',
    pluralLabel: 'Elevaciones anómalas',
    popupLabel: 'ELEVACIÓN ANÓMALA',
    icon: '⬆️',
    markerClass: 'road-damage',
  },
  {
    value: 'ROAD_SUBSIDENCE',
    label: 'Hundimiento',
    pluralLabel: 'Hundimientos',
    popupLabel: 'HUNDIMIENTO',
    icon: '⬇️',
    markerClass: 'road-damage',
  },
  {
    value: 'ROAD_BLOCKED',
    label: 'Calle bloqueada',
    pluralLabel: 'Calles bloqueadas',
    popupLabel: 'CALLE BLOQUEADA',
    icon: '⛔',
    markerClass: 'road-blocked',
  },
  {
    value: 'ROAD_WORK',
    label: 'Obra',
    pluralLabel: 'Obras',
    popupLabel: 'OBRA',
    icon: '🚧',
    markerClass: 'construction',
  },
  {
    value: 'TRAFFIC_LIGHT',
    label: 'Semáforo roto',
    pluralLabel: 'Semáforos',
    popupLabel: 'SEMÁFORO',
    icon: '🚦',
    markerClass: 'traffic-light',
  },
  {
    value: 'OTHER',
    label: 'Otro',
    pluralLabel: 'Otros',
    popupLabel: 'OTRO PROBLEMA',
    icon: '⚠️',
    markerClass: 'other',
  },
] as const;

export type ReportType = (typeof REPORT_TYPE_OPTIONS)[number]['value'];

export const REPORT_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Activos', icon: '🟠' },
  { value: 'STALE', label: 'Antiguos', icon: '⚪' },
  { value: 'RESOLVED', label: 'Resueltos', icon: '🟢' },
] as const;

export type ReportStatus = (typeof REPORT_STATUS_OPTIONS)[number]['value'];

export const REPORT_SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'CRITICAL', label: 'Crítica' },
] as const;

export type ReportSeverity = (typeof REPORT_SEVERITY_OPTIONS)[number]['value'];
