import {
  computeZoneMetrics,
  type ZoneLevel,
  type ZoneMetrics,
  type ZoneRaw,
} from '../domain/zone-metrics.js';

export interface ZoneStatsRepository {
  /** Zonas con su geometría y los totales crudos que alimentan las métricas. */
  findZones(level: ZoneLevel): Promise<ZoneRaw[]>;
}

export interface ZoneFeatureProperties extends ZoneMetrics {
  id: number;
  name: string;
  level: ZoneLevel;
  communeId: number | null;
}

export interface ZoneFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    geometry: unknown;
    properties: ZoneFeatureProperties;
  }>;
}

interface CacheEntry {
  at: number;
  value: ZoneFeatureCollection;
}

/** Comunas o barrios con sus métricas. Calcularlas cuesta una consulta grande: se guardan unos minutos. */
export class ZoneService {
  private readonly cache = new Map<ZoneLevel, CacheEntry>();

  constructor(
    private readonly repository: ZoneStatsRepository,
    private readonly options: { ttlMs?: number; now?: () => number } = {},
  ) {}

  async getZones(level: ZoneLevel): Promise<ZoneFeatureCollection> {
    const now = (this.options.now ?? Date.now)();
    const cached = this.cache.get(level);
    if (cached && now - cached.at <= (this.options.ttlMs ?? 600_000)) return cached.value;
    const zones = await this.repository.findZones(level);
    const value: ZoneFeatureCollection = {
      type: 'FeatureCollection',
      features: zones.map((zone) => ({
        type: 'Feature',
        id: zone.id,
        geometry: zone.geometry,
        properties: {
          id: zone.id,
          name: zone.name,
          level,
          communeId: zone.communeId,
          ...computeZoneMetrics(zone),
        },
      })),
    };
    this.cache.set(level, { at: now, value });
    return value;
  }

  /** Se llama cuando cambian los puntajes guardados. */
  clear(): void {
    this.cache.clear();
  }
}
