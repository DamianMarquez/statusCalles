import type { FastifyInstance } from 'fastify';
import { StreetScoreService } from '../application/street-score-service.js';

interface ViewportQuery {
  south: number;
  north: number;
  west: number;
  east: number;
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
}
