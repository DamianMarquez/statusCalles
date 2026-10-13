import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyRateLimitStoreCtor } from '@fastify/rate-limit';

interface RateLimitStoreOptions {
  path?: string;
  prefix?: string;
}

interface RateLimitCounterRow {
  current: number;
  ttl: number;
}

/** Creates a Fastify rate-limit store whose counters are shared by all app instances. */
export function createPostgresRateLimitStore(pool: Pool): FastifyRateLimitStoreCtor {
  return class PostgresRateLimitStore {
    private namespace: string;
    private cleanupCounter = 0;

    constructor(options: RateLimitStoreOptions = {}) {
      this.namespace = `${options.prefix ?? ''}${options.path ?? ''}`;
    }

    child(options: RateLimitStoreOptions): InstanceType<FastifyRateLimitStoreCtor> {
      const child = new PostgresRateLimitStore(options);
      child.namespace = `${this.namespace}:${options.prefix ?? ''}${options.path ?? ''}`;
      return child;
    }

    incr(
      key: string,
      callback: (error: Error | null, result?: RateLimitCounterRow) => void,
      timeWindow: number,
      max: number,
    ): void {
      void max;
      void this.increment(key, timeWindow).then(
        (result) => callback(null, result),
        (error: unknown) =>
          callback(error instanceof Error ? error : new Error('Rate limit store failed.')),
      );
    }

    private async increment(key: string, timeWindow: number): Promise<RateLimitCounterRow> {
      const storageKey = createHash('sha256').update(`${this.namespace}:${key}`).digest('hex');
      const result = await pool.query<RateLimitCounterRow>(
        `INSERT INTO rate_limit_windows (key, count, expires_at)
         VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond'))
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN rate_limit_windows.expires_at <= NOW() THEN 1 ELSE rate_limit_windows.count + 1 END,
           expires_at = CASE
             WHEN rate_limit_windows.expires_at <= NOW() THEN NOW() + ($2 * INTERVAL '1 millisecond')
             ELSE rate_limit_windows.expires_at
           END
         RETURNING count::int AS current,
           GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())) * 1000))::int AS ttl`,
        [storageKey, timeWindow],
      );

      // Periodically remove expired buckets so the shared table stays bounded.
      this.cleanupCounter += 1;
      if (this.cleanupCounter % 100 === 0) {
        void pool
          .query('DELETE FROM rate_limit_windows WHERE expires_at <= NOW()')
          .catch(() => undefined);
      }

      const row = result.rows[0];
      if (!row) throw new Error('PostgreSQL did not return a rate limit counter.');
      return row;
    }
  };
}
