export const ROAD_TYPE_OPTIONS = [
  { value: 'STREET', label: 'Calle' },
  { value: 'AVENUE', label: 'Avenida' },
  { value: 'PASSAGE', label: 'Pasaje' },
  { value: 'BOULEVARD', label: 'Boulevard' },
  { value: 'HIGHWAY', label: 'Autopista' },
  { value: 'ACCESS', label: 'Acceso' },
] as const;
export type RoadType = (typeof ROAD_TYPE_OPTIONS)[number]['value'];

export const SURFACE_TYPE_OPTIONS = [
  { value: 'ASPHALT', label: 'Asfalto', color: '#d17b37' },
  { value: 'SPECIAL_ASPHALT', label: 'Asfalto especial', color: '#a95e2b' },
  { value: 'CONCRETE', label: 'Hormigón', color: '#587e9e' },
  {
    value: 'CONCRETE_ASPHALT',
    label: 'Hormigón + carpeta asfáltica',
    color: '#815ba0',
  },
  {
    value: 'GRANITE_COBBLESTONE',
    label: 'Adoquín de granito',
    color: '#626c5e',
  },
  { value: 'GRANITULLO', label: 'Granitullo', color: '#986b54' },
  { value: 'CONCRETE_PAVER', label: 'Adoquín de hormigón', color: '#4f8f8b' },
  {
    value: 'INTERLOCKING_PAVER',
    label: 'Pavimento intertrabado',
    color: '#b06e8a',
  },
  { value: 'PERMEABLE', label: 'Pavimento permeable', color: '#5e9760' },
] as const;
export type SurfaceType = (typeof SURFACE_TYPE_OPTIONS)[number]['value'];

export const SURFACE_CONDITION_OPTIONS = [
  { value: 'GOOD', label: 'Bueno' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'POOR', label: 'Malo' },
  { value: 'VERY_POOR', label: 'Muy malo' },
] as const;
export type SurfaceCondition = (typeof SURFACE_CONDITION_OPTIONS)[number]['value'];

export const SPECIAL_TREATMENT_OPTIONS = [
  { value: 'NONE', label: 'Ninguno' },
  { value: 'BUS_STOP', label: 'Parada de colectivo' },
  { value: 'SPEED_BUMP', label: 'Lomo de burro' },
  { value: 'PEDESTRIAN_CROSSING', label: 'Cruce peatonal' },
  { value: 'INTERSECTION', label: 'Intersección' },
  { value: 'SHOULDER', label: 'Banquina' },
  { value: 'GUTTER', label: 'Cuneta' },
  { value: 'CURB_GUTTER', label: 'Cordón cuneta' },
] as const;
export type SpecialTreatment = (typeof SPECIAL_TREATMENT_OPTIONS)[number]['value'];

export interface RoadInformationPatch {
  roadType?: RoadType;
  surfaceType?: SurfaceType;
  surfaceCondition?: SurfaceCondition;
  specialTreatments?: SpecialTreatment[];
}

/** Origen del pavimento mostrado: la comunidad o una fuente base importada. */
export type SurfaceSource = 'COMMUNITY' | 'OSM' | 'GCBA';

export const SURFACE_SOURCE_LABELS: Record<SurfaceSource, string> = {
  COMMUNITY: 'Comunidad',
  OSM: 'OpenStreetMap',
  GCBA: 'Buenos Aires Data',
};

export interface RoadInformationProfile {
  roadType: RoadType | null;
  surfaceType: SurfaceType | null;
  surfaceSource?: SurfaceSource | null;
  surfaceCondition: SurfaceCondition | null;
  specialTreatments: SpecialTreatment[] | null;
  updatedAt: string | null;
}

export interface RoadInformationProposal {
  id: string;
  isAuthor: boolean;
  attributes: RoadInformationPatch;
  confirmations: number;
  requiredConfirmations: number;
  status: 'PROPOSED' | 'CONFIRMED';
  createdAt: string;
  confirmedAt: string | null;
  userHasConfirmed: boolean;
}

export interface SegmentRoadInformation {
  segmentId: string;
  streetId: string;
  streetName: string;
  profile: RoadInformationProfile;
  proposals: RoadInformationProposal[];
  history: Array<RoadInformationPatch & { id: string; appliedAt: string }>;
}
