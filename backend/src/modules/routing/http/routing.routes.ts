import type { FastifyInstance } from 'fastify';
import { ROUTE_OPTIONS, type RoutePoint } from '../domain/routing.js';
import { RoutingError, type RoutingService } from '../application/routing-service.js';
import { endpointRateLimit } from '../../../shared/rate-limits.js';

interface Body {
  origin: RoutePoint;
  destination: RoutePoint;
  options: (typeof ROUTE_OPTIONS)[number];
}

const pointSchema = {
  type: 'object',
  required: ['latitude', 'longitude'],
  additionalProperties: false,
  properties: {
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
  },
} as const;

export async function registerRoutingRoutes(
  app: FastifyInstance,
  options: { service: RoutingService },
): Promise<void> {
  app.post<{ Body: Body }>(
    '/routing',
    {
      bodyLimit: 4096,
      config: { rateLimit: endpointRateLimit('ROUTING') },
      schema: {
        body: {
          type: 'object',
          required: ['origin', 'destination', 'options'],
          additionalProperties: false,
          maxProperties: 3,
          properties: {
            origin: pointSchema,
            destination: pointSchema,
            options: { type: 'string', enum: ROUTE_OPTIONS },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await options.service.calculate(request.body);
      } catch (error) {
        if (!(error instanceof RoutingError)) throw error;
        const statusCode =
          error.code === 'LOCATION_OUTSIDE_CABA'
            ? 400
            : error.code === 'NO_ROUTE'
              ? 404
              : error.code === 'PROVIDER_TIMEOUT'
                ? 504
                : 502;
        return reply.code(statusCode).send({ code: error.code, message: error.message });
      }
    },
  );
}
