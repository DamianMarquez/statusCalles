import type { StyleSpecification } from 'maplibre-gl';

/**
 * Estilo vectorial de MapTiler fijo en el código para no depender de variables de entorno
 * en cada despliegue. La clave es pública (viaja en el navegador): restringila por dominio
 * en el panel de MapTiler. `VITE_MAP_STYLE_URL` la reemplaza si se define.
 */
const DEFAULT_STYLE_URL =
  'https://api.maptiler.com/maps/dataviz/style.json?key=PMB64uxtef6bpVrK1pTt';
const styleUrl = (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) || DEFAULT_STYLE_URL;

/**
 * Sin estilo configurado se usa OSM raster para que el mapa funcione de entrada.
 * Solo se usa si no hay ningún estilo vectorial.
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
