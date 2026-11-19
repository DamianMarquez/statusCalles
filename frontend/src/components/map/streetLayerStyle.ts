import type { ExpressionSpecification } from 'maplibre-gl';
import { NO_STREET_CONDITION_COLOR } from './streetConditionCatalog.js';

/** Degradado continuo por puntaje 0-100. */
export const SCORE_RAMP_STOPS: [number, string][] = [
  [0, '#7f1d1d'],
  [30, '#b42318'],
  [55, '#e66b18'],
  [75, '#d49a00'],
  [100, '#17804a'],
];

export const NO_DATA_COLOR = NO_STREET_CONDITION_COLOR;

/** Color por puntaje; gris cuando la calle no tiene evidencia. */
export const scoreColorExpression = [
  'case',
  ['all', ['==', ['get', 'ev'], true], ['==', ['typeof', ['get', 'sc']], 'number']],
  ['interpolate', ['linear'], ['get', 'sc'], ...SCORE_RAMP_STOPS.flat()],
  NO_DATA_COLOR,
] as unknown as ExpressionSpecification;

const evidenceFactor = ['case', ['==', ['get', 'ev'], true], 1, 0.55];
const roadClassFactor = ['match', ['get', 'rc'], 'PRIMARY', 1.5, 'SECONDARY', 1.2, 1];
const ZOOM_WIDTHS: [number, number][] = [
  [11, 1.2],
  [14, 2.4],
  [16, 4.5],
  [19, 10],
];

/** MapLibre exige que `['zoom']` sea el `interpolate` de nivel superior. */
function zoomScaled(output: (base: number) => unknown): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...ZOOM_WIDTHS.flatMap(([zoom, base]) => [zoom, output(base)]),
  ] as unknown as ExpressionSpecification;
}

/** Ancho: zoom x clase vial x evidencia (las calles sin datos son más finas). */
export const streetWidthExpression = zoomScaled((base) => [
  '*',
  roadClassFactor,
  evidenceFactor,
  base,
]);

/** Borde claro bajo el color. */
export const streetCasingWidthExpression = zoomScaled((base) => [
  '+',
  ['*', roadClassFactor, base],
  2.2,
]);

/** Banda del tipo de pavimento: más ancha que el color central. */
export const streetSurfaceWidthExpression = zoomScaled((base) => [
  '+',
  ['*', roadClassFactor, base],
  3,
]);

/** Banda de pavimento cuando es lo único que se pinta: ancho normal, sin depender de la evidencia. */
export const streetSurfaceOnlyWidthExpression = zoomScaled((base) => [
  '*',
  roadClassFactor,
  base * 1.2,
]);

export const streetCasingOpacityExpression = [
  'case',
  ['==', ['get', 'ev'], true],
  0.85,
  0,
] as unknown as ExpressionSpecification;
