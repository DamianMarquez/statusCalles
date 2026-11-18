import type { StyleSpecification } from 'maplibre-gl';

const styleUrl = import.meta.env.VITE_MAP_STYLE_URL as string | undefined;

/**
 * Sin estilo configurado se usa OSM raster para que el mapa funcione de entrada.
 * En producción definir VITE_MAP_STYLE_URL (estilo vectorial, p. ej. MapTiler dataviz).
 */
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

export const mapConfig = {
  /** [longitud, latitud], el orden que usa MapLibre. */
  center: [-58.3816, -34.6037] as [number, number],
  zoom: 13,
  minZoom: 11,
  maxZoom: 19,
  /** [[oeste, sur], [este, norte]] */
  maxBounds: [
    [-58.7, -34.9],
    [-58.1, -34.4],
  ] as [[number, number], [number, number]],
  style: styleUrl && styleUrl.length > 0 ? styleUrl : fallbackStyle,
  usingFallbackStyle: !styleUrl,
};
