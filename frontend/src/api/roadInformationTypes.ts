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
  { value: 'ASPHALT', label: 'Asfalto', color: '#d17b37', dashArray: undefined },
  { value: 'SPECIAL_ASPHALT', label: 'Asfalto especial', color: '#a95e2b', dashArray: '8 3' },
  { value: 'CONCRETE', label: 'Hormigón', color: '#587e9e', dashArray: undefined },
  {
    value: 'CONCRETE_ASPHALT',
    label: 'Hormigón + carpeta asfáltica',
    color: '#815ba0',
    dashArray: '10 3',
  },
  {
    value: 'GRANITE_COBBLESTONE',
    label: 'Adoquín de granito',
    color: '#626c5e',
    dashArray: '3 3',
  },
  { value: 'GRANITULLO', label: 'Granitullo', color: '#986b54', dashArray: '2 4' },
  { value: 'CONCRETE_PAVER', label: 'Adoquín de hormigón', color: '#4f8f8b', dashArray: '7 3 2 3' },
  {
    value: 'INTERLOCKING_PAVER',
    label: 'Pavimento intertrabado',
    color: '#b06e8a',
    dashArray: '1 3',
  },
  { value: 'PERMEABLE', label: 'Pavimento permeable', color: '#5e9760', dashArray: '9 4' },
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

export interface RoadInformationProfile {
  roadType: RoadType | null;
  surfaceType: SurfaceType | null;
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
