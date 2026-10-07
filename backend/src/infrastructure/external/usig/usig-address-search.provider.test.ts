import { describe, expect, it, vi } from 'vitest';
import { AddressSearchProviderError } from '../../../modules/addresses/domain/address-search.js';
import { UsigAddressSearchProvider } from './usig-address-search.provider.js';

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('UsigAddressSearchProvider', () => {
  it('normalizes address and intersection results, and restricts results to CABA', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        direccionesNormalizadas: [
          {
            tipo: 'calle_altura',
            direccion: 'CORRIENTES AV. 1234, CABA',
            nombre_calle: 'CORRIENTES AV.',
            cod_calle: 3174,
            altura: 1234,
            cod_partido: 'caba',
            nombre_partido: 'CABA',
            coordenadas: { x: '-58.384222', y: '-34.603939', srid: 4326 },
          },
          {
            tipo: 'calle_y_calle',
            direccion: 'CORRIENTES AV. y CALLAO AV., CABA',
            nombre_calle: 'CORRIENTES AV.',
            cod_calle: 3174,
            nombre_calle_cruce: 'CALLAO AV.',
            cod_calle_cruce: 3030,
            cod_partido: 'caba',
            nombre_partido: 'CABA',
            coordenadas: { x: '-58.392293', y: '-34.604434' },
          },
          {
            tipo: 'calle_altura',
            direccion: 'CORRIENTES 1234, MORENO',
            nombre_calle: 'CORRIENTES',
            cod_partido: 'moreno',
            nombre_partido: 'Moreno',
            coordenadas: { x: '-58.7', y: '-34.6' },
          },
        ],
      }),
    );
    const provider = new UsigAddressSearchProvider('https://usig.test/normalizar/', 1000, fetcher);
    const items = await provider.search('Corrientes y Callao');
    expect(items.map((item) => item.type)).toEqual(['STREET_NUMBER', 'INTERSECTION']);
    expect(items[0]).toMatchObject({ latitude: -34.603939, longitude: -58.384222, source: 'USIG' });
    expect(items[1]).toMatchObject({
      intersectionStreet: 'CALLAO AV.',
      intersectionStreetCode: '3030',
    });
    const url = new URL(fetcher.mock.calls[0]![0] as string);
    expect(url.searchParams.get('direccion')).toBe('Corrientes y Callao, CABA');
    expect(url.searchParams.get('geocodificar')).toBe('TRUE');
    expect(url.searchParams.get('srid')).toBe('4326');
  });

  it('rejects invalid provider responses and non-success status', async () => {
    const invalid = new UsigAddressSearchProvider(
      'https://usig.test',
      1000,
      vi.fn().mockResolvedValue(response({})),
    );
    await expect(invalid.search('Corrientes 1')).rejects.toMatchObject({
      kind: 'INVALID_RESPONSE',
    });
    const unavailable = new UsigAddressSearchProvider(
      'https://usig.test',
      1000,
      vi.fn().mockResolvedValue(response({}, false)),
    );
    await expect(unavailable.search('Corrientes 1')).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
    expect(new AddressSearchProviderError('TIMEOUT')).toBeInstanceOf(Error);
  });

  it('maps fetch timeout to a provider timeout error', async () => {
    const fetcher = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const provider = new UsigAddressSearchProvider('https://usig.test', 1, fetcher as typeof fetch);
    await expect(provider.search('Corrientes 1')).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });
});
