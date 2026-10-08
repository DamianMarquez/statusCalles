export const ROUTE_OPTIONS = ['FASTEST', 'AVOID_BAD_STREETS', 'AVOID_BLOCKED_STREETS'] as const;
export type RouteOption = (typeof ROUTE_OPTIONS)[number];

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteLine {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface RouteCandidate {
  geometry: RouteLine;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteSegmentEvidence {
  id: string;
  officialName: string;
  lengthMeters: number;
  score: number | null;
  level: string | null;
  maximumSeverity: 1 | 2 | 3 | 4 | null;
  activeOfficialCut: boolean;
  availabilitySignals?: string[];
}

export interface RouteSegmentPenalty {
  segmentId: string;
  delaySeconds: number;
  blocked: boolean;
  reasons: string[];
}

export interface RouteAffectedSegment {
  id: string;
  officialName: string;
  score: number | null;
  level: string | null;
  maximumSeverity: number | null;
  activeOfficialCut: boolean;
  blocked: boolean;
  reasons: string[];
}

export interface RoutingRequest {
  origin: RoutePoint;
  destination: RoutePoint;
  options: RouteOption;
}

export interface RoutingResult {
  route: RouteLine;
  distanceMeters: number;
  durationSeconds: number;
  warnings: string[];
  affectedSegments: RouteAffectedSegment[];
  option: RouteOption;
}

export interface RoutingProviderFailure extends Error {
  kind: 'TIMEOUT' | 'UNAVAILABLE' | 'NO_ROUTE';
}

const speedMetersPerSecond = 13.89;
const badScoreThreshold = 55;

export function calculateRoutePenalty(
  segment: RouteSegmentEvidence,
  routeOption: RouteOption,
): RouteSegmentPenalty {
  const reasons: string[] = [];
  const isImpassable = segment.score === 0;
  const reportedBlockage = (segment.availabilitySignals ?? []).some((signal) =>
    ['ROAD_BLOCKED', 'TRAFFIC_CUT'].includes(signal),
  );
  const isBad = segment.score !== null && segment.score < badScoreThreshold;
  if (isBad) reasons.push(`score bajo (${segment.score}/100)`);
  if (segment.maximumSeverity === 3) reasons.push('severidad alta');
  if (segment.maximumSeverity === 4) reasons.push('severidad crítica');
  if (segment.activeOfficialCut) reasons.push('corte oficial activo');
  if (reportedBlockage && !segment.activeOfficialCut) reasons.push('bloqueo o corte reportado');
  const signals = segment.availabilitySignals ?? [];
  if (signals.includes('ROAD_WORK')) reasons.push('obra reportada');
  if (signals.includes('FLOOD')) reasons.push('inundación reportada');
  if (signals.includes('HIGH_TRAFFIC')) reasons.push('tráfico alto reportado');
  if (isImpassable) reasons.push('estado impasable');
  const blocked =
    routeOption === 'AVOID_BLOCKED_STREETS' &&
    (isImpassable || segment.activeOfficialCut || reportedBlockage);
  if (routeOption === 'FASTEST') {
    return { segmentId: segment.id, delaySeconds: 0, blocked: false, reasons };
  }

  const traversalSeconds = Math.max(0, segment.lengthMeters) / speedMetersPerSecond;
  let delaySeconds = 0;
  if (isBad) {
    const badness = (badScoreThreshold - Math.max(0, segment.score ?? 0)) / badScoreThreshold;
    const severityMultiplier =
      segment.maximumSeverity === 4
        ? 1.8
        : segment.maximumSeverity === 3
          ? 1.4
          : segment.maximumSeverity === 2
            ? 1.15
            : 1;
    delaySeconds += traversalSeconds * badness * 2 * severityMultiplier;
  }
  if (segment.maximumSeverity === 3) {
    delaySeconds += traversalSeconds * 0.25;
  } else if (segment.maximumSeverity === 4) {
    delaySeconds += traversalSeconds * 0.5;
  }
  if (segment.activeOfficialCut) {
    if (routeOption === 'AVOID_BAD_STREETS') delaySeconds += traversalSeconds * 5;
  }
  if (signals.includes('ROAD_WORK')) delaySeconds += traversalSeconds * 1.5;
  if (signals.includes('FLOOD')) delaySeconds += traversalSeconds * 3;
  if (signals.includes('HIGH_TRAFFIC')) delaySeconds += traversalSeconds;

  return { segmentId: segment.id, delaySeconds, blocked, reasons };
}
