import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: { checkDatabase?: () => Promise<unknown> } = {},
): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    if (!options.checkDatabase) {
      return reply.code(503).send({ status: 'unavailable', database: 'unavailable' });
    }

    try {
      await options.checkDatabase();
      return { status: 'ok', database: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', database: 'unavailable' });
    }
  });
}
