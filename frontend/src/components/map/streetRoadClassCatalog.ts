import type { StreetRoadClass } from '../../api/streetScoreTypes.js';

export const STREET_ROAD_CLASS_OPTIONS: Array<{
  value: Exclude<StreetRoadClass, 'UNKNOWN'>;
  label: string;
}> = [
  { value: 'PRIMARY', label: 'Arterias principales' },
  { value: 'SECONDARY', label: 'Calles secundarias' },
  { value: 'LOCAL', label: 'Calles locales' },
];
