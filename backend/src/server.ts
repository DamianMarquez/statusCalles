import { createDatabase } from './infrastructure/database/database.js';
import { getDatabaseUrl } from './infrastructure/database/config.js';
import { DrizzleReportRepository } from './infrastructure/database/report-repository.drizzle.js';
import { DrizzleReportFeedbackRepository } from './infrastructure/database/report-feedback-repository.drizzle.js';
import { DrizzleStreetScoreRepository } from './infrastructure/database/street-score-repository.drizzle.js';
import { buildApp } from './app/build-app.js';
import { DrizzleAuthRepository } from './infrastructure/database/auth-repository.drizzle.js';
import { DrizzleStreetCatalogRepository } from './infrastructure/database/street-catalog-repository.drizzle.js';
import { DrizzleMobilityCatalogRepository } from './infrastructure/database/mobility-catalog-repository.drizzle.js';
import { DrizzleAnalyticsRepository } from './infrastructure/database/analytics-repository.drizzle.js';
import { DrizzleRoutingRepository } from './infrastructure/database/routing-repository.drizzle.js';
import { OsrmRoutingProvider } from './infrastructure/routing/osrm-routing-provider.js';

const { database, pool } = createDatabase(getDatabaseUrl());
const app = buildApp(
  new DrizzleReportRepository(database),
  new DrizzleReportFeedbackRepository(database),
  {
    streetScoreRepository: new DrizzleStreetScoreRepository(database),
    authRepository: new DrizzleAuthRepository(database),
    moderationDatabase: database,
    streetCatalogRepository: new DrizzleStreetCatalogRepository(database),
    mobilityCatalogRepository: new DrizzleMobilityCatalogRepository(database),
    analyticsRepository: new DrizzleAnalyticsRepository(database),
    routingProvider: new OsrmRoutingProvider(),
    routingRepository: new DrizzleRoutingRepository(database),
  },
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
