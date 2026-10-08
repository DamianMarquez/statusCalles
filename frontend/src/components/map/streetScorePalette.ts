export const STREET_SCORE_STOPS = [
  { label: 'Muy malo', color: '#7f1d1d', max: 0 },
  { label: 'Malo', color: '#b42318', max: 29 },
  { label: 'Regular', color: '#e66b18', max: 54 },
  { label: 'En observación', color: '#d49a00', max: 79 },
  { label: 'Bueno', color: '#17804a', max: 100 },
] as const;

export function streetScoreColor(score: number): string {
  return STREET_SCORE_STOPS.find((stop) => score <= stop.max)?.color ?? '#17804a';
}
