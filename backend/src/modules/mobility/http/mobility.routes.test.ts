import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { MobilityCatalogService } from '../application/mobility-catalog.js';
import type { MobilityCatalogRepository } from '../application/mobility-catalog.js';
import { registerMobilityRoutes } from './mobility.routes.js';

function createRepository(): MobilityCatalogRepository {
  return {
    findForStreet: vi.fn().mockResolvedValue([
      {
        id: 'item-1',
        type: 'BIKE_LANE',
        name: 'Calle Falsa',
        details: { category: 'Ciclovías' },
        source: {
          name: 'Ciclovías GCBA',
          url: 'https://data.buenosaires.gob.ar/dataset/ciclovias',
          lastSuccessfulSync: null,
        },
      },
    ]),
    listSourceStatuses: vi.fn().mockResolvedValue([]),
  };
}

describe('mobility routes', () => {
  it('returns normalized infrastructure for a street', async () => {
    const repository = createRepository();
    const app = Fastify();
    await app.register(registerMobilityRoutes, {
      prefix: '/api',
      catalog: new MobilityCatalogService(repository),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/streets/11111111-1111-4111-8111-111111111111/infrastructure',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({
      type: 'BIKE_LANE',
      source: { name: 'Ciclovías GCBA' },
    });
    expect(repository.findForStreet).toHaveBeenCalledOnce();
    await app.close();
  });

  it('exposes suspended official realtime API status without making a network request', async () => {
    const app = Fastify();
    await app.register(registerMobilityRoutes, {
      prefix: '/api',
      catalog: new MobilityCatalogService(createRepository()),
    });
    const response = await app.inject({ method: 'GET', url: '/api/mobility/sources' });
    expect(response.json()).toContainEqual(
      expect.objectContaining({
        status: 'SUSPENDED',
        source: expect.stringContaining('API Transporte GCBA'),
      }),
    );
    await app.close();
  });

  it('rejects malformed street ids', async () => {
    const app = Fastify();
    await app.register(registerMobilityRoutes, {
      prefix: '/api',
      catalog: new MobilityCatalogService(createRepository()),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/streets/not-a-uuid/infrastructure',
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns explicit unavailable status rather than treating suspended traffic as an empty feed', async () => {
    const app = Fastify();
    await app.register(registerMobilityRoutes, {
      prefix: '/api',
      catalog: new MobilityCatalogService(createRepository()),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/streets/11111111-1111-4111-8111-111111111111/incidents',
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'UNAVAILABLE', source: 'API Transporte GCBA' });
    await app.close();
  });
});
