import type { FastifyInstance } from 'fastify';
import {
  MAP_FEATURE_CATEGORIES,
  toFeatureCollection,
  type MapFeatureCategory,
  type MapFeaturesRepository,
} from '../application/map-features.js';

/**
 * Marcas de toda la ciudad (reductores de OpenStreetMap, obras públicas del GCBA).
 * `GET /api/map-features?categories=calming,works`
 */
export async function registerMapFeatureRoutes(
  app: FastifyInstance,
  options: { repository: MapFeaturesRepository },
): Promise<void> {
  app.get<{ Querystring: { categories?: string } }>(
    '/map-features',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { categories: { type: 'string', maxLength: 60 } },
        },
      },
    },
    async (request, reply) => {
      const requested = request.query.categories
        ? request.query.categories.split(',').filter(Boolean)
        : [...MAP_FEATURE_CATEGORIES];
      if (requested.some((item) => !(MAP_FEATURE_CATEGORIES as readonly string[]).includes(item))) {
        return reply
          .code(400)
          .send({ code: 'INVALID_CATEGORIES', message: 'Invalid map feature category.' });
      }
      const features = await options.repository.findFeatures(requested as MapFeatureCategory[]);
      // Son datos que cambian por importación (días o meses): una hora de caché sobra.
      reply.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      return toFeatureCollection(features);
    },
  );
}
