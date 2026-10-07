import type { FastifyInstance } from 'fastify';
import type { ScoreResult } from '../domain/street-score-calculator.js';
import { StreetScoreService } from '../application/street-score-service.js';

interface ViewportQuery {
  south: number;
  north: number;
  west: number;
  east: number;
}

interface StreetParams {
  id: string;
}

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

function serializeScore(result: ScoreResult & { officialName?: string }): unknown {
  return {
    ...result,
    calculatedAt: result.calculatedAt.toISOString(),
    metrics: {
      ...result.metrics,
      latestReportAt: result.metrics.latestReportAt?.toISOString() ?? null,
    },
    ...(result.segments ? { segments: result.segments.map(serializeScore) } : {}),
  };
}

export async function registerStreetScoreRoutes(
  app: FastifyInstance,
  options: { service: StreetScoreService },
): Promise<void> {
  app.get<{ Querystring: ViewportQuery }>(
    '/streets/score',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['south', 'north', 'west', 'east'],
          additionalProperties: false,
          properties: {
            south: { type: 'number', minimum: -90, maximum: 90 },
            north: { type: 'number', minimum: -90, maximum: 90 },
            west: { type: 'number', minimum: -180, maximum: 180 },
            east: { type: 'number', minimum: -180, maximum: 180 },
          },
        },
      },
    },
    async (request, reply) => {
      const { south, north, west, east } = request.query;
      if (south >= north || west >= east || north - south > 1 || east - west > 1) {
        return reply.code(400).send({ code: 'INVALID_BOUNDS', message: 'Invalid map bounds.' });
      }
      const areas = await options.service.findInViewport({ south, north, west, east });
      return areas.map((area) => ({
        ...area,
        reasons: { ...area.reasons, latestReportAt: area.reasons.latestReportAt.toISOString() },
      }));
    },
  );

  const streetScoreHandler = async (
    request: { params: StreetParams },
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  ) => {
    const result = await options.service.findForStreet(request.params.id);
    if (!result)
      return reply.code(404).send({ code: 'STREET_NOT_FOUND', message: 'Street not found.' });
    return serializeScore(result);
  };
  const scoreByStreetConfig = {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', pattern: uuidPattern } },
      },
    },
  } as const;
  app.get<{ Params: StreetParams }>('/streets/:id/score', scoreByStreetConfig, streetScoreHandler);
  app.get<{ Params: StreetParams }>(
    '/streets/:id/score/explanation',
    scoreByStreetConfig,
    streetScoreHandler,
  );
}
