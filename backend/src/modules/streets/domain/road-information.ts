export const ROAD_TYPES = [
  'STREET',
  'AVENUE',
  'PASSAGE',
  'BOULEVARD',
  'HIGHWAY',
  'ACCESS',
] as const;
export type RoadType = (typeof ROAD_TYPES)[number];

export const SURFACE_TYPES = [
  'ASPHALT',
  'SPECIAL_ASPHALT',
  'CONCRETE',
  'CONCRETE_ASPHALT',
  'GRANITE_COBBLESTONE',
  'GRANITULLO',
  'CONCRETE_PAVER',
  'INTERLOCKING_PAVER',
  'PERMEABLE',
] as const;
export type SurfaceType = (typeof SURFACE_TYPES)[number];

export const SURFACE_CONDITIONS = ['GOOD', 'REGULAR', 'POOR', 'VERY_POOR'] as const;
export type SurfaceCondition = (typeof SURFACE_CONDITIONS)[number];

export const SPECIAL_TREATMENTS = [
  'NONE',
  'BUS_STOP',
  'SPEED_BUMP',
  'PEDESTRIAN_CROSSING',
  'INTERSECTION',
  'SHOULDER',
  'GUTTER',
  'CURB_GUTTER',
] as const;
export type SpecialTreatment = (typeof SPECIAL_TREATMENTS)[number];

export const ROAD_INFORMATION_CONFIRMATION_THRESHOLD = 3;

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

export interface RoadInformationHistoryEntry extends RoadInformationPatch {
  id: string;
  appliedAt: string;
}

export function validateRoadInformationPatch(value: unknown): value is RoadInformationPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const patch = value as Record<string, unknown>;
  const keys = Object.keys(patch);
  if (
    keys.length === 0 ||
    keys.some(
      (key) => !['roadType', 'surfaceType', 'surfaceCondition', 'specialTreatments'].includes(key),
    )
  )
    return false;
  if ('roadType' in patch && !ROAD_TYPES.includes(patch.roadType as RoadType)) return false;
  if ('surfaceType' in patch && !SURFACE_TYPES.includes(patch.surfaceType as SurfaceType))
    return false;
  if (
    'surfaceCondition' in patch &&
    !SURFACE_CONDITIONS.includes(patch.surfaceCondition as SurfaceCondition)
  )
    return false;
  if (
    'specialTreatments' in patch &&
    (!Array.isArray(patch.specialTreatments) ||
      patch.specialTreatments.length > SPECIAL_TREATMENTS.length ||
      patch.specialTreatments.some(
        (item) => !SPECIAL_TREATMENTS.includes(item as SpecialTreatment),
      ) ||
      new Set(patch.specialTreatments).size !== patch.specialTreatments.length)
  )
    return false;
  if (
    Array.isArray(patch.specialTreatments) &&
    patch.specialTreatments.includes('NONE') &&
    patch.specialTreatments.length > 1
  )
    return false;
  return true;
}
