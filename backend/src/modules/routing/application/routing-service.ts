import type { StreetScoreService } from '../../streets/application/street-score-service.js';
import type { RoutingProvider } from './routing-provider.js';
import type { RoutingRepository } from './routing-repository.js';
import {
  calculateRoutePenalty,
  type RouteAffectedSegment,
  type RoutingRequest,
  type RoutingResult,
} from '../domain/routing.js';

export class RoutingError extends Error {
  constructor(
    message: string,
    readonly code:
      'LOCATION_OUTSIDE_CABA' | 'NO_ROUTE' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNAVAILABLE',
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

export class RoutingService {
  constructor(
    private readonly provider: RoutingProvider,
    private readonly repository: RoutingRepository,
    private readonly streetScores: StreetScoreService,
  ) {}

  async calculate(request: RoutingRequest): Promise<RoutingResult> {
    const [originInside, destinationInside] = await Promise.all([
      this.repository.isWithinCaba(request.origin),
      this.repository.isWithinCaba(request.destination),
    ]);
    if (!originInside || !destinationInside) {
      throw new RoutingError(
        'El origen y el destino deben estar dentro de CABA.',
        'LOCATION_OUTSIDE_CABA',
      );
    }

    let candidates;
    try {
      candidates = await this.provider.calculateRoute(request.origin, request.destination, {
        alternatives: request.options === 'FASTEST' ? 0 : 3,
      });
    } catch (error) {
      const kind = error && typeof error === 'object' && 'kind' in error ? error.kind : undefined;
      if (kind === 'TIMEOUT') {
        throw new RoutingError(
          'El proveedor de rutas tardó demasiado. Intentá de nuevo.',
          'PROVIDER_TIMEOUT',
        );
      }
      throw new RoutingError(
        'El proveedor de rutas no está disponible en este momento.',
        'PROVIDER_UNAVAILABLE',
      );
    }
    if (candidates.length === 0)
      throw new RoutingError('No encontramos una ruta entre esos puntos.', 'NO_ROUTE');

    const assessed = await Promise.all(
      candidates.map(async (candidate) => {
        const matched = await this.repository.findSegmentsAlongRoute(
          candidate.geometry.coordinates,
        );
        const scores = await this.streetScores.findForSegments(
          matched.map((segment) => segment.id),
        );
        const scoreById = new Map(scores.map((score) => [score.id, score]));
        const segments = matched.map((segment) => {
          const score = scoreById.get(segment.id);
          return {
            ...segment,
            score: score?.score ?? null,
            level: score?.level ?? null,
            availabilitySignals: score?.availability?.signals ?? [],
          };
        });
        const penalties = segments.map((segment) =>
          calculateRoutePenalty(segment, request.options),
        );
        const affectedSegments: RouteAffectedSegment[] = segments.flatMap((segment, index) => {
          const penalty = penalties[index]!;
          if (penalty.reasons.length === 0 && !penalty.blocked) return [];
          return [
            {
              id: segment.id,
              officialName: segment.officialName,
              score: segment.score,
              level: segment.level,
              maximumSeverity: segment.maximumSeverity,
              activeOfficialCut: segment.activeOfficialCut,
              blocked: penalty.blocked,
              reasons: penalty.reasons,
            },
          ];
        });
        return {
          candidate,
          penalties,
          affectedSegments,
          blocked: penalties.some((penalty) => penalty.blocked),
          effectiveDuration:
            candidate.durationSeconds + penalties.reduce((sum, item) => sum + item.delaySeconds, 0),
        };
      }),
    );

    const unblocked = assessed.filter((item) => !item.blocked);
    const pool =
      request.options === 'AVOID_BLOCKED_STREETS' && unblocked.length ? unblocked : assessed;
    const selected = [...pool].sort(
      (left, right) =>
        left.effectiveDuration - right.effectiveDuration ||
        left.candidate.distanceMeters - right.candidate.distanceMeters,
    )[0]!;
    const warnings: string[] = [];
    if (request.options !== 'FASTEST' && candidates.length === 1) {
      warnings.push(
        'El proveedor solo encontró una alternativa; no fue posible comparar otras rutas.',
      );
    }
    if (request.options !== 'FASTEST') {
      warnings.push(
        'Los incidentes oficiales no están disponibles; los cortes no pudieron verificarse.',
      );
    }
    if (request.options === 'AVOID_BLOCKED_STREETS' && selected.blocked) {
      warnings.push(
        'Todas las alternativas encontradas cruzan un tramo impasable; se muestra la de menor penalización.',
      );
    }
    if (selected.affectedSegments.length > 0) {
      const blockedCount = selected.affectedSegments.filter((item) => item.blocked).length;
      if (blockedCount > 0) {
        warnings.push(
          `La ruta atraviesa ${blockedCount} tramo${blockedCount === 1 ? '' : 's'} impasable${blockedCount === 1 ? '' : 's'}.`,
        );
      } else {
        warnings.push(
          `La ruta atraviesa ${selected.affectedSegments.length} tramo${selected.affectedSegments.length === 1 ? '' : 's'} con señales de deterioro.`,
        );
      }
    }
    return {
      route: selected.candidate.geometry,
      distanceMeters: selected.candidate.distanceMeters,
      durationSeconds: selected.candidate.durationSeconds,
      warnings,
      affectedSegments: selected.affectedSegments,
      option: request.options,
    };
  }
}
