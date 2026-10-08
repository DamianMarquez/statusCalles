export const STREET_CONDITION_LEVELS = [
  { value: 'EXCELLENT', label: 'Excelente', range: '90–100', color: '#15803d' },
  { value: 'GOOD', label: 'Buena', range: '75–89', color: '#65a30d' },
  { value: 'ACCEPTABLE', label: 'Aceptable', range: '60–74', color: '#ca8a04' },
  { value: 'UNCOMFORTABLE', label: 'Incómoda', range: '45–59', color: '#ea580c' },
  { value: 'BAD', label: 'Mala', range: '30–44', color: '#dc2626' },
  { value: 'VERY_BAD', label: 'Muy mala', range: '15–29', color: '#991b1b' },
  { value: 'CRITICAL', label: 'Crítica', range: '0–14', color: '#581c1c' },
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
