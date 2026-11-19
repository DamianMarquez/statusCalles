import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import type { FastifyRateLimitStoreCtor } from '@fastify/rate-limit';
import { registerHealthRoutes } from '../modules/health/health.routes.js';
import type { ReportRepository } from '../modules/reports/application/report-repository.js';
import { ReportService } from '../modules/reports/application/report-service.js';
import type { ReportFeedbackRepository } from '../modules/reports/application/report-feedback-repository.js';
import { ReportFeedbackService } from '../modules/reports/application/report-feedback-service.js';
import { registerReportFeedbackRoutes } from '../modules/reports/http/report-feedback.routes.js';
import { registerModerationRoutes } from '../modules/reports/http/moderation.routes.js';
import { registerReportsRoutes } from '../modules/reports/http/reports.routes.js';
import type { StreetScoreRepository } from '../modules/streets/application/street-score-repository.js';
import type { StreetCatalogRepository } from '../modules/streets/application/street-catalog.js';
import { StreetCatalogService } from '../modules/streets/application/street-catalog.js';
import { StreetLocationResolverService } from '../modules/streets/application/street-location-resolver.js';
import { registerStreetCatalogRoutes } from '../modules/streets/http/street-catalog.routes.js';
import type { StreetScoreRefresher } from '../modules/streets/application/street-score-refresher.js';
import { StreetScoreService } from '../modules/streets/application/street-score-service.js';
import type { StreetTileService } from '../modules/streets/application/street-tile-service.js';
import { registerStreetTileRoutes } from '../modules/streets/http/street-tiles.routes.js';
import type { MapFeaturesRepository } from '../modules/mobility/application/map-features.js';
import { registerMapFeatureRoutes } from '../modules/mobility/http/map-features.routes.js';
import type { ZoneService } from '../modules/zones/application/zone-service.js';
import { registerZoneRoutes } from '../modules/zones/http/zones.routes.js';
import { registerStreetScoreRoutes } from '../modules/streets/http/street-score.routes.js';
import type { RoadInformationRepository } from '../modules/streets/application/road-information-service.js';
import { RoadInformationService } from '../modules/streets/application/road-information-service.js';
import { registerRoadInformationRoutes } from '../modules/streets/http/road-information.routes.js';
import type { MobilityCatalogRepository } from '../modules/mobility/application/mobility-catalog.js';
import { MobilityCatalogService } from '../modules/mobility/application/mobility-catalog.js';
import { registerMobilityRoutes } from '../modules/mobility/http/mobility.routes.js';
import type { AuthRepository } from '../modules/users/application/auth-repository.js';
import { AuthService } from '../modules/users/application/auth-service.js';
import { sessionCookieName } from '../modules/users/http/auth-context.js';
import { registerAuthRoutes } from '../modules/users/http/auth.routes.js';
import type { StreetStatusDatabase } from '../infrastructure/database/database.js';
import type { AnalyticsRepository } from '../modules/analytics/application/analytics-repository.js';
import { AnalyticsService } from '../modules/analytics/application/analytics-service.js';
import { registerAnalyticsRoutes } from '../modules/analytics/http/analytics.routes.js';
import type { AddressSearchProvider } from '../modules/addresses/domain/address-search.js';
import { AddressSearchService } from '../modules/addresses/application/address-search-service.js';
import { registerAddressSearchRoutes } from '../modules/addresses/http/address-search.routes.js';

export function buildApp(
  reportRepository: ReportRepository,
  feedbackRepository: ReportFeedbackRepository,
  options: {
    logger?: boolean;
    streetScoreRepository?: StreetScoreRepository;
    streetScoreRefresher?: StreetScoreRefresher;
    streetTileService?: StreetTileService;
    zoneService?: ZoneService;
    roadInformationRepository?: RoadInformationRepository;
    authRepository?: AuthRepository;
    moderationDatabase?: StreetStatusDatabase;
    streetCatalogRepository?: StreetCatalogRepository;
    mobilityCatalogRepository?: MobilityCatalogRepository;
    mapFeaturesRepository?: MapFeaturesRepository;
    analyticsRepository?: AnalyticsRepository;
    addressSearchProvider?: AddressSearchProvider;
    checkDatabase?: () => Promise<unknown>;
    rateLimitStore?: FastifyRateLimitStoreCtor;
  } = {},
): FastifyInstance {
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY, process.env.VERCEL === '1');
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy,
  });
  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const vercelHost of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (vercelHost) allowedOrigins.push(`https://${vercelHost}`);
  }

  app.register(cors, { origin: allowedOrigins, credentials: true });
  app.register(cookie);
  // Las respuestas de calles son JSON grande y repetitivo: comprimen muy bien.
  app.register(compress, {
    threshold: 1024,
    // Los tiles vectoriales no figuran como comprimibles por defecto.
    customTypes: /json|text|javascript|xml|vnd\.mapbox-vector-tile/,
  });
  app.register(rateLimit, {
    global: false,
    ...(options.rateLimitStore ? { store: options.rateLimitStore } : {}),
  });
  app.decorateRequest('authUser', null);
  app.register(registerHealthRoutes, {
    prefix: '/api',
    checkDatabase: options.checkDatabase,
  });
  if (options.addressSearchProvider) {
    app.register(registerAddressSearchRoutes, {
      prefix: '/api',
      service: new AddressSearchService(options.addressSearchProvider),
    });
  }
  const streetCatalog = options.streetCatalogRepository
    ? new StreetCatalogService(options.streetCatalogRepository)
    : undefined;
  if (options.mobilityCatalogRepository) {
    app.register(registerMobilityRoutes, {
      prefix: '/api',
      catalog: new MobilityCatalogService(options.mobilityCatalogRepository),
    });
  }
  const reportService = new ReportService(
    reportRepository,
    streetCatalog ? new StreetLocationResolverService(streetCatalog) : undefined,
    options.streetScoreRefresher,
  );
  const feedbackService = new ReportFeedbackService(
    feedbackRepository,
    undefined,
    options.streetScoreRefresher,
  );
  app.register(registerReportsRoutes, {
    prefix: '/api',
    service: reportService,
    feedbackService,
  });
  app.register(registerReportFeedbackRoutes, {
    prefix: '/api',
    feedbackService,
    reportService,
  });
  if (options.moderationDatabase) {
    app.register(registerModerationRoutes, {
      prefix: '/api',
      database: options.moderationDatabase,
      ...(options.streetScoreRefresher ? { scoreRefresher: options.streetScoreRefresher } : {}),
    });
  }
  const streetScoreService = options.streetScoreRepository
    ? new StreetScoreService(options.streetScoreRepository)
    : undefined;
  if (streetScoreService) {
    app.register(registerStreetScoreRoutes, {
      prefix: '/api',
      service: streetScoreService,
    });
  }
  if (options.mapFeaturesRepository) {
    app.register(registerMapFeatureRoutes, {
      prefix: '/api',
      repository: options.mapFeaturesRepository,
    });
  }
  if (options.zoneService) {
    app.register(registerZoneRoutes, { prefix: '/api', service: options.zoneService });
  }
  if (options.streetTileService) {
    app.register(registerStreetTileRoutes, {
      prefix: '/api',
      service: options.streetTileService,
    });
  }
  if (options.roadInformationRepository) {
    app.register(registerRoadInformationRoutes, {
      prefix: '/api',
      service: new RoadInformationService(options.roadInformationRepository),
    });
  }
  if (options.analyticsRepository) {
    app.register(registerAnalyticsRoutes, {
      prefix: '/api',
      service: new AnalyticsService(options.analyticsRepository, streetScoreService),
    });
  }
  if (streetCatalog) {
    app.register(registerStreetCatalogRoutes, {
      prefix: '/api',
      catalog: streetCatalog,
      reports: reportService,
      feedback: feedbackService,
    });
  }
  if (options.authRepository) {
    const authService = new AuthService(options.authRepository);
    app.addHook('onRequest', async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) {
        return reply.code(403).send({ code: 'INVALID_ORIGIN', message: 'Solicitud no permitida.' });
      }
      request.authUser = await authService.getUserForToken(request.cookies?.[sessionCookieName]);
    });
    app.register(registerAuthRoutes, {
      prefix: '/api',
      service: authService,
      allowedOrigins,
    });
  }

  return app;
}

/**
 * `TRUST_PROXY`: `false` no confía en proxies; vacío tampoco, salvo en Vercel, donde sí; `true` confía en el proxy que reenvía
 * la solicitud (p. ej. Vercel); una lista separada por comas se toma como IPs o rangos CIDR.
 */
export function parseTrustProxy(raw: string | undefined, behindVercel = false): boolean | string[] {
  const value = (raw ?? '').trim();
  // En Vercel toda solicitud llega por su proxy: sin configurar nada se confía en él.
  if (value === '') return behindVercel;
  if (value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') return true;
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : false;
}
