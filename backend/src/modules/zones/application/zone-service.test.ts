import { describe, expect, it, vi } from 'vitest';
import type { ZoneRaw } from '../domain/zone-metrics.js';
import { ZoneService, type ZoneStatsRepository } from './zone-service.js';

const zone: ZoneRaw = {
  id: 7,
  name: 'Comuna 7',
  communeId: null,
  geometry: { type: 'Polygon', coordinates: [] },
  totalKm: 20,
  segments: 200,
  scoredSegments: 10,
  scoreSum: 700,
  scoredKm: 2,
  surfaceKm: { ASPHALT: 15, CONCRETE: 5 },
  publicWorks: 1,
  calming: { SPEED_BUMP: 4 },
  reportedWorks: 0,
  reportedCuts: 1,
  criticalReports: 1,
  highReports: 0,
  activeReports: 3,
  reportsByType: { POTHOLE: 2, ROAD_BLOCKED: 1 },
};

function repository(): ZoneStatsRepository & { findZones: ReturnType<typeof vi.fn> } {
  return { findZones: vi.fn().mockResolvedValue([zone]) };
}

describe('ZoneService', () => {
  it('returns a feature collection with the metrics of each zone', async () => {
    const result = await new ZoneService(repository()).getZones('commune');
    expect(result.type).toBe('FeatureCollection');
    expect(result.features[0]).toMatchObject({
      id: 7,
      geometry: { type: 'Polygon' },
      properties: {
        id: 7,
        name: 'Comuna 7',
        level: 'commune',
        condition: { avgScore: 70, level: 'ACCEPTABLE', sufficient: true },
        surface: { dominant: { type: 'ASPHALT', pct: 75 } },
        critical: { critical: 1, class: 1 },
      },
    });
  });

  it('keeps the result for a few minutes per level and recomputes after clear()', async () => {
    let now = 0;
    const repo = repository();
    const service = new ZoneService(repo, { ttlMs: 1000, now: () => now });
    await service.getZones('commune');
    await service.getZones('commune');
    expect(repo.findZones).toHaveBeenCalledTimes(1);
    await service.getZones('neighborhood');
    expect(repo.findZones).toHaveBeenCalledTimes(2);
    service.clear();
    await service.getZones('commune');
    expect(repo.findZones).toHaveBeenCalledTimes(3);
    now = 5000;
    await service.getZones('commune');
    expect(repo.findZones).toHaveBeenCalledTimes(4);
  });
});
