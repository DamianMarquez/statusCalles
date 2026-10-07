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
import { endpointRateLimit } from '../../../shared/rate-limits.js';

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

interface FilterQuery {
  types?: string;
  statuses?: string;
  fromDate?: string;
  toDate?: string;
  period?: '24h' | '3d' | '7d' | '30d' | '90d';
  minSeverity?: ReportSeverity;
  onlyMine?: boolean;
  limit?: number;
}

interface MyReportsQuery {
  limit?: number;
  offset?: number;
}

type ReportQuery = RadiusReportQuery | (ViewportReportQuery & FilterQuery);

interface CreateReportBody {
  type: (typeof REPORT_TYPES)[number];
  severity: ReportSeverity;
  description?: string;
  latitude: number;
  longitude: number;
  allowSimilar?: boolean;
}

interface ReportIdParams {
  id: string;
}

interface UpdateStatusBody {
  status: ReportStatus;
}

const reportIdPattern =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const mapFiltersSchema = {
  types: { type: 'string', maxLength: 128 },
  statuses: { type: 'string', maxLength: 32 },
  fromDate: { type: 'string', format: 'date-time', maxLength: 40 },
  toDate: { type: 'string', format: 'date-time', maxLength: 40 },
  period: { type: 'string', enum: ['24h', '3d', '7d', '30d', '90d'] },
  minSeverity: { type: 'string', enum: severityNames },
  onlyMine: { type: 'boolean' },
  limit: { type: 'integer', minimum: 1, maximum: 200 },
} as const;

function parseList<T extends string>(
  value: string | undefined,
  accepted: readonly T[],
  name: string,
): T[] | undefined {
  if (value === undefined) return undefined;
  const entries = [
    ...new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  if (entries.length === 1 && entries[0] === 'NONE') return [];
  if (entries.length === 0 || entries.some((entry) => !accepted.includes(entry as T))) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }
  return entries as T[];
}

function parseDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

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
                ...mapFiltersSchema,
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
        const query = request.query as ViewportReportQuery & FilterQuery;
        if (query.onlyMine && !request.authUser) {
          return reply.code(401).send({
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Iniciá sesión para ver tus reportes.',
          });
        }
        if ((query.fromDate && query.period) || (query.toDate && query.period)) {
          return reply
            .code(400)
            .send({ code: 'INVALID_DATE_RANGE', message: 'Elegí un período o fechas.' });
        }
        const fromDate = parseDate(query.fromDate);
        const toDate = parseDate(query.toDate);
        if (
          (query.fromDate && !fromDate) ||
          (query.toDate && !toDate) ||
          (fromDate && toDate && fromDate > toDate)
        ) {
          return reply
            .code(400)
            .send({ code: 'INVALID_DATE_RANGE', message: 'El rango de fechas no es válido.' });
        }
        let types;
        let statuses;
        try {
          types = parseList(query.types, REPORT_TYPES, 'types');
          statuses = parseList(query.statuses, REPORT_STATUSES, 'statuses');
        } catch {
          return reply
            .code(400)
            .send({ code: 'INVALID_FILTER', message: 'Uno o más filtros no son válidos.' });
        }
        const page = await service.findInViewport({
          south,
          north,
          west,
          east,
          types,
          statuses,
          fromDate,
          toDate,
          period: query.period,
          minSeverity: query.minSeverity,
          userId: query.onlyMine ? request.authUser!.id : undefined,
          limit: query.limit,
        });
        const items = await toReportsDto(
          page.items.map((item) => item.report),
          request.authUser?.id ?? null,
          feedbackService,
        );
        const mapItems = items.map((item, index) => ({
          ...item,
          publiclyVisible: page.items[index]?.publiclyVisible ?? true,
        }));
        return { items: mapItems, hasMore: page.hasMore };
      } else {
        reports = await service.findNearby({
          latitude: request.query.lat,
          longitude: request.query.lng,
          radiusMeters: request.query.radius,
        });
      }
      const items = await toReportsDto(reports, request.authUser?.id ?? null, feedbackService);
      return { items, hasMore: false };
    },
  );

  app.get<{ Querystring: MyReportsQuery }>(
    '/users/me/reports',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0, maximum: 100000 },
          },
        },
      },
      preHandler: async (request, reply) => {
        if (!request.authUser) {
          return reply.code(401).send({
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Iniciá sesión para ver tus reportes.',
          });
        }
      },
    },
    async (request) => {
      const user = request.authUser!;
      const page = await service.findMine(
        user.id,
        request.query.limit ?? 50,
        request.query.offset ?? 0,
      );
      const summaries = await feedbackService.summariesForReports(
        page.items.map((item) => item.report.id),
        user.id,
      );
      const evaluatedAt = feedbackService.now();
      return {
        items: page.items.map((item) => ({
          ...toReportDto(
            item.report,
            summaries.get(item.report.id) ?? emptyReportFeedbackSummary,
            evaluatedAt,
          ),
          publiclyVisible: item.publiclyVisible,
          feedbackCount: item.feedbackCount,
          latestActivityAt: (item.latestFeedbackAt ?? item.report.updatedAt).toISOString(),
        })),
        hasMore: page.hasMore,
      };
    },
  );

  app.post<{ Body: CreateReportBody }>(
    '/reports',
    {
      config: { rateLimit: endpointRateLimit('REPORTS') },
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
            allowSimilar: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const input = {
        type: request.body.type,
        severity: request.body.severity,
        description: request.body.description?.trim() ?? '',
        location: {
          latitude: request.body.latitude,
          longitude: request.body.longitude,
        },
      };
      if (!request.body.allowSimilar) {
        const similar = await service.findSimilar(input);
        if (similar) {
          return reply.code(409).send({
            code: 'SIMILAR_REPORT_EXISTS',
            message: 'Ya existe un reporte similar cerca de esta ubicación.',
            similarReport: { id: similar.id, distanceMeters: Math.round(similar.distanceMeters) },
          });
        }
      }
      const report = await service.create(input, request.authUser?.id ?? null);
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
      config: { rateLimit: endpointRateLimit('REPORT_STATUS') },
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
      const user = request.authUser;
      if (!user) {
        return reply
          .code(401)
          .send({ code: 'AUTHENTICATION_REQUIRED', message: 'Iniciá sesión para continuar.' });
      }
      const elevated = user.role === 'MODERATOR' || user.role === 'ADMIN';
      if (!elevated && !(await service.isOwner(request.params.id, user.id))) {
        return reply.code(403).send({
          code: 'FORBIDDEN',
          message: 'Solo quien creó el reporte puede cambiar su estado.',
        });
      }
      const report = await service.updateStatus(request.params.id, request.body.status);
      if (!report) {
        return reply.code(404).send({ code: 'REPORT_NOT_FOUND', message: 'Report not found.' });
      }
      const [dto] = await toReportsDto([report], request.authUser?.id ?? null, feedbackService);
      return dto;
    },
  );
}
