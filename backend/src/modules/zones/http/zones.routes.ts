import type { FastifyInstance } from 'fastify';
import type { ZoneService } from '../application/zone-service.js';
import type { ZoneLevel } from '../domain/zone-metrics.js';

/** Comunas o barrios con sus métricas: `GET /api/zones?level=commune|neighborhood`. */
export async function registerZoneRoutes(
  app: FastifyInstance,
  options: { service: ZoneService },
): Promise<void> {
  app.get<{ Querystring: { level?: ZoneLevel } }>(
    '/zones',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { level: { type: 'string', enum: ['commune', 'neighborhood'] } },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      return options.service.getZones(request.query.level ?? 'commune');
    },
  );
}
