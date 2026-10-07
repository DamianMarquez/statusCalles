import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { getDatabasePoolOptions } from './config.js';

export type StreetStatusDatabase = NodePgDatabase<typeof schema>;

export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    options: '-c search_path=public,extensions',
    ...getDatabasePoolOptions(),
  });
  const database = drizzle(pool, { schema });

  return { database, pool };
}
