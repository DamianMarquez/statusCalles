import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '../.env') });
dotenv.config();

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    'postgres://street_status:street_status@localhost:5432/street_status'
  );
}
