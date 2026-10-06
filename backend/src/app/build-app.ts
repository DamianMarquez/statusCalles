import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { registerHealthRoutes } from '../modules/health/health.routes.js';
import type { ReportRepository } from '../modules/reports/application/report-repository.js';
import { ReportService } from '../modules/reports/application/report-service.js';
import type { ReportFeedbackRepository } from '../modules/reports/application/report-feedback-repository.js';
import { ReportFeedbackService } from '../modules/reports/application/report-feedback-service.js';
import { registerReportFeedbackRoutes } from '../modules/reports/http/report-feedback.routes.js';
import { registerReportsRoutes } from '../modules/reports/http/reports.routes.js';
import type { StreetScoreRepository } from '../modules/streets/application/street-score-repository.js';
import { StreetScoreService } from '../modules/streets/application/street-score-service.js';
import { registerStreetScoreRoutes } from '../modules/streets/http/street-score.routes.js';
import type { AuthRepository } from '../modules/users/application/auth-repository.js';
import { AuthService } from '../modules/users/application/auth-service.js';
import { sessionCookieName } from '../modules/users/http/auth-context.js';
import { registerAuthRoutes } from '../modules/users/http/auth.routes.js';

export function buildApp(
  reportRepository: ReportRepository,
  feedbackRepository: ReportFeedbackRepository,
  options: {
    logger?: boolean;
    streetScoreRepository?: StreetScoreRepository;
    authRepository?: AuthRepository;
  } = {},
): FastifyInstance {
  const trustedProxies = (process.env.TRUST_PROXY ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: trustedProxies.length > 0 ? trustedProxies : false,
  });
  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());

  app.register(cors, { origin: allowedOrigins, credentials: true });
  app.register(cookie);
  app.register(rateLimit, { global: false });
  app.decorateRequest('authUser', null);
  app.register(registerHealthRoutes, { prefix: '/api' });
  const reportService = new ReportService(reportRepository);
  const feedbackService = new ReportFeedbackService(feedbackRepository);
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
  if (options.streetScoreRepository) {
    app.register(registerStreetScoreRoutes, {
      prefix: '/api',
      service: new StreetScoreService(options.streetScoreRepository),
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
