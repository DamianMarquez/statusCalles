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

interface OsrmRouteResponse {
  code?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { type: string; coordinates: unknown };
  }>;
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

export class OsrmRoutingProvider implements RoutingProvider {
  private readonly baseUrl: string;

  constructor(
    baseUrl = process.env.OSRM_BASE_URL ?? 'http://localhost:5000',
    private readonly timeoutMs = 8000,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async calculateRoute(
    origin: RoutePoint,
    destination: RoutePoint,
    options: { alternatives: number },
  ): Promise<RouteCandidate[]> {
    const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = new URL(`${this.baseUrl}/route/v1/driving/${coordinates}`);
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('steps', 'false');
    if (options.alternatives > 0)
      url.searchParams.set('alternatives', String(options.alternatives));

    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new OsrmRoutingError('TIMEOUT', 'Routing provider timeout.');
      }
      throw new OsrmRoutingError('UNAVAILABLE', 'Routing provider request failed.');
    }
    if (!response.ok)
      throw new OsrmRoutingError('UNAVAILABLE', 'Routing provider returned an error.');

    let body: OsrmRouteResponse;
    try {
      body = (await response.json()) as OsrmRouteResponse;
    } catch {
      throw new OsrmRoutingError('UNAVAILABLE', 'Routing provider response was not valid JSON.');
    }
    if (body.code === 'NoRoute' || body.code === 'NoSegment') return [];
    if (body.code !== 'Ok' || !Array.isArray(body.routes)) {
      throw new OsrmRoutingError(
        'UNAVAILABLE',
        'Routing provider returned an invalid route response.',
      );
    }
    return body.routes.slice(0, 4).flatMap((route) => {
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
}
