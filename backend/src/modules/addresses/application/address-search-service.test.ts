import { describe, expect, it, vi } from 'vitest';
import type { AddressSearchProvider, AddressSearchResult } from '../domain/address-search.js';
import { AddressSearchService } from './address-search-service.js';

const result: AddressSearchResult = {
  id: 'usig:1',
  type: 'STREET_NUMBER',
  displayName: 'CORRIENTES AV. 1234, CABA',
  street: 'CORRIENTES AV.',
  streetCode: '3174',
  streetNumber: 1234,
  intersectionStreet: null,
  intersectionStreetCode: null,
  latitude: -34.603939,
  longitude: -58.384222,
  neighborhood: 'CABA',
  commune: 'CABA',
  confidence: null,
  source: 'USIG',
};

describe('AddressSearchService', () => {
  it('normalizes query whitespace and caches equivalent searches for the TTL', async () => {
    let now = 1000;
    const provider: AddressSearchProvider = { search: vi.fn().mockResolvedValue([result]) };
    const service = new AddressSearchService(provider, 500, 2, () => now);
    await service.search('  Corrientes   1234 ');
    const cached = await service.search('corrientes 1234');
    expect(cached).toEqual([result]);
    expect(provider.search).toHaveBeenCalledTimes(1);
    now += 501;
    await service.search('corrientes 1234');
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it('does not cache provider failures', async () => {
    const provider: AddressSearchProvider = {
      search: vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue([result]),
    };
    const service = new AddressSearchService(provider);
    await expect(service.search('Corrientes 1234')).rejects.toThrow('failed');
    await expect(service.search('Corrientes 1234')).resolves.toEqual([result]);
    expect(provider.search).toHaveBeenCalledTimes(2);
  });
});
