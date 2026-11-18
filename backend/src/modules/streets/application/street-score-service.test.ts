import { describe, expect, it, vi } from 'vitest';
import type { StreetScoreRepository } from './street-score-repository.js';
import { StreetScoreService } from './street-score-service.js';

describe('StreetScoreService condition viewport', () => {
  it('returns official geometry as GeoJSON and keeps segments without evidence unscored', async () => {
    const repository: StreetScoreRepository = {
      findConditionFeatures: vi.fn().mockResolvedValue([
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
          score: null,
          roadInformation: null,
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
      findConditionFeatures: vi.fn().mockResolvedValue([
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
          score: null,
          roadInformation: null,
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
      findConditionFeatures: vi.fn().mockResolvedValue([
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
          score: null,
          roadInformation: null,
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
    expect(repository.findConditionFeatures).toHaveBeenCalledWith(
      { south: -1, north: 1, west: -1, east: 1 },
      16,
      ['PRIMARY', 'SECONDARY', 'LOCAL', 'UNKNOWN'],
    );
  });

  it('uses the precalculated score without recomputing it', async () => {
    const repository: StreetScoreRepository = {
      findConditionFeatures: vi.fn().mockResolvedValue([
        {
          id: 's1',
          streetId: 'st1',
          streetName: 'A',
          roadClass: 'LOCAL',
          roadInformation: null,
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          score: {
            score: 38,
            level: 'BAD',
            hasEvidence: true,
            confidence: 'MEDIUM',
            factors: [],
            metrics: {
              reports: 2,
              activeReports: 2,
              recentReports: 1,
              highSeverityReports: 1,
              confirmations: 0,
              resolvedReports: 0,
              officialIncidents: 0,
              trafficLevel: null,
              latestReportAt: '2026-10-07T10:00:00.000Z',
            },
            availability: { status: 'UNKNOWN', signals: [] },
            calculatedAt: '2026-10-08T11:00:00.000Z',
          },
        },
      ]),
      findSegmentScores: vi.fn(),
      findStreetScore: vi.fn(),
      findSegmentScore: vi.fn(),
    };
    const result = await new StreetScoreService(repository).findConditionInViewport(
      { south: -1, north: 1, west: -1, east: 1 },
      16,
      ['BAD'],
    );
    expect(result.features[0]?.properties).toMatchObject({
      score: 38,
      level: 'BAD',
      condition: 'BAD',
      hasEvidence: true,
      hasReports: true,
      calculatedAt: '2026-10-08T11:00:00.000Z',
    });
    expect(repository.findSegmentScores).not.toHaveBeenCalled();
  });
});
