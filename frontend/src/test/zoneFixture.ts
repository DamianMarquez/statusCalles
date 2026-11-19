import type { ZoneProperties } from '../api/zonesApi.js';

/** Zona de ejemplo con todas las métricas, para pruebas del mapa y de Estadísticas. */
export function makeZoneProperties(
  id: number,
  overrides: Partial<ZoneProperties> = {},
): ZoneProperties {
  return {
    id,
    name: `Comuna ${id}`,
    level: 'commune',
    communeId: null,
    totalKm: 100,
    segments: 1000,
    condition: {
      avgScore: 40,
      level: 'BAD',
      scoredSegments: 12,
      coveragePct: 3,
      scoredKm: 3,
      sufficient: true,
    },
    surface: {
      dominant: { type: 'ASPHALT', pct: 70 },
      top: [
        { type: 'ASPHALT', pct: 70 },
        { type: 'CONCRETE', pct: 25 },
      ],
      knownPct: 95,
      kmByType: { ASPHALT: 66.5, CONCRETE: 23.75, GRANITE_COBBLESTONE: 4.75 },
    },
    intervention: {
      index: id * 3,
      publicWorks: 2,
      reportedWorks: 1,
      reportedCuts: 0,
      calming: 20,
      calmingByType: { SPEED_BUMP: 15, DIP: 5 },
      calmingPerKm: 0.2,
    },
    critical: { critical: 1, high: 1, activeReports: 5, class: 1 },
    reportsByType: { POTHOLE: 3, ROAD_WORK: 1, FLOOD: 1 },
    ...overrides,
  };
}
