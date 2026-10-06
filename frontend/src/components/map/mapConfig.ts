import type { LatLngBoundsLiteral, LatLngTuple } from 'leaflet';

export const mapConfig = {
  center: [-34.6037, -58.3816] as LatLngTuple,
  zoom: 13,
  minZoom: 11,
  maxZoom: 19,
  maxBounds: [
    [-34.9, -58.7],
    [-34.4, -58.1],
  ] as LatLngBoundsLiteral,
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const;
