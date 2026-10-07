import { describe, expect, it, vi } from 'vitest';
import type { RoutingProvider } from './routing-provider.js';
import type { RoutingRepository } from './routing-repository.js';
import { RoutingService } from './routing-service.js';
import type { RouteCandidate } from '../domain/routing.js';

const origin = { latitude: -34.6037, longitude: -58.3816 };
const destination = { latitude: -34.5895, longitude: -58.3974 };

function candidate(lastLongitude: number, durationSeconds: number): RouteCandidate {
  return {
    geometry: {
      type: 'LineString',
      coordinates: [
        [-58.3816, -34.6037],
        [lastLongitude, -34.5895],
      ],
    },
    distanceMeters: durationSeconds * 10,
    durationSeconds,
  };
}

function setup(options: {
  routes?: RouteCandidate[];
  evidence?: Record<
    string,
    Array<{
      id: string;
      officialName: string;
      lengthMeters: number;
      maximumSeverity: 1 | 2 | 3 | 4 | null;
      activeOfficialCut: boolean;
    }>
  >;
  scores?: Record<string, { score: number; level: string }>;
  providerError?: { kind: 'TIMEOUT' | 'UNAVAILABLE'; message: string };
  inside?: boolean;
}) {
  const routes = options.routes ?? [candidate(-58.37, 100)];
  const provider: RoutingProvider = {
    calculateRoute: vi.fn(async () => {
      if (options.providerError) throw options.providerError;
      return routes;
    }),
  };
  const repository: RoutingRepository = {
    isWithinCaba: vi.fn(async () => options.inside ?? true),
    findSegmentsAlongRoute: vi.fn(async (coordinates) => {
      const lastLongitude = coordinates.at(-1)![0];
      return (options.evidence?.[String(lastLongitude)] ?? []).map((item) => ({
        ...item,
        score: options.scores?.[item.id]?.score ?? null,
        level: options.scores?.[item.id]?.level ?? null,
      }));
    }),
  };
  const streetScores = {
    findForSegments: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({
        id,
        score: options.scores?.[id]?.score ?? 75,
        level: options.scores?.[id]?.level ?? 'FAIR',
      })),
    ),
  };
  return {
    service: new RoutingService(provider, repository, streetScores as never),
    provider,
    repository,
    streetScores,
  };
}

describe('RoutingService', () => {
  it('returns a normal fastest route without inventing a preference penalty', async () => {
    const { service, provider } = setup({ routes: [candidate(-58.37, 100)] });
    const result = await service.calculate({ origin, destination, options: 'FASTEST' });
    expect(result.distanceMeters).toBe(1000);
    expect(result.durationSeconds).toBe(100);
    expect(result.warnings).toEqual([]);
    expect(provider.calculateRoute).toHaveBeenCalledWith(origin, destination, { alternatives: 0 });
  });

  it('chooses a slightly longer candidate when a shorter route crosses a low-score segment', async () => {
    const { service } = setup({
      routes: [candidate(-58.37, 100), candidate(-58.36, 130)],
      evidence: {
        '-58.37': [
          {
            id: 'bad',
            officialName: 'Calle con baches',
            lengthMeters: 900,
            maximumSeverity: 4,
            activeOfficialCut: false,
          },
        ],
      },
      scores: { bad: { score: 12, level: 'VERY_BAD' } },
    });
    const result = await service.calculate({ origin, destination, options: 'AVOID_BAD_STREETS' });
    expect(result.route.coordinates.at(-1)?.[0]).toBe(-58.36);
    expect(result.durationSeconds).toBe(130);
  });

  it('avoids an impassable segment when a safe candidate exists', async () => {
    const { service } = setup({
      routes: [candidate(-58.37, 80), candidate(-58.36, 140)],
      evidence: {
        '-58.37': [
          {
            id: 'closed',
            officialName: 'Calle cortada',
            lengthMeters: 600,
            maximumSeverity: 4,
            activeOfficialCut: false,
          },
        ],
        '-58.36': [
          {
            id: 'clear',
            officialName: 'Calle libre',
            lengthMeters: 600,
            maximumSeverity: null,
            activeOfficialCut: false,
          },
        ],
      },
      scores: { closed: { score: 0, level: 'IMPASSABLE' }, clear: { score: 75, level: 'FAIR' } },
    });
    const result = await service.calculate({
      origin,
      destination,
      options: 'AVOID_BLOCKED_STREETS',
    });
    expect(result.route.coordinates.at(-1)?.[0]).toBe(-58.36);
    expect(result.warnings).toContain(
      'Los incidentes oficiales no están disponibles; los cortes no pudieron verificarse.',
    );
  });

  it('accumulates multiple segment penalties when comparing candidates', async () => {
    const { service } = setup({
      routes: [candidate(-58.37, 100), candidate(-58.36, 135)],
      evidence: {
        '-58.37': [
          {
            id: 'bad-a',
            officialName: 'Tramo A',
            lengthMeters: 500,
            maximumSeverity: 3,
            activeOfficialCut: false,
          },
          {
            id: 'bad-b',
            officialName: 'Tramo B',
            lengthMeters: 500,
            maximumSeverity: 3,
            activeOfficialCut: false,
          },
        ],
      },
      scores: { 'bad-a': { score: 30, level: 'BAD' }, 'bad-b': { score: 30, level: 'BAD' } },
    });
    const result = await service.calculate({ origin, destination, options: 'AVOID_BAD_STREETS' });
    expect(result.route.coordinates.at(-1)?.[0]).toBe(-58.36);
  });

  it('rejects locations outside the imported CABA polygon', async () => {
    const { service, provider } = setup({ inside: false });
    await expect(
      service.calculate({ origin, destination, options: 'FASTEST' }),
    ).rejects.toMatchObject({ code: 'LOCATION_OUTSIDE_CABA' });
    expect(provider.calculateRoute).not.toHaveBeenCalled();
  });

  it('maps provider timeout and provider errors to safe application errors', async () => {
    const timedOut = setup({
      providerError: { kind: 'TIMEOUT', message: 'private upstream detail' },
    });
    const offline = setup({
      providerError: { kind: 'UNAVAILABLE', message: 'private upstream detail' },
    });
    await expect(
      timedOut.service.calculate({ origin, destination, options: 'FASTEST' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    await expect(
      offline.service.calculate({ origin, destination, options: 'FASTEST' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});
