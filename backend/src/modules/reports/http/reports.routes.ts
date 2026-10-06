import type { FastifyInstance } from 'fastify';
import { ReportService } from '../application/report-service.js';
import {
  REPORT_STATUSES,
  REPORT_TYPES,
  SEVERITY_LEVELS,
  type ReportSeverity,
  type ReportStatus,
} from '../domain/street-report.js';
import { toReportDto } from './report.dto.js';

const severityNames = Object.keys(SEVERITY_LEVELS) as ReportSeverity[];

interface ReportQuery {
  lat: number;
  lng: number;
  radius: number;
}

interface CreateReportBody {
  type: (typeof REPORT_TYPES)[number];
  severity: ReportSeverity;
  description: string;
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

export async function registerReportsRoutes(
  app: FastifyInstance,
  options: { service: ReportService },
): Promise<void> {
  const { service } = options;

  app.get<{ Querystring: ReportQuery }>(
    '/reports',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['lat', 'lng', 'radius'],
          additionalProperties: false,
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
            radius: { type: 'number', minimum: 1, maximum: 50000 },
          },
        },
      },
    },
    async (request) => {
      const reports = await service.findNearby({
        latitude: request.query.lat,
        longitude: request.query.lng,
        radiusMeters: request.query.radius,
      });
      return reports.map(toReportDto);
    },
  );

  app.post<{ Body: CreateReportBody }>(
    '/reports',
    {
      schema: {
        body: {
          type: 'object',
          required: ['type', 'severity', 'description', 'latitude', 'longitude'],
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: REPORT_TYPES },
            severity: { type: 'string', enum: severityNames },
            description: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
          },
        },
      },
    },
    async (request, reply) => {
      const report = await service.create({
        type: request.body.type,
        severity: request.body.severity,
        description: request.body.description.trim(),
        location: {
          latitude: request.body.latitude,
          longitude: request.body.longitude,
        },
      });
      return reply.code(201).send(toReportDto(report));
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
      return toReportDto(report);
    },
  );

  app.patch<{ Params: ReportIdParams; Body: UpdateStatusBody }>(
    '/reports/:id/status',
    {
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
      return toReportDto(report);
    },
  );
}
