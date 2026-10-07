import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoutingError, type RoutingService } from '../application/routing-service.js';
import { registerRoutingRoutes } from './routing.routes.js';

const service = { calculate: vi.fn() };
let app: ReturnType<typeof Fastify>;
const validRequest = {
  origin: { latitude: -34.6037, longitude: -58.3816 },
  destination: { latitude: -34.5895, longitude: -58.3974 },
  options: 'FASTEST',
};

beforeEach(async () => {
  vi.clearAllMocks();
  app = Fastify({ logger: false });
  await registerRoutingRoutes(app, { service: service as unknown as RoutingService });
});

afterEach(async () => app.close());

describe('POST /routing', () => {
  it('returns the calculated route contract', async () => {
    service.calculate.mockResolvedValue({
      route: {
        type: 'LineString',
        coordinates: [
          [-58.38, -34.6],
          [-58.37, -34.59],
        ],
      },
      distanceMeters: 1200,
      durationSeconds: 240,
      warnings: [],
      affectedSegments: [],
      option: 'FASTEST',
    });
    const response = await app.inject({ method: 'POST', url: '/routing', payload: validRequest });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ distanceMeters: 1200, durationSeconds: 240 });
    expect(service.calculate).toHaveBeenCalledWith(validRequest);
  });

  it('rejects invalid coordinates, options, and additional fields', async () => {
    const invalidCoordinate = await app.inject({
      method: 'POST',
      url: '/routing',
      payload: { ...validRequest, origin: { latitude: -100, longitude: -58 } },
    });
    const invalidOption = await app.inject({
      method: 'POST',
      url: '/routing',
      payload: { ...validRequest, options: 'MAGIC' },
    });
    const extra = await app.inject({
      method: 'POST',
      url: '/routing',
      payload: { ...validRequest, profile: 'cycling' },
    });
    expect(invalidCoordinate.statusCode).toBe(400);
    expect(invalidOption.statusCode).toBe(400);
    expect(extra.statusCode).toBe(400);
    expect(service.calculate).not.toHaveBeenCalled();
  });

  it('maps boundary, no-route, timeout, and upstream errors to safe responses', async () => {
    service.calculate.mockRejectedValueOnce(
      new RoutingError(
        'El origen y el destino deben estar dentro de CABA.',
        'LOCATION_OUTSIDE_CABA',
      ),
    );
    service.calculate.mockRejectedValueOnce(
      new RoutingError('No encontramos una ruta entre esos puntos.', 'NO_ROUTE'),
    );
    service.calculate.mockRejectedValueOnce(
      new RoutingError(
        'El proveedor de rutas tardó demasiado. Intentá de nuevo.',
        'PROVIDER_TIMEOUT',
      ),
    );
    service.calculate.mockRejectedValueOnce(
      new RoutingError(
        'El proveedor de rutas no está disponible en este momento.',
        'PROVIDER_UNAVAILABLE',
      ),
    );
    const statuses = [];
    for (let index = 0; index < 4; index += 1) {
      const response = await app.inject({ method: 'POST', url: '/routing', payload: validRequest });
      statuses.push(response.statusCode);
      expect(response.body).not.toContain('private upstream');
    }
    expect(statuses).toEqual([400, 404, 504, 502]);
  });
});
