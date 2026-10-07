import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { describe, expect, it, vi } from 'vitest';
import { AddressSearchService } from '../application/address-search-service.js';
import {
  AddressSearchProviderError,
  type AddressSearchProvider,
  type AddressSearchResult,
} from '../domain/address-search.js';
import { registerAddressSearchRoutes } from './address-search.routes.js';

const item: AddressSearchResult = {
  id: 'address-1',
  type: 'INTERSECTION',
  displayName: 'Av. Corrientes y Av. Callao, CABA',
  street: 'AV. CORRIENTES',
  streetCode: '3174',
  streetNumber: null,
  intersectionStreet: 'AV. CALLAO',
  intersectionStreetCode: '3030',
  latitude: -34.604434,
  longitude: -58.392293,
  neighborhood: 'CABA',
  commune: 'CABA',
  confidence: null,
  source: 'USIG',
};

describe('GET /api/addresses/search', () => {
  it('returns normalized address results', async () => {
    const provider: AddressSearchProvider = { search: vi.fn().mockResolvedValue([item]) };
    const app = Fastify({ logger: false });
    await app.register(registerAddressSearchRoutes, {
      prefix: '/api',
      service: new AddressSearchService(provider),
    });
    const response = await app.inject({ url: '/api/addresses/search?q=corrientes%20y%20callao' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [item] });
    await app.close();
  });

  it('does not search short queries and hides provider errors', async () => {
    const provider: AddressSearchProvider = {
      search: vi.fn().mockRejectedValue(new AddressSearchProviderError('UNAVAILABLE')),
    };
    const app = Fastify({ logger: false });
    await app.register(registerAddressSearchRoutes, {
      prefix: '/api',
      service: new AddressSearchService(provider),
    });
    expect((await app.inject({ url: '/api/addresses/search?q=ab' })).json()).toEqual({ items: [] });
    expect(provider.search).not.toHaveBeenCalled();
    const failed = await app.inject({ url: '/api/addresses/search?q=corrientes' });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({
      code: 'ADDRESS_SEARCH_UNAVAILABLE',
      message: 'No pudimos buscar la dirección en este momento.',
    });
    await app.close();
  });

  it('reports provider timeouts as gateway timeouts', async () => {
    const provider: AddressSearchProvider = {
      search: vi.fn().mockRejectedValue(new AddressSearchProviderError('TIMEOUT')),
    };
    const app = Fastify({ logger: false });
    await app.register(registerAddressSearchRoutes, {
      prefix: '/api',
      service: new AddressSearchService(provider),
    });
    const response = await app.inject({ url: '/api/addresses/search?q=sarmiento%20500' });
    expect(response.statusCode).toBe(504);
    await app.close();
  });

  it('rate limits address search independently', async () => {
    const previous = process.env.RATE_LIMIT_ADDRESS_SEARCH_MAX;
    process.env.RATE_LIMIT_ADDRESS_SEARCH_MAX = '1';
    const provider: AddressSearchProvider = { search: vi.fn().mockResolvedValue([item]) };
    const app = Fastify({ logger: false });
    await app.register(rateLimit, { global: false });
    await app.register(registerAddressSearchRoutes, {
      prefix: '/api',
      service: new AddressSearchService(provider),
    });
    expect((await app.inject({ url: '/api/addresses/search?q=corrientes' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/addresses/search?q=callao' })).statusCode).toBe(429);
    await app.close();
    if (previous === undefined) delete process.env.RATE_LIMIT_ADDRESS_SEARCH_MAX;
    else process.env.RATE_LIMIT_ADDRESS_SEARCH_MAX = previous;
  });
});
