import type { RoutePoint, RouteSegmentEvidence } from '../domain/routing.js';

export interface RoutingRepository {
  isWithinCaba(point: RoutePoint): Promise<boolean>;
  findSegmentsAlongRoute(routeCoordinates: [number, number][]): Promise<RouteSegmentEvidence[]>;
}
