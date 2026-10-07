import type {
  AddressSearchProvider,
  AddressSearchResult,
} from '../../../modules/addresses/domain/address-search.js';
import { AddressSearchProviderError } from '../../../modules/addresses/domain/address-search.js';

interface UsigAddress {
  tipo?: unknown;
  direccion?: unknown;
  nombre_calle?: unknown;
  cod_calle?: unknown;
  altura?: unknown;
  nombre_calle_cruce?: unknown;
  cod_calle_cruce?: unknown;
  nombre_localidad?: unknown;
  nombre_partido?: unknown;
  cod_partido?: unknown;
  coordenadas?: { x?: unknown; y?: unknown; srid?: unknown } | null;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function mapResult(address: UsigAddress): AddressSearchResult | null {
  if (address.tipo !== 'calle_altura' && address.tipo !== 'calle_y_calle') return null;
  const type = address.tipo === 'calle_y_calle' ? 'INTERSECTION' : 'STREET_NUMBER';
  const displayName = asText(address.direccion);
  const street = asText(address.nombre_calle);
  const latitude = asNumber(address.coordenadas?.y);
  const longitude = asNumber(address.coordenadas?.x);
  if (!displayName || !street || latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const streetNumber = asNumber(address.altura);
  const streetCode = asText(address.cod_calle);
  const intersectionStreet = asText(address.nombre_calle_cruce);
  const intersectionStreetCode = asText(address.cod_calle_cruce);
  return {
    id: `usig:${type}:${streetCode ?? ''}:${intersectionStreetCode ?? ''}:${streetNumber ?? ''}:${latitude}:${longitude}`,
    type,
    displayName,
    street,
    streetCode,
    streetNumber,
    intersectionStreet,
    intersectionStreetCode,
    latitude,
    longitude,
    neighborhood: null,
    commune: asText(address.nombre_partido),
    confidence: null,
    source: 'USIG',
  };
}

export class UsigAddressSearchProvider implements AddressSearchProvider {
  constructor(
    private readonly baseUrl = process.env.USIG_ADDRESS_SEARCH_URL ??
      'https://servicios.usig.buenosaires.gob.ar/normalizar/',
    private readonly timeoutMs = 4000,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async search(query: string, signal?: AbortSignal): Promise<AddressSearchResult[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('direccion', `${query}, CABA`);
    url.searchParams.set('maxOptions', '10');
    url.searchParams.set('geocodificar', 'TRUE');
    url.searchParams.set('srid', '4326');
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Accept: 'application/json' },
        signal: requestSignal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timeout.aborted) throw new AddressSearchProviderError('TIMEOUT');
      throw new AddressSearchProviderError('UNAVAILABLE');
    }
    if (!response.ok) throw new AddressSearchProviderError('UNAVAILABLE');

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (timeout.aborted) throw new AddressSearchProviderError('TIMEOUT');
      throw new AddressSearchProviderError('INVALID_RESPONSE');
    }
    if (!body || typeof body !== 'object' || !('direccionesNormalizadas' in body)) {
      throw new AddressSearchProviderError('INVALID_RESPONSE');
    }
    const addresses = (body as { direccionesNormalizadas?: unknown }).direccionesNormalizadas;
    if (!Array.isArray(addresses)) throw new AddressSearchProviderError('INVALID_RESPONSE');

    return addresses
      .filter((item): item is UsigAddress => Boolean(item) && typeof item === 'object')
      .filter((item) => {
        const district =
          `${asText(item.cod_partido) ?? ''} ${asText(item.nombre_partido) ?? ''}`.toLocaleLowerCase(
            'es-AR',
          );
        return district.includes('caba') || district.includes('capital');
      })
      .map(mapResult)
      .filter((item): item is AddressSearchResult => item !== null);
  }
}
