import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createPostgresRateLimitStore } from './postgres-rate-limit-store.js';

describe('PostgreSQL rate limit store', () => {
  it('uses one atomic database upsert and hashes the route and client key', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ current: 3, ttl: 42 }] });
    const pool = { query } as unknown as Pool;
    const Store = createPostgresRateLimitStore(pool);
    const store = new Store({ path: '/api/reports' });
    const result = await new Promise<{ current: number; ttl: number }>((resolve, reject) => {
      store.incr(
        '203.0.113.5',
        (error, value) => {
          if (error) reject(error);
          else if (value) resolve(value);
          else reject(new Error('Missing rate limit result.'));
        },
        60_000,
        20,
      );
    });

    expect(result).toEqual({ current: 3, ttl: 42 });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('ON CONFLICT (key) DO UPDATE');
    expect(query.mock.calls[0]?.[1]?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(query.mock.calls[0]?.[1]).toEqual([expect.any(String), 60_000]);
  });
});
