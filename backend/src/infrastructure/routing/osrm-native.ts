export interface OsrmRouteRequest {
  coordinates: [number, number][];
  geometries: 'geojson';
  overview: 'full';
  steps: false;
  alternatives: number;
}

export interface OsrmRouteResponse {
  code?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { type: string; coordinates: unknown };
  }>;
}

export interface OsrmEngine {
  route(
    request: OsrmRouteRequest,
    callback: (error: Error | null, response?: OsrmRouteResponse) => void,
  ): void;
}

export interface OsrmConstructor {
  new (options: { path: string; algorithm: 'MLD'; mmap_memory: true }): OsrmEngine;
  version: string;
}

export async function loadOsrmConstructor(): Promise<OsrmConstructor> {
  // The official native package does not publish TypeScript declarations.
  // @ts-expect-error Its runtime API is represented by the adapter types above.
  const module = await import('@project-osrm/osrm');
  return module.default as OsrmConstructor;
}
