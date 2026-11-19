export interface UserLocation {
  latitude: number;
  longitude: number;
}

/** Qué se pinta en las calles: su estado, su pavimento o ambos a la vez. */
export type StreetMode = 'condition' | 'surface' | 'both';

/** Tramo elegido para proponer información vial. */
export interface SelectedRoadSegment {
  id: string;
  streetName: string;
  lengthMeters: number | null;
}

/** Propiedades de cada calle en el tile vectorial (nombres cortos para que pese poco). */
export interface StreetTileProperties {
  id: string;
  /** Id de la calle. */
  sid: string;
  /** Nombre. */
  n: string;
  /** Jerarquía vial. */
  rc: 'PRIMARY' | 'SECONDARY' | 'LOCAL' | 'UNKNOWN';
  /** Puntaje 0-100 (de la calle bajo zoom 16, del tramo desde 16). */
  sc?: number;
  /** Nivel de estado. */
  lv?: string;
  /** Hay evidencia para calcular el puntaje. */
  ev: boolean;
  /** Reportes activos. */
  ar?: number;
  /** Disponibilidad: OPEN, RESTRICTED, BLOCKED o UNKNOWN. */
  av?: string;
  /** Tipo de pavimento. */
  st?: string;
  /** Fuente del pavimento: COMMUNITY, OSM o GCBA. */
  ss?: string;
  /** Condición del pavimento. */
  sco?: string;
  /** Tratamientos especiales, separados por coma. */
  tr?: string;
  /** Largo del tramo en metros (solo desde zoom 16). */
  len?: number;
}
