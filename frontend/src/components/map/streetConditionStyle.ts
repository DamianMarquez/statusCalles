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
    weight: detail ? (hasScore ? 3 : 2.5) : hasScore ? 2.25 : 1.75,
    opacity: 0.92,
    ...(availability === 'BLOCKED' ? { dashArray: '7 5' } : {}),
  };
}
