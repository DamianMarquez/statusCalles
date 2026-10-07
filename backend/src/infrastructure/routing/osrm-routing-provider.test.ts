import { describe, expect, it, vi } from 'vitest';
import { OsrmRoutingError, OsrmRoutingProvider } from './osrm-routing-provider.js';

const routeBody = {
  code: 'Ok',
  routes: [
    {
      distance: 1200,
      duration: 240,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-58.38, -34.6],
          [-58.37, -34.59],
        ],
      },
    },
  ],
};

describe('OsrmRoutingProvider', () => {
  it('requests GeoJSON routes and returns normalized alternatives', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(routeBody), { status: 200 }));
    const provider = new OsrmRoutingProvider(
      'http://routing.local/',
      1000,
      fetcher as typeof fetch,
    );
    const routes = await provider.calculateRoute(
      { latitude: -34.6, longitude: -58.38 },
      { latitude: -34.59, longitude: -58.37 },
      { alternatives: 3 },
    );
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.pathname).toBe('/route/v1/driving/-58.38,-34.6;-58.37,-34.59');
    expect(url.searchParams.get('geometries')).toBe('geojson');
    expect(url.searchParams.get('alternatives')).toBe('3');
    expect(routes[0]).toMatchObject({ distanceMeters: 1200, durationSeconds: 240 });
  });

  it('does not request alternatives for the fastest option', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(routeBody), { status: 200 }));
    const provider = new OsrmRoutingProvider('http://routing.local', 1000, fetcher as typeof fetch);
    await provider.calculateRoute(
      { latitude: -34.6, longitude: -58.38 },
      { latitude: -34.59, longitude: -58.37 },
      { alternatives: 0 },
    );
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.has('alternatives')).toBe(false);
  });

  it('returns no routes for a valid no-route response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: 'NoRoute' }), { status: 200 }));
    const provider = new OsrmRoutingProvider('http://routing.local', 1000, fetcher as typeof fetch);
    await expect(
      provider.calculateRoute(
        { latitude: -34.6, longitude: -58.38 },
        { latitude: -34.59, longitude: -58.37 },
        { alternatives: 0 },
      ),
    ).resolves.toEqual([]);
  });

  it('rejects malformed geometry and maps timeouts/upstream errors', async () => {
    const malformed = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'Ok',
          routes: [
            {
              ...routeBody.routes[0],
              geometry: { type: 'LineString', coordinates: [[500, 500]] },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const invalidProvider = new OsrmRoutingProvider(
      'http://routing.local',
      1000,
      malformed as typeof fetch,
    );
    await expect(
      invalidProvider.calculateRoute(
        { latitude: -34.6, longitude: -58.38 },
        { latitude: -34.59, longitude: -58.37 },
        { alternatives: 0 },
      ),
    ).resolves.toEqual([]);

    const timeout = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    const timeoutProvider = new OsrmRoutingProvider(
      'http://routing.local',
      1,
      timeout as typeof fetch,
    );
    await expect(
      timeoutProvider.calculateRoute(
        { latitude: -34.6, longitude: -58.38 },
        { latitude: -34.59, longitude: -58.37 },
        { alternatives: 0 },
      ),
    ).rejects.toMatchObject<Partial<OsrmRoutingError>>({ kind: 'TIMEOUT' });

    const failed = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    const failedProvider = new OsrmRoutingProvider(
      'http://routing.local',
      1000,
      failed as typeof fetch,
    );
    await expect(
      failedProvider.calculateRoute(
        { latitude: -34.6, longitude: -58.38 },
        { latitude: -34.59, longitude: -58.37 },
        { alternatives: 0 },
      ),
    ).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });
});
