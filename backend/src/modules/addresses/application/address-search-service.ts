import type { AddressSearchProvider, AddressSearchResult } from '../domain/address-search.js';

interface CacheEntry {
  expiresAt: number;
  items: AddressSearchResult[];
}

export class AddressSearchService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly provider: AddressSearchProvider,
    private readonly cacheTtlMs = 60_000,
    private readonly maxCacheEntries = 250,
    private readonly now: () => number = Date.now,
  ) {}

  async search(rawQuery: string): Promise<AddressSearchResult[]> {
    const query = rawQuery.trim().replace(/\s+/g, ' ');
    const key = query.toLocaleLowerCase('es-AR');
    const currentTime = this.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > currentTime) return cached.items;
    if (cached) this.cache.delete(key);

    const items = await this.provider.search(query);
    this.cache.delete(key);
    while (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { items, expiresAt: currentTime + this.cacheTtlMs });
    return items;
  }
}
