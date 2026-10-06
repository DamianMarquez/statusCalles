import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { registerHealthRoutes } from '../modules/health/health.routes.js';
import type { ReportRepository } from '../modules/reports/application/report-repository.js';
import { ReportService } from '../modules/reports/application/report-service.js';
import { registerReportsRoutes } from '../modules/reports/http/reports.routes.js';

export function buildApp(
  reportRepository: ReportRepository,
  options: { logger?: boolean } = {},
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });
  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());

  app.register(cors, { origin: allowedOrigins });
  app.register(registerHealthRoutes, { prefix: '/api' });
  app.register(registerReportsRoutes, {
    prefix: '/api',
    service: new ReportService(reportRepository),
  });

  return app;
}
