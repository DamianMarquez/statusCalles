import { describe, expect, it, vi } from 'vitest';
import { StreetLocationResolverService } from './street-location-resolver.js';

describe('StreetLocationResolverService', () => {
  it('uses a bounded proximity lookup and allows a report to remain unassociated', async () => {
    const findNearestStreetSegment = vi.fn().mockResolvedValue(null);
    const resolver = new StreetLocationResolverService({ findNearestStreetSegment });

    await expect(resolver.resolveStreetFromLocation(-34.6037, -58.3816)).resolves.toBeNull();
    expect(findNearestStreetSegment).toHaveBeenCalledWith(-34.6037, -58.3816, 35);
  });

  it('returns the matched official street and segment identifiers', async () => {
    const resolved = { streetId: 'street-1', streetSegmentId: 'segment-1' };
    const resolver = new StreetLocationResolverService({
      findNearestStreetSegment: vi.fn().mockResolvedValue(resolved),
    });

    await expect(resolver.resolveStreetFromLocation(-34.6037, -58.3816)).resolves.toEqual(resolved);
  });
});
