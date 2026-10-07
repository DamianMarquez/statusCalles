import type { RouteCandidate, RoutePoint } from '../domain/routing.js';

export interface RoutingProvider {
  calculateRoute(
    origin: RoutePoint,
    destination: RoutePoint,
    options: { alternatives: number },
  ): Promise<RouteCandidate[]>;
}
