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

export interface AddressSearchProvider {
  search(query: string, signal?: AbortSignal): Promise<AddressSearchResult[]>;
}

export class AddressSearchProviderError extends Error {
  constructor(readonly kind: 'TIMEOUT' | 'UNAVAILABLE' | 'INVALID_RESPONSE') {
    super(`Address search provider failed: ${kind}`);
    this.name = 'AddressSearchProviderError';
  }
}
