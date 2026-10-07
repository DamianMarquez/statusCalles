import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { REPORT_TYPES, type ReportType } from '../../reports/domain/street-report.js';
import type { AnalyticsService } from '../application/analytics-service.js';
import type { AnalyticsFilters } from '../application/analytics-repository.js';
import { endpointRateLimit } from '../../../shared/rate-limits.js';

interface Query {
  from?: string;
  to?: string;
  type?: ReportType;
  severity?: number;
  neighborhoodId?: number;
  communeId?: number;
  bucket?: 'day' | 'week' | 'month';
  south?: number;
  north?: number;
  west?: number;
  east?: number;
  cellSize?: number;
  limit?: number;
  lat?: number;
  lng?: number;
  radius?: number;
}

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    type: { type: 'string', enum: REPORT_TYPES },
    severity: { type: 'integer', minimum: 1, maximum: 4 },
    neighborhoodId: { type: 'integer', minimum: 1 },
    communeId: { type: 'integer', minimum: 1, maximum: 15 },
    bucket: { type: 'string', enum: ['day', 'week', 'month'] },
    south: { type: 'number', minimum: -90, maximum: 90 },
    north: { type: 'number', minimum: -90, maximum: 90 },
    west: { type: 'number', minimum: -180, maximum: 180 },
    east: { type: 'number', minimum: -180, maximum: 180 },
    cellSize: { type: 'number', minimum: 0.001, maximum: 0.05 },
    limit: { type: 'integer', minimum: 1, maximum: 20 },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
    radius: { type: 'number', minimum: 1, maximum: 5000 },
  },
} as const;

function filtersFrom(query: Query): AnalyticsFilters {
  return {
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.severity ? { severity: query.severity } : {}),
    ...(query.neighborhoodId ? { neighborhoodId: query.neighborhoodId } : {}),
    ...(query.communeId ? { communeId: query.communeId } : {}),
  };
}

function hasInvalidDateRange(query: Query): boolean {
  return Boolean(query.from && query.to && new Date(query.from) >= new Date(query.to));
}

function isModerator(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.authUser) {
    void reply.code(401).send({ code: 'AUTHENTICATION_REQUIRED' });
    return false;
  }
  if (request.authUser.role !== 'MODERATOR' && request.authUser.role !== 'ADMIN') {
    void reply.code(403).send({ code: 'FORBIDDEN' });
    return false;
  }
  return true;
}

function isAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.authUser) {
    void reply.code(401).send({ code: 'AUTHENTICATION_REQUIRED' });
    return false;
  }
  if (request.authUser.role !== 'ADMIN') {
    void reply.code(403).send({ code: 'FORBIDDEN' });
    return false;
  }
  return true;
}

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  options: { service: AnalyticsService },
) {
  const { service } = options;
  const filteredRoute = {
    schema: { querystring: querySchema },
    config: { rateLimit: endpointRateLimit('ANALYTICS') },
  } as const;

  app.get<{ Querystring: Query }>('/analytics/overview', filteredRoute, async (request, reply) => {
    if (hasInvalidDateRange(request.query))
      return reply.code(400).send({ code: 'INVALID_DATE_RANGE' });
    return service.overview(filtersFrom(request.query));
  });
  app.get<{ Querystring: Query }>('/analytics/reports', filteredRoute, (request, reply) => {
    if (hasInvalidDateRange(request.query))
      return reply.code(400).send({ code: 'INVALID_DATE_RANGE' });
    return service.reports(filtersFrom(request.query));
  });
  app.get<{ Querystring: Query }>('/analytics/neighborhoods', filteredRoute, (request, reply) => {
    if (hasInvalidDateRange(request.query))
      return reply.code(400).send({ code: 'INVALID_DATE_RANGE' });
    return service.neighborhoods(filtersFrom(request.query));
  });
  app.get<{ Querystring: Query }>('/analytics/communes', filteredRoute, (request, reply) => {
    if (hasInvalidDateRange(request.query))
      return reply.code(400).send({ code: 'INVALID_DATE_RANGE' });
    return service.communes(filtersFrom(request.query));
  });
  app.get<{ Querystring: Query }>('/analytics/trends', filteredRoute, (request, reply) => {
    if (hasInvalidDateRange(request.query))
      return reply.code(400).send({ code: 'INVALID_DATE_RANGE' });
    return service.trends(filtersFrom(request.query), request.query.bucket ?? 'week');
  });
  app.get<{ Querystring: Query }>('/analytics/streets', filteredRoute, (request, reply) => {
    if (hasInvalidDateRange(request.query))
      return reply.code(400).send({ code: 'INVALID_DATE_RANGE' });
    return service.streets(filtersFrom(request.query), request.query.limit ?? 10);
  });
  app.get<{ Querystring: Query }>('/analytics/segments', filteredRoute, (request, reply) => {
    if (hasInvalidDateRange(request.query))
      return reply.code(400).send({ code: 'INVALID_DATE_RANGE' });
    return service.segments(filtersFrom(request.query), request.query.limit ?? 10);
  });
  app.get<{ Querystring: Query }>('/analytics/heatmap', filteredRoute, (request, reply) => {
    const { south, north, west, east } = request.query;
    if ([south, north, west, east].some((value) => value === undefined))
      return reply.code(400).send({ code: 'BOUNDS_REQUIRED' });
    if (south! >= north! || west! >= east! || north! - south! > 1 || east! - west! > 1)
      return reply.code(400).send({ code: 'INVALID_BOUNDS' });
    if (hasInvalidDateRange(request.query))
      return reply.code(400).send({ code: 'INVALID_DATE_RANGE' });
    return service.heatmap(filtersFrom(request.query), {
      south: south!,
      north: north!,
      west: west!,
      east: east!,
      cellSize: request.query.cellSize ?? 0.005,
    });
  });

  app.get('/analytics/moderation/overview', async (request, reply) => {
    if (!isModerator(request, reply)) return;
    return service.moderationOverview();
  });
  app.get('/analytics/official', async () => service.officialOverview());
  app.get<{ Querystring: Query }>('/analytics/proximity', filteredRoute, (request, reply) => {
    const { lat, lng, radius } = request.query;
    if (lat === undefined || lng === undefined || radius === undefined)
      return reply.code(400).send({ code: 'POINT_AND_RADIUS_REQUIRED' });
    if (hasInvalidDateRange(request.query))
      return reply.code(400).send({ code: 'INVALID_DATE_RANGE' });
    return service.proximity(filtersFrom(request.query), {
      latitude: lat,
      longitude: lng,
      radiusMeters: radius,
    });
  });
  app.get('/analytics/admin/overview', async (request, reply) => {
    if (!isAdmin(request, reply)) return;
    return service.adminOverview();
  });
}
