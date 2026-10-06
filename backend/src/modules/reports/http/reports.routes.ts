import type { FastifyInstance } from 'fastify';
import { ReportService } from '../application/report-service.js';
import { ReportFeedbackService } from '../application/report-feedback-service.js';
import {
  REPORT_STATUSES,
  REPORT_TYPES,
  SEVERITY_LEVELS,
  type ReportSeverity,
  type ReportStatus,
} from '../domain/street-report.js';
import { toReportDto } from './report.dto.js';
import { emptyReportFeedbackSummary } from '../domain/report-feedback.js';
import type { StreetReport } from '../domain/street-report.js';

const severityNames = Object.keys(SEVERITY_LEVELS) as ReportSeverity[];

interface RadiusReportQuery {
  lat: number;
  lng: number;
  radius: number;
}

interface ViewportReportQuery {
  south: number;
  north: number;
  west: number;
  east: number;
}

type ReportQuery = RadiusReportQuery | ViewportReportQuery;

interface CreateReportBody {
  type: (typeof REPORT_TYPES)[number];
  severity: ReportSeverity;
  description?: string;
  latitude: number;
  longitude: number;
}

interface ReportIdParams {
  id: string;
}

interface UpdateStatusBody {
  status: ReportStatus;
}

const reportIdPattern =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

async function toReportsDto(
  reports: StreetReport[],
  userId: string | null,
  feedbackService: ReportFeedbackService,
) {
  const evaluatedAt = feedbackService.now();
  const summaries = await feedbackService.summariesForReports(
    reports.map((report) => report.id),
    userId,
    evaluatedAt,
  );
  return reports.map((report) =>
    toReportDto(report, summaries.get(report.id) ?? emptyReportFeedbackSummary, evaluatedAt),
  );
}

export async function registerReportsRoutes(
  app: FastifyInstance,
  options: { service: ReportService; feedbackService: ReportFeedbackService },
): Promise<void> {
  const { service, feedbackService } = options;

  app.get<{ Querystring: ReportQuery }>(
    '/reports',
    {
      schema: {
        querystring: {
          type: 'object',
          oneOf: [
            {
              required: ['south', 'north', 'west', 'east'],
              additionalProperties: false,
              properties: {
                south: { type: 'number', minimum: -90, maximum: 90 },
                north: { type: 'number', minimum: -90, maximum: 90 },
                west: { type: 'number', minimum: -180, maximum: 180 },
                east: { type: 'number', minimum: -180, maximum: 180 },
              },
            },
            {
              required: ['lat', 'lng', 'radius'],
              additionalProperties: false,
              properties: {
                lat: { type: 'number', minimum: -90, maximum: 90 },
                lng: { type: 'number', minimum: -180, maximum: 180 },
                radius: { type: 'number', minimum: 1, maximum: 50000 },
              },
            },
          ],
        },
      },
    },
    async (request, reply) => {
      let reports;
      if ('south' in request.query) {
        const { south, north, west, east } = request.query;
        if (south >= north || west >= east) {
          return reply.code(400).send({ code: 'INVALID_BOUNDS', message: 'Invalid map bounds.' });
        }
        reports = await service.findInViewport({ south, north, west, east });
      } else {
        reports = await service.findNearby({
          latitude: request.query.lat,
          longitude: request.query.lng,
          radiusMeters: request.query.radius,
        });
      }
      return toReportsDto(reports, request.authUser?.id ?? null, feedbackService);
    },
  );

  app.post<{ Body: CreateReportBody }>(
    '/reports',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['type', 'severity', 'latitude', 'longitude'],
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: REPORT_TYPES },
            severity: { type: 'string', enum: severityNames },
            description: { type: 'string', maxLength: 500, pattern: '\\S' },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
          },
        },
      },
    },
    async (request, reply) => {
      const report = await service.create(
        {
          type: request.body.type,
          severity: request.body.severity,
          description: request.body.description?.trim() ?? '',
          location: {
            latitude: request.body.latitude,
            longitude: request.body.longitude,
          },
        },
        request.authUser?.id ?? null,
      );
      return reply
        .code(201)
        .send(toReportDto(report, emptyReportFeedbackSummary, feedbackService.now()));
    },
  );

  app.get<{ Params: ReportIdParams }>(
    '/reports/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: reportIdPattern } },
        },
      },
    },
    async (request, reply) => {
      const report = await service.findById(request.params.id);
      if (!report) {
        return reply.code(404).send({ code: 'REPORT_NOT_FOUND', message: 'Report not found.' });
      }
      const [dto] = await toReportsDto([report], request.authUser?.id ?? null, feedbackService);
      return dto;
    },
  );

  app.patch<{ Params: ReportIdParams; Body: UpdateStatusBody }>(
    '/reports/:id/status',
    {
      preHandler: async (request, reply) => {
        if (!request.authUser) {
          return reply
            .code(401)
            .send({ code: 'AUTHENTICATION_REQUIRED', message: 'Iniciá sesión para continuar.' });
        }
      },
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: reportIdPattern } },
        },
        body: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: { status: { type: 'string', enum: REPORT_STATUSES } },
        },
      },
    },
    async (request, reply) => {
      const report = await service.updateStatus(request.params.id, request.body.status);
      if (!report) {
        return reply.code(404).send({ code: 'REPORT_NOT_FOUND', message: 'Report not found.' });
      }
      const [dto] = await toReportsDto([report], request.authUser?.id ?? null, feedbackService);
      return dto;
    },
  );
}
