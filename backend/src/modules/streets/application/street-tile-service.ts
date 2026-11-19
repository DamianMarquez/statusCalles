import type { StreetRoadClass } from '../domain/street-road-class.js';
import { roadClassesForTileZoom } from '../domain/street-tiles.js';

export interface StreetTileRepository {
  /** Tile vectorial (MVT) de las calles; null si no hay ninguna en esa celda. */
  findTile(
    zoom: number,
    x: number,
    y: number,
    roadClasses: StreetRoadClass[],
  ): Promise<Buffer | null>;
}

interface CacheEntry {
  at: number;
  tile: Buffer | null;
}

/**
 * Entrega tiles de calles con una caché corta en memoria: muchos usuarios miran las mismas
 * celdas y cada tile cuesta una consulta PostGIS.
 */
export class StreetTileService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly repository: StreetTileRepository,
    private readonly options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {},
  ) {}

  private get ttlMs() {
    return this.options.ttlMs ?? 30_000;
  }

  private now() {
    return (this.options.now ?? Date.now)();
  }

  async getTile(zoom: number, x: number, y: number, version = ''): Promise<Buffer | null> {
    const roadClasses = roadClassesForTileZoom(zoom);
    if (roadClasses.length === 0) return null;
    // La versión llega del cliente tras un cambio propio: así no recibe un tile viejo.
    const key = `${zoom}/${x}/${y}/${version}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at <= this.ttlMs) return cached.tile;
    const tile = await this.repository.findTile(zoom, x, y, roadClasses);
    this.cache.delete(key);
    this.cache.set(key, { at: this.now(), tile });
    const max = this.options.maxEntries ?? 500;
    while (this.cache.size > max) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return tile;
  }

  /** Se llama cuando cambian los puntajes guardados. */
  clear(): void {
    this.cache.clear();
  }
}
