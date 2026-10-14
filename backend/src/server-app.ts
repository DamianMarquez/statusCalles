import { buildApp } from './app/build-app.js';
import { createDatabase } from './infrastructure/database/database.js';
import { getDatabaseUrl } from './infrastructure/database/config.js';
import { DrizzleReportRepository } from './infrastructure/database/report-repository.drizzle.js';
import { DrizzleReportFeedbackRepository } from './infrastructure/database/report-feedback-repository.drizzle.js';
import { DrizzleStreetScoreRepository } from './infrastructure/database/street-score-repository.drizzle.js';
import { DrizzleAuthRepository } from './infrastructure/database/auth-repository.drizzle.js';
import { DrizzleStreetCatalogRepository } from './infrastructure/database/street-catalog-repository.drizzle.js';
import { DrizzleMobilityCatalogRepository } from './infrastructure/database/mobility-catalog-repository.drizzle.js';
import { DrizzleAnalyticsRepository } from './infrastructure/database/analytics-repository.drizzle.js';
import { DrizzleRoadInformationRepository } from './infrastructure/database/road-information-repository.drizzle.js';
import { createPostgresRateLimitStore } from './infrastructure/database/postgres-rate-limit-store.js';
import { UsigAddressSearchProvider } from './infrastructure/external/usig/usig-address-search.provider.js';

export async function createServerApp(options: { logger?: boolean } = {}) {
  const { database, pool } = createDatabase(getDatabaseUrl());
  try {
    const app = buildApp(
      new DrizzleReportRepository(database),
      new DrizzleReportFeedbackRepository(database),
      {
        logger: options.logger,
        streetScoreRepository: new DrizzleStreetScoreRepository(database),
        roadInformationRepository: new DrizzleRoadInformationRepository(database),
        authRepository: new DrizzleAuthRepository(database),
        moderationDatabase: database,
        streetCatalogRepository: new DrizzleStreetCatalogRepository(database),
        mobilityCatalogRepository: new DrizzleMobilityCatalogRepository(database),
        analyticsRepository: new DrizzleAnalyticsRepository(database),
        addressSearchProvider: new UsigAddressSearchProvider(),
        checkDatabase: () => pool.query('SELECT 1'),
        rateLimitStore: createPostgresRateLimitStore(pool),
      },
    );
    app.addHook('onClose', async () => {
      await pool.end();
    });
    return { app, pool };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
