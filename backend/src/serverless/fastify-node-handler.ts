import type { FastifyInstance } from 'fastify';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function createFastifyNodeHandler(
  createApp: () => Promise<FastifyInstance>,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  let appPromise: Promise<FastifyInstance> | undefined;

  return async (request, response) => {
    try {
      const pendingApp = (appPromise ??= createApp());
      let app: FastifyInstance;
      try {
        app = await pendingApp;
      } catch (error) {
        if (appPromise === pendingApp) appPromise = undefined;
        throw error;
      }
      await app.ready();
      app.server.emit('request', request, response);
    } catch {
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json; charset=utf-8');
      }
      if (!response.writableEnded) {
        response.end(
          JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno.' }),
        );
      }
    }
  };
}
