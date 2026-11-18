import type { Geometry, Position } from 'geojson';

/** Tolerancia de simplificación en grados (~1 m en CABA). */
const SIMPLIFY_TOLERANCE = 0.00001;

function distanceToSegment(point: Position, start: Position, end: Position): number {
  const dx = end[0]! - start[0]!;
  const dy = end[1]! - start[1]!;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0]! - start[0]!) * dx + (point[1]! - start[1]!) * dy) / lengthSquared,
          ),
        );
  return Math.hypot(point[0]! - (start[0]! + t * dx), point[1]! - (start[1]! + t * dy));
}

/** Douglas-Peucker: conserva los extremos y quita puntos casi alineados. */
export function simplifyLine(points: Position[], tolerance = SIMPLIFY_TOLERANCE): Position[] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let maxDistance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const distance = distanceToSegment(points[index]!, points[first]!, points[last]!);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = index;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function lerp(a: Position, b: Position, t: number): Position {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t];
}

/**
 * Corte de esquinas de Chaikin. En líneas abiertas conserva el primer y el último punto;
 * en anillos cerrados el resultado vuelve a cerrar.
 */
export function chaikin(points: Position[], iterations = 2, closed = false): Position[] {
  let current = points;
  for (let step = 0; step < iterations; step += 1) {
    if (current.length < 3) return current;
    const ring = closed ? current.slice(0, -1) : current;
    const next: Position[] = [];
    const last = closed ? ring.length : ring.length - 1;
    for (let index = 0; index < last; index += 1) {
      const from = ring[index]!;
      const to = ring[(index + 1) % ring.length]!;
      next.push(lerp(from, to, 0.25), lerp(from, to, 0.75));
    }
    current = closed ? [...next, next[0]!] : [ring[0]!, ...next, ring[ring.length - 1]!];
  }
  return current;
}

/** Simplifica y suaviza el trazo hecho a mano. Los puntos no se tocan. */
export function smoothGeometry(geometry: Geometry): Geometry {
  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: chaikin(simplifyLine(geometry.coordinates), 3, false),
    };
  }
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring) => chaikin(simplifyLine(ring), 3, true)),
    };
  }
  return geometry;
}
