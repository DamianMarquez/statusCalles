import { createDatabase } from './infrastructure/database/database.js';
import { getDatabaseUrl } from './infrastructure/database/config.js';
import { DrizzleReportRepository } from './infrastructure/database/report-repository.drizzle.js';
import { DrizzleReportFeedbackRepository } from './infrastructure/database/report-feedback-repository.drizzle.js';
import { buildApp } from './app/build-app.js';

const { database, pool } = createDatabase(getDatabaseUrl());
const app = buildApp(
  new DrizzleReportRepository(database),
  new DrizzleReportFeedbackRepository(database),
);
const host = process.env.BACKEND_HOST ?? '0.0.0.0';
const port = Number(process.env.BACKEND_PORT ?? 3000);

app.addHook('onClose', async () => {
  await pool.end();
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
