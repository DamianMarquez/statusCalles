import { createServer } from 'node:http';
import { once } from 'node:events';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFastifyNodeHandler } from './fastify-node-handler.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.close();
      await once(server, 'close');
    }),
  );
});

describe('Fastify Node handler adapter', () => {
  it('serves API routes, preserves cookies, and reuses one Fastify instance', async () => {
    const app = Fastify({ logger: false });
    app.get('/api/health', async (request, reply) => {
      reply.header('set-cookie', 'street-status-session=token; HttpOnly; SameSite=Lax');
      return { status: 'ok', cookie: request.headers.cookie };
    });
    const createApp = vi.fn(async () => app);
    const server = createServer(createFastifyNodeHandler(createApp));
    servers.push(server);
    server.listen(0);
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address.');

    const first = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
      headers: { cookie: 'street-status-session=session-token' },
    });
    const second = await fetch(`http://127.0.0.1:${address.port}/api/health`);

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      status: 'ok',
      cookie: 'street-status-session=session-token',
    });
    expect(first.headers.get('set-cookie')).toContain('HttpOnly');
    expect(second.status).toBe(200);
    expect(createApp).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns a generic JSON error if app initialization fails', async () => {
    const server = createServer(
      createFastifyNodeHandler(async () => {
        throw new Error('sensitive initialization detail');
      }),
    );
    servers.push(server);
    server.listen(0);
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address.');

    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error interno.',
    });
  });
});
