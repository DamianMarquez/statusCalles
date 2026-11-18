export const STREET_CONDITION_LEVELS = [
  { value: 'EXCELLENT', label: 'Excelente', range: '90–100', color: '#3d853b' },
  { value: 'GOOD', label: 'Buena', range: '75–89', color: '#9f9315' },
  { value: 'ACCEPTABLE', label: 'Aceptable', range: '60–74', color: '#db870a' },
  { value: 'UNCOMFORTABLE', label: 'Incómoda', range: '45–59', color: '#e06218' },
  { value: 'BAD', label: 'Mala', range: '30–44', color: '#c23718' },
  { value: 'VERY_BAD', label: 'Muy mala', range: '15–29', color: '#a62119' },
  { value: 'CRITICAL', label: 'Crítica', range: '0–14', color: '#8b1e1c' },
] as const;

export type StreetScoreLevel = (typeof STREET_CONDITION_LEVELS)[number]['value'];
export const NO_STREET_CONDITION_COLOR = '#7b8490';

export function streetConditionLevel(value: string) {
  return STREET_CONDITION_LEVELS.find((level) => level.value === value);
}

export function streetConditionColor(level: StreetScoreLevel | null): string {
  return level
    ? (streetConditionLevel(level)?.color ?? NO_STREET_CONDITION_COLOR)
    : NO_STREET_CONDITION_COLOR;
}
