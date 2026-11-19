import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { MapFeaturesRepository } from '../application/map-features.js';
import { registerMapFeatureRoutes } from './map-features.routes.js';

async function appWith(repository: MapFeaturesRepository) {
  const app = Fastify();
  await app.register(registerMapFeatureRoutes, { prefix: '/api', repository });
  return app;
}

describe('GET /api/map-features', () => {
  it('returns a GeoJSON point collection with cache headers', async () => {
    const repository: MapFeaturesRepository = {
      findFeatures: vi.fn().mockResolvedValue([
        {
          id: 'f1',
          type: 'SPEED_BUMP',
          name: '',
          source: 'osm-traffic-calming',
          longitude: -58.4,
          latitude: -34.6,
          metadata: { calming: 'bump' },
        },
      ]),
    };
    const app = await appWith(repository);
    const response = await app.inject({ url: '/api/map-features?categories=calming' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('max-age=3600');
    expect(response.json()).toMatchObject({
      type: 'FeatureCollection',
      features: [
        {
          geometry: { type: 'Point', coordinates: [-58.4, -34.6] },
          properties: { type: 'SPEED_BUMP', source: 'osm-traffic-calming', calming: 'bump' },
        },
      ],
    });
    expect(repository.findFeatures).toHaveBeenCalledWith(['calming']);
  });

  it('asks for every category when none is given and rejects unknown ones', async () => {
    const repository: MapFeaturesRepository = { findFeatures: vi.fn().mockResolvedValue([]) };
    const app = await appWith(repository);
    await app.inject({ url: '/api/map-features' });
    expect(repository.findFeatures).toHaveBeenCalledWith(['calming', 'works']);
    const bad = await app.inject({ url: '/api/map-features?categories=secret' });
    expect(bad.statusCode).toBe(400);
  });
});
