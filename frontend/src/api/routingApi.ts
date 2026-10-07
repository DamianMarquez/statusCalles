export type RouteOption = 'FASTEST' | 'AVOID_BAD_STREETS' | 'AVOID_BLOCKED_STREETS';

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export interface AffectedRouteSegment {
  id: string;
  officialName: string;
  score: number | null;
  level: string | null;
  maximumSeverity: number | null;
  activeOfficialCut: boolean;
  blocked: boolean;
  reasons: string[];
}

export interface CalculatedRoute {
  route: { type: 'LineString'; coordinates: [number, number][] };
  distanceMeters: number;
  durationSeconds: number;
  warnings: string[];
  affectedSegments: AffectedRouteSegment[];
  option: RouteOption;
}

import { API_BASE_URL } from './apiBaseUrl.js';

export async function calculateRoute(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  options: RouteOption,
  signal?: AbortSignal,
): Promise<CalculatedRoute> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/routing`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ origin, destination, options }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('No pudimos conectarnos con el servicio de rutas.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'No pudimos calcular la ruta.';
    throw new Error(message);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !('route' in body) ||
    !body.route ||
    typeof body.route !== 'object' ||
    !('coordinates' in body.route) ||
    !Array.isArray(body.route.coordinates) ||
    body.route.coordinates.length < 2 ||
    !('distanceMeters' in body) ||
    typeof body.distanceMeters !== 'number' ||
    !('durationSeconds' in body) ||
    typeof body.durationSeconds !== 'number' ||
    !('warnings' in body) ||
    !Array.isArray(body.warnings) ||
    !('affectedSegments' in body) ||
    !Array.isArray(body.affectedSegments)
  )
    throw new Error('El servicio devolvió una ruta inválida.');
  return body as CalculatedRoute;
}
