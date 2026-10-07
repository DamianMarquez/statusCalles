import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OsrmConstructor, OsrmRouteResponse } from './osrm-native.js';
import {
  createOsrmRoutingProvider,
  OsrmRoutingError,
  OsrmRoutingInitializationError,
  OsrmRoutingProvider,
  type OsrmNativeEngine,
} from './osrm-routing-provider.js';

const routeResponse: OsrmRouteResponse = {
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

const origin = { latitude: -34.6, longitude: -58.38 };
const destination = { latitude: -34.59, longitude: -58.37 };
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('OsrmRoutingProvider', () => {
  it('maps coordinates and alternatives to normalized candidates', async () => {
    const route = vi.fn((_request, callback) => callback(null, routeResponse));
    const provider = new OsrmRoutingProvider({ route } as unknown as OsrmNativeEngine);
    const candidates = await provider.calculateRoute(origin, destination, { alternatives: 3 });

    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinates: [
          [-58.38, -34.6],
          [-58.37, -34.59],
        ],
        alternatives: 3,
        geometries: 'geojson',
        overview: 'full',
        steps: false,
      }),
      expect.any(Function),
    );
    expect(candidates[0]).toMatchObject({ distanceMeters: 1200, durationSeconds: 240 });
  });

  it('returns no candidates when OSRM has no route', async () => {
    const engine = {
      route: (_request: unknown, callback: (error: Error | null, response: unknown) => void) =>
        callback(null, { code: 'NoRoute' }),
    };
    const provider = new OsrmRoutingProvider(engine as unknown as OsrmNativeEngine);
    await expect(
      provider.calculateRoute(origin, destination, { alternatives: 0 }),
    ).resolves.toEqual([]);
  });

  it('maps native no-route errors to an empty route result', async () => {
    const engine = {
      route: (_request: unknown, callback: (error: Error | null) => void) =>
        callback(new Error('NoRoute')),
    };
    const provider = new OsrmRoutingProvider(engine as unknown as OsrmNativeEngine);
    await expect(
      provider.calculateRoute(origin, destination, { alternatives: 0 }),
    ).resolves.toEqual([]);
  });

  it('drops malformed route geometry', async () => {
    const invalid: OsrmRouteResponse = {
      code: 'Ok',
      routes: [
        {
          ...routeResponse.routes![0]!,
          geometry: { type: 'LineString', coordinates: [[500, 500]] },
        },
      ],
    };
    const engine = {
      route: (_request: unknown, callback: (error: Error | null, response: unknown) => void) =>
        callback(null, invalid),
    };
    const provider = new OsrmRoutingProvider(engine as unknown as OsrmNativeEngine);
    await expect(
      provider.calculateRoute(origin, destination, { alternatives: 0 }),
    ).resolves.toEqual([]);
  });

  it('maps native callback failures and timeouts', async () => {
    const failedProvider = new OsrmRoutingProvider({
      route: (_request, callback) => callback(new Error('native details must stay private')),
    });
    await expect(
      failedProvider.calculateRoute(origin, destination, { alternatives: 0 }),
    ).rejects.toMatchObject<Partial<OsrmRoutingError>>({ kind: 'UNAVAILABLE' });

    const pendingProvider = new OsrmRoutingProvider({ route: () => undefined }, 5);
    await expect(
      pendingProvider.calculateRoute(origin, destination, { alternatives: 0 }),
    ).rejects.toMatchObject<Partial<OsrmRoutingError>>({ kind: 'TIMEOUT' });
  });
});

describe('createOsrmRoutingProvider', () => {
  it('fails with setup guidance when the versioned dataset is missing', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'street-status-osrm-'));
    temporaryDirectories.push(dataRoot);
    class FakeOSRM {
      static version = '26.9.0';

      route() {}
    }

    await expect(
      createOsrmRoutingProvider({
        dataRoot,
        loadConstructor: async () => FakeOSRM as unknown as OsrmConstructor,
      }),
    ).rejects.toBeInstanceOf(OsrmRoutingInitializationError);
  });

  it('loads one MLD native engine after checking its versioned dataset', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'street-status-osrm-'));
    temporaryDirectories.push(dataRoot);
    const datasetDirectory = join(dataRoot, 'osrm-26.9.0');
    await mkdir(datasetDirectory);
    await writeFile(
      join(datasetDirectory, '.street-status-routing.json'),
      JSON.stringify({ osrmVersion: '26.9.0', algorithm: 'MLD' }),
    );
    await Promise.all(
      ['.properties', '.mldgr', '.partition'].map((suffix) =>
        writeFile(join(datasetDirectory, `BuenosAires.osrm${suffix}`), ''),
      ),
    );
    const route = vi.fn((_request, callback) => callback(null, routeResponse));
    const constructedWith: unknown[] = [];
    class FakeOSRM {
      static version = '26.9.0';

      constructor(options: unknown) {
        constructedWith.push(options);
      }

      route = route;
    }

    const provider = await createOsrmRoutingProvider({
      dataRoot,
      loadConstructor: async () => FakeOSRM as unknown as OsrmConstructor,
    });
    await provider.calculateRoute(origin, destination, { alternatives: 0 });

    expect(constructedWith).toEqual([
      {
        path: join(datasetDirectory, 'BuenosAires.osrm'),
        algorithm: 'MLD',
        mmap_memory: true,
      },
    ]);
    expect(route).toHaveBeenCalledOnce();
  });

  it('converts native addon load errors into actionable startup failures', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'street-status-osrm-'));
    temporaryDirectories.push(dataRoot);

    await expect(
      createOsrmRoutingProvider({
        dataRoot,
        loadConstructor: async () => {
          throw new Error('incompatible native addon');
        },
      }),
    ).rejects.toMatchObject({
      name: 'OsrmRoutingInitializationError',
      message: expect.stringContaining('npm run routing:setup'),
    });
  });
});
