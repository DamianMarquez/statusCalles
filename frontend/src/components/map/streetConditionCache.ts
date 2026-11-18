import type { ViewportBounds } from '../../api/reportTypes.js';
import type { StreetConditionFeatureCollection } from '../../api/streetScoreTypes.js';

/** Tamaño de la cuadrícula (grados) según el zoom: más fino cuanto más cerca. */
export function gridSizeForZoom(zoom: number): number {
  if (zoom >= 16) return 0.002;
  if (zoom >= 14) return 0.005;
  if (zoom >= 12) return 0.02;
  return 0.04;
}

const PRECISION = 1e6;

function floorTo(value: number, size: number): number {
  return Math.round(Math.floor(value / size + 1e-9) * size * PRECISION) / PRECISION;
}

function ceilTo(value: number, size: number): number {
  return Math.round(Math.ceil(value / size - 1e-9) * size * PRECISION) / PRECISION;
}

/**
 * Agranda el viewport hasta la cuadrícula. Así moverse un poco repite la misma consulta
 * (que queda en caché) y usuarios distintos comparten las mismas URLs.
 */
export function snapBounds(bounds: ViewportBounds, zoom: number): ViewportBounds {
  const size = gridSizeForZoom(zoom);
  return {
    south: floorTo(bounds.south, size),
    north: ceilTo(bounds.north, size),
    west: floorTo(bounds.west, size),
    east: ceilTo(bounds.east, size),
  };
}

export function conditionCacheKey(
  bounds: ViewportBounds,
  zoom: number,
  levels: string[] | null,
  roadClasses: string[],
): string {
  return [
    bounds.south,
    bounds.north,
    bounds.west,
    bounds.east,
    Math.floor(zoom),
    levels === null ? '*' : levels.join(','),
    roadClasses.join(','),
  ].join('|');
}

/** Caché en memoria con vencimiento y tope de entradas (la más antigua sale primero). */
export class ConditionCache {
  private readonly entries = new Map<
    string,
    { at: number; value: StreetConditionFeatureCollection }
  >();

  constructor(
    private readonly maxEntries = 40,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): StreetConditionFeatureCollection | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.now() - entry.at > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    // Se reinserta para que cuente como el más reciente.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: StreetConditionFeatureCollection) {
    this.entries.delete(key);
    this.entries.set(key, { at: this.now(), value });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear() {
    this.entries.clear();
  }
}
