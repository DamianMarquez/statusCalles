import {
  NO_STREET_CONDITION_COLOR,
  streetConditionColor,
  type StreetScoreLevel,
} from './streetConditionCatalog.js';

export interface StreetConditionLineStyle {
  color: string;
  weight: number;
  opacity: number;
  dashArray?: string;
}

export function streetConditionLineStyle(
  level: string | null,
  zoom: number,
  availability: string,
): StreetConditionLineStyle {
  const hasScore = Boolean(level);
  const detail = zoom >= 15;
  return {
    color: level ? streetConditionColor(level as StreetScoreLevel) : NO_STREET_CONDITION_COLOR,
    weight: detail ? (hasScore ? 5 : 3.5) : hasScore ? 3.5 : 2.5,
    opacity: detail ? 0.9 : 0.74,
    ...(availability === 'BLOCKED' ? { dashArray: '7 5' } : {}),
  };
}
