import { describe, expect, it, vi } from 'vitest';
import type { StreetScoreRepository } from './street-score-repository.js';
import { StreetScoreService } from './street-score-service.js';

describe('StreetScoreService condition viewport', () => {
  it('returns official geometry as GeoJSON and keeps segments without evidence unscored', async () => {
    const repository: StreetScoreRepository = {
      findConditionGeometry: vi.fn().mockResolvedValue([
        {
          id: 'segment-1',
          streetId: 'street-1',
          streetName: 'Avenida Ejemplo',
          roadClass: 'LOCAL',
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [-58.4, -34.6],
                [-58.39, -34.6],
              ],
            ],
          },
          segmentIds: ['segment-1'],
        },
      ]),
      findSegmentScores: vi.fn().mockResolvedValue([]),
      findStreetScore: vi.fn().mockResolvedValue(null),
      findSegmentScore: vi.fn().mockResolvedValue(null),
    };
    const service = new StreetScoreService(repository, () => new Date('2026-10-08T12:00:00Z'));
    const response = await service.findConditionInViewport(
      { south: -34.7, north: -34.5, west: -58.5, east: -58.3 },
      16,
    );
    expect(response.type).toBe('FeatureCollection');
    expect(response.features[0]).toMatchObject({
      geometry: { type: 'MultiLineString' },
      properties: {
        streetName: 'Avenida Ejemplo',
        roadClass: 'LOCAL',
        score: null,
        level: null,
        condition: 'GOOD',
        hasReports: false,
        hasEvidence: false,
      },
    });
  });

  it('filters computed results by requested condition levels', async () => {
    const repository: StreetScoreRepository = {
      findConditionGeometry: vi.fn().mockResolvedValue([
        {
          id: 's1',
          streetId: 'st1',
          streetName: 'A',
          roadClass: 'LOCAL',
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          segmentIds: ['s1'],
        },
      ]),
      findSegmentScores: vi.fn().mockResolvedValue([]),
      findStreetScore: vi.fn().mockResolvedValue(null),
      findSegmentScore: vi.fn().mockResolvedValue(null),
    };
    const result = await new StreetScoreService(repository).findConditionInViewport(
      { south: -1, north: 1, west: -1, east: 1 },
      16,
      ['CRITICAL'],
    );
    expect(result.features).toHaveLength(0);
  });

  it('includes streets without reports when the visual GOOD condition is selected', async () => {
    const repository: StreetScoreRepository = {
      findConditionGeometry: vi.fn().mockResolvedValue([
        {
          id: 's1',
          streetId: 'st1',
          streetName: 'A',
          roadClass: 'PRIMARY',
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          segmentIds: ['s1'],
        },
      ]),
      findSegmentScores: vi.fn().mockResolvedValue([]),
      findStreetScore: vi.fn().mockResolvedValue(null),
      findSegmentScore: vi.fn().mockResolvedValue(null),
    };
    const result = await new StreetScoreService(repository).findConditionInViewport(
      { south: -1, north: 1, west: -1, east: 1 },
      16,
      ['GOOD'],
    );
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.properties).toMatchObject({
      condition: 'GOOD',
      score: null,
      hasEvidence: false,
      hasReports: false,
    });
    expect(repository.findConditionGeometry).toHaveBeenCalledWith(
      { south: -1, north: 1, west: -1, east: 1 },
      16,
      ['PRIMARY', 'SECONDARY', 'LOCAL', 'UNKNOWN'],
    );
  });
});
