import { describe, expect, it, vi } from 'vitest';
import { StreetTileService, type StreetTileRepository } from './street-tile-service.js';

function repository(tile: Buffer | null = Buffer.from('tile')) {
  return { findTile: vi.fn().mockResolvedValue(tile) } satisfies StreetTileRepository;
}

describe('StreetTileService', () => {
  it('does not query the database below the first zoom with streets', async () => {
    const repo = repository();
    expect(await new StreetTileService(repo).getTile(9, 1, 1)).toBeNull();
    expect(repo.findTile).not.toHaveBeenCalled();
  });

  it('asks only for the road classes visible at that zoom', async () => {
    const repo = repository();
    await new StreetTileService(repo).getTile(11, 1, 1);
    expect(repo.findTile).toHaveBeenCalledWith(11, 1, 1, ['PRIMARY', 'SECONDARY']);
  });

  it('serves repeated requests from memory until they expire', async () => {
    let now = 0;
    const repo = repository();
    const service = new StreetTileService(repo, { ttlMs: 1000, now: () => now });
    await service.getTile(13, 1, 1);
    await service.getTile(13, 1, 1);
    expect(repo.findTile).toHaveBeenCalledTimes(1);
    now = 2000;
    await service.getTile(13, 1, 1);
    expect(repo.findTile).toHaveBeenCalledTimes(2);
  });

  it('treats a client version as a different tile and clears on demand', async () => {
    const repo = repository(null);
    const service = new StreetTileService(repo);
    await service.getTile(13, 1, 1, 'a');
    await service.getTile(13, 1, 1, 'b');
    expect(repo.findTile).toHaveBeenCalledTimes(2);
    service.clear();
    await service.getTile(13, 1, 1, 'a');
    expect(repo.findTile).toHaveBeenCalledTimes(3);
  });

  it('keeps at most maxEntries tiles', async () => {
    const repo = repository();
    const service = new StreetTileService(repo, { maxEntries: 2 });
    await service.getTile(13, 1, 1);
    await service.getTile(13, 2, 1);
    await service.getTile(13, 3, 1);
    await service.getTile(13, 1, 1);
    expect(repo.findTile).toHaveBeenCalledTimes(4);
  });
});
