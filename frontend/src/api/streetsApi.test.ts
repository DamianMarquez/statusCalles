import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStreetConditionInViewport } from './streetsApi.js';

afterEach(() => vi.unstubAllGlobals());

describe('getStreetConditionInViewport', () => {
  it('sends the viewport, zoom, condition levels, and road classes independently', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await getStreetConditionInViewport(
      { south: -34.61, north: -34.59, west: -58.4, east: -58.37 },
      14.8,
      ['GOOD'],
      ['PRIMARY', 'LOCAL'],
      controller.signal,
    );

    const requestUrl = new URL(fetchMock.mock.calls[0]![0] as string, 'http://localhost');
    expect(requestUrl.searchParams.get('south')).toBe('-34.61000');
    expect(requestUrl.searchParams.get('zoom')).toBe('14');
    expect(requestUrl.searchParams.get('levels')).toBe('GOOD');
    expect(requestUrl.searchParams.get('roadClasses')).toBe('PRIMARY,LOCAL');
  });

  it('encodes empty road class selection without broadening the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await getStreetConditionInViewport(
      { south: -34.61, north: -34.59, west: -58.4, east: -58.37 },
      14,
      null,
      [],
      new AbortController().signal,
    );
    const requestUrl = new URL(fetchMock.mock.calls[0]![0] as string, 'http://localhost');
    expect(requestUrl.searchParams.get('roadClasses')).toBe('NONE');
  });
});
