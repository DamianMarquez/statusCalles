import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { ZoneService, type ZoneStatsRepository } from '../application/zone-service.js';
import { registerZoneRoutes } from './zones.routes.js';

async function appWith(repository: ZoneStatsRepository) {
  const app = Fastify();
  await app.register(registerZoneRoutes, { prefix: '/api', service: new ZoneService(repository) });
  return app;
}

describe('GET /api/zones', () => {
  it('defaults to communes and sends cache headers', async () => {
    const repository = { findZones: vi.fn().mockResolvedValue([]) };
    const app = await appWith(repository);
    const response = await app.inject({ url: '/api/zones' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('max-age=300');
    expect(response.json()).toEqual({ type: 'FeatureCollection', features: [] });
    expect(repository.findZones).toHaveBeenCalledWith('commune');
  });

  it('accepts neighborhoods and rejects any other level', async () => {
    const repository = { findZones: vi.fn().mockResolvedValue([]) };
    const app = await appWith(repository);
    await app.inject({ url: '/api/zones?level=neighborhood' });
    expect(repository.findZones).toHaveBeenCalledWith('neighborhood');
    const bad = await app.inject({ url: '/api/zones?level=country' });
    expect(bad.statusCode).toBe(400);
  });
});
