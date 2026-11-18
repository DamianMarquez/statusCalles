import type { StyleSpecification } from 'maplibre-gl';
import {
  STREET_CONDITION_LEVELS,
  NO_STREET_CONDITION_COLOR,
} from '../components/map/streetConditionCatalog.js';

const styleUrl = import.meta.env.VITE_MAP_STYLE_URL as string | undefined;

/** Sin clave de proveedor se usa OSM raster, así el lab funciona de entrada. */
const fallbackStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export const labMapConfig = {
  style: styleUrl && styleUrl.length > 0 ? styleUrl : fallbackStyle,
  usingFallbackStyle: !styleUrl,
  center: [-58.3816, -34.6037] as [number, number], // [lng, lat]
  zoom: 13,
  minZoom: 10,
  maxZoom: 19,
  maxBounds: [
    [-58.7, -34.9],
    [-58.1, -34.4],
  ] as [[number, number], [number, number]],
};

/** Expresión `match` de MapLibre: nivel -> color. */
export const levelColorExpression = [
  'match',
  ['get', 'level'],
  ...STREET_CONDITION_LEVELS.flatMap((level) => [level.value, level.color]),
  NO_STREET_CONDITION_COLOR,
] as unknown as import('maplibre-gl').ExpressionSpecification;

export const SEVERITY_COLORS = [
  'match',
  ['get', 'severity'],
  'LOW',
  '#c8ae55',
  'MEDIUM',
  '#cc8654',
  'HIGH',
  '#c66a5e',
  'CRITICAL',
  '#7f1d1d',
  '#7b8490',
] as unknown as import('maplibre-gl').ExpressionSpecification;

/** Degradado continuo por puntaje 0-100; gris cuando la calle no tiene evidencia. */
export const SCORE_RAMP_STOPS: [number, string][] = [
  [0, '#7f1d1d'],
  [30, '#b42318'],
  [55, '#e66b18'],
  [75, '#d49a00'],
  [100, '#17804a'],
];

export const scoreColorExpression = [
  'case',
  ['all', ['==', ['get', 'hasEvidence'], true], ['==', ['typeof', ['get', 'score']], 'number']],
  ['interpolate', ['linear'], ['get', 'score'], ...SCORE_RAMP_STOPS.flat()],
  NO_STREET_CONDITION_COLOR,
] as unknown as import('maplibre-gl').ExpressionSpecification;

export const NO_DATA_COLOR = NO_STREET_CONDITION_COLOR;
