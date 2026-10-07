export type AddressResultType = 'STREET_NUMBER' | 'INTERSECTION' | 'PLACE';

export interface AddressSearchResult {
  id: string;
  type: AddressResultType;
  displayName: string;
  street: string;
  streetCode: string | null;
  streetNumber: number | null;
  intersectionStreet: string | null;
  intersectionStreetCode: string | null;
  latitude: number;
  longitude: number;
  neighborhood: string | null;
  commune: string | null;
  confidence: number | null;
  source: 'USIG';
}

import { API_BASE_URL } from './apiBaseUrl.js';

export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSearchResult[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/addresses/search?q=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('No pudimos buscar la dirección en este momento.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'No pudimos buscar la dirección en este momento.';
    throw new Error(message);
  }
  if (!body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items)) {
    throw new Error('No pudimos buscar la dirección en este momento.');
  }
  return body.items as AddressSearchResult[];
}
