import type { ZoneProperties } from '../../api/zonesApi.js';
import { SURFACE_TYPE_OPTIONS } from '../../api/roadInformationTypes.js';
import { NO_STREET_CONDITION_COLOR } from './streetConditionCatalog.js';
import { SCORE_RAMP_STOPS } from './streetLayerStyle.js';

/** Qué cuenta el color de cada zona. */
export type ZoneMetric = 'condition' | 'surface' | 'intervention' | 'critical';
export type ZoneSelection = 'none' | 'commune' | 'neighborhood';

export const ZONE_METRICS: ReadonlyArray<{ value: ZoneMetric; label: string }> = [
  { value: 'condition', label: 'Estado' },
  { value: 'surface', label: 'Pavimento' },
  { value: 'intervention', label: 'Obras y reductores' },
  { value: 'critical', label: 'Críticos' },
];

export const NO_DATA_ZONE_COLOR = NO_STREET_CONDITION_COLOR;

/** Escala de menos a más intervención vial (cinco quintiles). */
export const INTERVENTION_RAMP = ['#fdebd0', '#f8c471', '#eb984e', '#ca6f1e', '#873600'] as const;

/** Clases de reportes críticos: ninguno, pocos, varios, muchos. */
export const CRITICAL_CLASSES: ReadonlyArray<{ label: string; color: string }> = [
  { label: 'Sin críticos reportados', color: '#cfe6d6' },
  { label: '1 o 2', color: '#f4d35e' },
  { label: '3 a 5', color: '#f08c3a' },
  { label: '6 o más', color: '#b3261e' },
];

function hex(color: string): [number, number, number] {
  return [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** Color del degradado de estado (el mismo que las calles) para un puntaje de 0 a 100. */
export function scoreRampColor(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  for (let index = 1; index < SCORE_RAMP_STOPS.length; index += 1) {
    const [maxScore, maxColor] = SCORE_RAMP_STOPS[index]!;
    const [minScore, minColor] = SCORE_RAMP_STOPS[index - 1]!;
    if (clamped <= maxScore) {
      const t = (clamped - minScore) / (maxScore - minScore);
      const from = hex(minColor);
      const to = hex(maxColor);
      return `#${from
        .map((value, channel) =>
          Math.round(value + (to[channel]! - value) * t)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
    }
  }
  return SCORE_RAMP_STOPS[SCORE_RAMP_STOPS.length - 1]![1];
}

/** Cortes de quintiles (4 valores) entre las zonas; con pocos valores distintos se repiten. */
export function quintileBreaks(values: number[]): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return [0, 0, 0, 0];
  return [0.2, 0.4, 0.6, 0.8].map((fraction) => {
    const position = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
    return sorted[position]!;
  });
}

export function quintileIndex(value: number, breaks: number[]): number {
  let index = 0;
  for (const limit of breaks) if (value > limit) index += 1;
  return index;
}

export function surfaceColor(type: string | undefined): string {
  return SURFACE_TYPE_OPTIONS.find((item) => item.value === type)?.color ?? NO_DATA_ZONE_COLOR;
}

/** Color de relleno de una zona para la métrica elegida. `breaks` solo se usa en intervención. */
export function zoneColor(zone: ZoneProperties, metric: ZoneMetric, breaks: number[]): string {
  switch (metric) {
    case 'condition':
      return zone.condition.sufficient && zone.condition.avgScore !== null
        ? scoreRampColor(zone.condition.avgScore)
        : NO_DATA_ZONE_COLOR;
    case 'surface':
      return surfaceColor(zone.surface.dominant?.type);
    case 'intervention':
      return INTERVENTION_RAMP[quintileIndex(zone.intervention.index, breaks)]!;
    case 'critical':
      return CRITICAL_CLASSES[zone.critical.class]!.color;
  }
}
