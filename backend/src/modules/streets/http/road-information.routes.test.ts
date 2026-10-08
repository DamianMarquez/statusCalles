import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerRoadInformationRoutes } from './road-information.routes.js';
import { RoadInformationService } from '../application/road-information-service.js';
import type { RoadInformationRepository } from '../application/road-information-service.js';

const segmentId = 'bb19f4a6-cd9d-4fc8-a51d-ff9a6f75d101';
const proposalId = 'f3b8e67a-b7a1-4bd4-92de-8b8196358f10';
const appInstances: Array<Awaited<ReturnType<typeof Fastify>>> = [];

async function createTestApp(authenticated = false) {
  const repository: RoadInformationRepository = {
    findForSegment: vi.fn().mockResolvedValue({
      segmentId,
      streetId: 'street-id',
      streetName: 'Avenida Test',
      profile: {
        roadType: null,
        surfaceType: null,
        surfaceCondition: null,
        specialTreatments: null,
        updatedAt: null,
      },
      proposals: [],
      history: [],
    }),
    createProposal: vi.fn().mockImplementation(async () => ({
      segmentId,
      streetId: 'street-id',
      streetName: 'Avenida Test',
      profile: {
        roadType: null,
        surfaceType: null,
        surfaceCondition: null,
        specialTreatments: null,
        updatedAt: null,
      },
      proposals: [],
      history: [],
    })),
    confirmProposal: vi.fn().mockResolvedValue({
      information: {
        segmentId,
        streetId: 'street-id',
        streetName: 'Avenida Test',
        profile: {
          roadType: null,
          surfaceType: 'ASPHALT',
          surfaceCondition: null,
          specialTreatments: null,
          updatedAt: '2026-10-08T12:00:00.000Z',
        },
        proposals: [],
        history: [],
      },
    }),
  };
  const app = Fastify({ logger: false });
  app.decorateRequest('authUser', null);
  if (authenticated) {
    app.addHook('onRequest', async (request) => {
      request.authUser = {
        id: '11a5e72e-4020-4a35-8563-a72fa6a822be',
        email: 'user@example.test',
        displayName: 'User',
        createdAt: new Date('2026-10-08T12:00:00.000Z'),
        role: 'USER',
      };
    });
  }
  await app.register(registerRoadInformationRoutes, {
    prefix: '/api',
    service: new RoadInformationService(repository),
  });
  await app.ready();
  appInstances.push(app);
  return { app, repository };
}

afterEach(async () => {
  await Promise.all(appInstances.splice(0).map((app) => app.close()));
});

describe('road information routes', () => {
  it('allows public segment information reads', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/streets/segments/${segmentId}/information`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().profile.surfaceType).toBeNull();
  });

  it('requires login to create a street information proposal', async () => {
    const { app, repository } = await createTestApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/streets/segments/${segmentId}/information`,
      payload: { surfaceType: 'ASPHALT' },
    });
    expect(response.statusCode).toBe(401);
    expect(repository.createProposal).not.toHaveBeenCalled();
  });

  it('accepts a valid partial proposal and rejects empty input', async () => {
    const { app, repository } = await createTestApp(true);
    const created = await app.inject({
      method: 'POST',
      url: `/api/streets/segments/${segmentId}/information`,
      payload: { surfaceType: 'CONCRETE_ASPHALT' },
    });
    expect(created.statusCode).toBe(201);
    expect(repository.createProposal).toHaveBeenCalledWith(segmentId, expect.any(String), {
      surfaceType: 'CONCRETE_ASPHALT',
    });

    const invalid = await app.inject({
      method: 'POST',
      url: `/api/streets/segments/${segmentId}/information`,
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('requires login to confirm a proposal', async () => {
    const { app, repository } = await createTestApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/streets/information-proposals/${proposalId}/confirm`,
    });
    expect(response.statusCode).toBe(401);
    expect(repository.confirmProposal).not.toHaveBeenCalled();
  });
});
