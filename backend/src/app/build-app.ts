import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
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

export function buildApp(
  reportRepository: ReportRepository,
  feedbackRepository: ReportFeedbackRepository,
  options: { logger?: boolean; streetScoreRepository?: StreetScoreRepository } = {},
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });
  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());

  app.register(cors, { origin: allowedOrigins });
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

  return app;
}
