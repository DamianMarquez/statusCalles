import { defineConfig } from 'drizzle-kit';
import { getDatabaseUrl } from './src/infrastructure/database/config.js';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
