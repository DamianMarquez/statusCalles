import type { FastifyInstance } from 'fastify';
import { MobilityCatalogService } from '../application/mobility-catalog.js';

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export async function registerMobilityRoutes(
  app: FastifyInstance,
  options: { catalog: MobilityCatalogService },
) {
  app.get('/mobility/sources', async () => options.catalog.listSourceStatuses());
  const unavailableResponse = () => ({
    status: 'UNAVAILABLE',
    source: 'API Transporte GCBA',
    message:
      'La fuente oficial de tránsito está suspendida o todavía no se encuentra sincronizada.',
  });
  const streetParamsSchema = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', pattern: uuidPattern } },
  } as const;
  app.get<{ Params: { id: string } }>(
    '/streets/:id/incidents',
    { schema: { params: streetParamsSchema } },
    async (_request, reply) => reply.code(503).send(unavailableResponse()),
  );
  app.get<{ Params: { id: string } }>(
    '/streets/:id/traffic',
    { schema: { params: streetParamsSchema } },
    async (_request, reply) => reply.code(503).send(unavailableResponse()),
  );
  app.get<{ Params: { id: string } }>(
    '/streets/:id/infrastructure',
    {
      schema: {
        params: streetParamsSchema,
      },
    },
    async (request) => options.catalog.findForStreet(request.params.id),
  );
}
