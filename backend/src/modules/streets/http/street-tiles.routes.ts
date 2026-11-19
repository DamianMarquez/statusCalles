import type { FastifyInstance } from 'fastify';
import type { StreetTileService } from '../application/street-tile-service.js';
import { isValidTileCoordinate } from '../domain/street-tiles.js';

interface TileParams {
  z: string;
  x: string;
  y: string;
}

/** Tiles vectoriales de calles: `GET /api/tiles/streets/{z}/{x}/{y}.pbf[?v=n]`. */
export async function registerStreetTileRoutes(
  app: FastifyInstance,
  options: { service: StreetTileService },
): Promise<void> {
  app.get<{ Params: TileParams; Querystring: { v?: string } }>(
    '/tiles/streets/:z/:x/:y.pbf',
    {
      schema: {
        params: {
          type: 'object',
          required: ['z', 'x', 'y'],
          properties: {
            z: { type: 'string', pattern: '^\\d{1,2}$' },
            x: { type: 'string', pattern: '^\\d{1,7}$' },
            y: { type: 'string', pattern: '^\\d{1,7}$' },
          },
        },
        querystring: {
          type: 'object',
          properties: { v: { type: 'string', maxLength: 20 } },
        },
      },
    },
    async (request, reply) => {
      const zoom = Number(request.params.z);
      const x = Number(request.params.x);
      const y = Number(request.params.y);
      if (!isValidTileCoordinate(zoom, x, y)) {
        return reply.code(400).send({ code: 'INVALID_TILE', message: 'Invalid tile coordinates.' });
      }
      const tile = await options.service.getTile(zoom, x, y, request.query.v ?? '');
      // Un tile vacío es válido: el mapa simplemente no dibuja nada en esa celda.
      reply.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
      if (!tile) return reply.code(204).send();
      return reply.header('Content-Type', 'application/vnd.mapbox-vector-tile').send(tile);
    },
  );
}
