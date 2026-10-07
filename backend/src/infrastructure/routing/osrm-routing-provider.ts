import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OsrmConstructor, OsrmRouteResponse, OsrmRouteRequest } from './osrm-native.js';
import type { RoutingProvider } from '../../modules/routing/application/routing-provider.js';
import type {
  RouteCandidate,
  RouteLine,
  RoutePoint,
} from '../../modules/routing/domain/routing.js';

export class OsrmRoutingError extends Error {
  constructor(
    readonly kind: 'TIMEOUT' | 'UNAVAILABLE' | 'NO_ROUTE',
    message: string,
  ) {
    super(message);
    this.name = 'OsrmRoutingError';
  }
}

export class OsrmRoutingInitializationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OsrmRoutingInitializationError';
  }
}

export interface OsrmNativeEngine {
  route(
    request: OsrmRouteRequest,
    callback: (error: Error | null, response?: OsrmRouteResponse) => void,
  ): void;
}

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function normalizeCandidates(response: OsrmRouteResponse): RouteCandidate[] {
  if (response.code === 'NoRoute' || response.code === 'NoSegment') return [];
  if (response.code && response.code !== 'Ok') {
    throw new OsrmRoutingError('UNAVAILABLE', 'The routing engine returned an invalid response.');
  }
  if (!Array.isArray(response.routes)) {
    throw new OsrmRoutingError('UNAVAILABLE', 'The routing engine returned an invalid response.');
  }

  return response.routes.slice(0, 4).flatMap((route) => {
    if (
      !Number.isFinite(route.distance) ||
      route.distance <= 0 ||
      route.distance > 100_000 ||
      !Number.isFinite(route.duration) ||
      route.duration <= 0 ||
      route.geometry?.type !== 'LineString' ||
      !Array.isArray(route.geometry.coordinates) ||
      route.geometry.coordinates.length < 2 ||
      route.geometry.coordinates.length > 20_000 ||
      !route.geometry.coordinates.every(isCoordinate)
    ) {
      return [];
    }
    return [
      {
        geometry: {
          type: 'LineString',
          coordinates: route.geometry.coordinates as RouteLine['coordinates'],
        },
        distanceMeters: route.distance,
        durationSeconds: route.duration,
      },
    ];
  });
}

export class OsrmRoutingProvider implements RoutingProvider {
  constructor(
    private readonly engine: OsrmNativeEngine,
    private readonly timeoutMs = 8000,
  ) {}

  async calculateRoute(
    origin: RoutePoint,
    destination: RoutePoint,
    options: { alternatives: number },
  ): Promise<RouteCandidate[]> {
    const request: OsrmRouteRequest = {
      coordinates: [
        [origin.longitude, origin.latitude],
        [destination.longitude, destination.latitude],
      ],
      geometries: 'geojson',
      overview: 'full',
      steps: false,
      alternatives: options.alternatives,
    };

    let response: OsrmRouteResponse;
    try {
      response = await this.requestRoute(request);
    } catch (error) {
      if (error instanceof OsrmRoutingError) {
        if (error.kind === 'NO_ROUTE') return [];
        throw error;
      }
      throw new OsrmRoutingError('UNAVAILABLE', 'Routing engine request failed.');
    }
    return normalizeCandidates(response);
  }

  private requestRoute(request: OsrmRouteRequest): Promise<OsrmRouteResponse> {
    return new Promise((resolveResponse, reject) => {
      const timeout = setTimeout(
        () => reject(new OsrmRoutingError('TIMEOUT', 'Routing engine request timed out.')),
        this.timeoutMs,
      );
      try {
        this.engine.route(request, (error, response) => {
          clearTimeout(timeout);
          if (error) {
            const kind = /NoRoute|NoSegment/.test(error.message) ? 'NO_ROUTE' : 'UNAVAILABLE';
            reject(new OsrmRoutingError(kind, 'Routing engine request failed.'));
          } else if (response) {
            resolveResponse(response);
          } else {
            reject(new OsrmRoutingError('UNAVAILABLE', 'Routing engine returned no response.'));
          }
        });
      } catch {
        clearTimeout(timeout);
        reject(new OsrmRoutingError('UNAVAILABLE', 'Routing engine request failed.'));
      }
    });
  }
}

export async function createOsrmRoutingProvider(
  options: {
    dataRoot?: string;
    loadConstructor?: () => Promise<OsrmConstructor>;
    timeoutMs?: number;
  } = {},
): Promise<OsrmRoutingProvider> {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const configuredDataRoot = process.env.OSRM_DATA_DIR;
  const dataRoot =
    options.dataRoot ??
    (configuredDataRoot ? resolve(configuredDataRoot) : join(projectRoot, 'data', 'routing'));
  const loadConstructor =
    options.loadConstructor ??
    (async () => (await import('./osrm-native.js')).loadOsrmConstructor());

  try {
    const Osrm = await loadConstructor();
    const datasetDirectory = join(dataRoot, `osrm-${Osrm.version}`);
    const datasetPath = join(datasetDirectory, 'BuenosAires.osrm');
    const metadata = JSON.parse(
      await readFile(join(datasetDirectory, '.street-status-routing.json'), 'utf8'),
    ) as { osrmVersion?: unknown; algorithm?: unknown };
    if (metadata.osrmVersion !== Osrm.version || metadata.algorithm !== 'MLD') {
      throw new Error('Dataset metadata does not match the installed routing engine.');
    }
    await Promise.all(
      ['.properties', '.mldgr', '.partition'].map((suffix) => stat(`${datasetPath}${suffix}`)),
    );
    const engine = new Osrm({ path: datasetPath, algorithm: 'MLD', mmap_memory: true });
    return new OsrmRoutingProvider(engine, options.timeoutMs);
  } catch (error) {
    throw new OsrmRoutingInitializationError(
      'Embedded OSRM could not be initialized. Run `npm run routing:setup` and verify the Node native addon is available.',
      { cause: error },
    );
  }
}
