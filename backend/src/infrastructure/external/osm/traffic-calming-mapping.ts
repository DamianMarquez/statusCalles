/**
 * Reductores de velocidad que se importan de OpenStreetMap (`traffic_calming=*`).
 * Los tipos propios son los que el mapa dibuja y explica en la leyenda.
 */
export const TRAFFIC_CALMING_TYPES = [
  'SPEED_BUMP',
  'SPEED_HUMP',
  'RAISED_CROSSING',
  'DIP',
  'CUSHION',
  'NARROWING',
  'RUMBLE_STRIP',
] as const;
export type TrafficCalmingType = (typeof TRAFFIC_CALMING_TYPES)[number];

const OSM_TO_TYPE: Record<string, TrafficCalmingType> = {
  bump: 'SPEED_BUMP',
  mini_bumps: 'SPEED_BUMP',
  hump: 'SPEED_HUMP',
  table: 'RAISED_CROSSING',
  dip: 'DIP',
  cushion: 'CUSHION',
  island: 'NARROWING',
  choker: 'NARROWING',
  chicane: 'NARROWING',
  rumble_strip: 'RUMBLE_STRIP',
};

/** Devuelve null para valores sin equivalente (por ejemplo `yes`, `choked_table`, `no`). */
export function mapTrafficCalming(value: string | undefined | null): TrafficCalmingType | null {
  if (!value) return null;
  // OSM admite varios valores separados por ";": se usa el primero que reconocemos.
  for (const part of value.split(';')) {
    const mapped = OSM_TO_TYPE[part.trim().toLowerCase()];
    if (mapped) return mapped;
  }
  return null;
}
