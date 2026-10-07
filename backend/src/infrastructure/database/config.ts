import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '../.env') });
dotenv.config();

export function getDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl) return configuredUrl;
  throw new Error('DATABASE_URL must be configured before connecting to PostgreSQL.');
}

export function getTestDatabaseUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL must point to a dedicated, migrated test database before running database tests.',
    );
  }
  return testDatabaseUrl;
}

export function getDatabasePoolOptions() {
  return {
    max: getPositiveInteger('DB_POOL_MAX', 5),
    idleTimeoutMillis: getPositiveInteger('DB_IDLE_TIMEOUT_MS', 10_000),
    connectionTimeoutMillis: getPositiveInteger('DB_CONNECTION_TIMEOUT_MS', 10_000),
    query_timeout: getPositiveInteger('DB_QUERY_TIMEOUT_MS', 30_000),
    application_name: 'street-status',
  };
}

function getPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
