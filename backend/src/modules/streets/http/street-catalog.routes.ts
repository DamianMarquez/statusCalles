import type { FastifyInstance } from 'fastify';
import { ReportFeedbackService } from '../../reports/application/report-feedback-service.js';
import { ReportService } from '../../reports/application/report-service.js';
import { emptyReportFeedbackSummary } from '../../reports/domain/report-feedback.js';
import { toReportDto } from '../../reports/http/report.dto.js';
import { StreetCatalogService } from '../application/street-catalog.js';

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

interface NearbyQuery {
  lat: number;
  lng: number;
  radius: number;
}

interface StreetParams {
  id: string;
}

export async function registerStreetCatalogRoutes(
  app: FastifyInstance,
  options: {
    catalog: StreetCatalogService;
    reports: ReportService;
    feedback: ReportFeedbackService;
  },
): Promise<void> {
  const { catalog, reports, feedback } = options;

  app.get('/neighborhoods', async () => catalog.listNeighborhoods());
  app.get('/communes', async () => catalog.listCommunes());

  app.get<{ Querystring: NearbyQuery }>(
    '/streets/nearby',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['lat', 'lng', 'radius'],
          additionalProperties: false,
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
            radius: { type: 'number', minimum: 1, maximum: 5000 },
          },
        },
      },
    },
    async (request) => {
      const streets = await catalog.findNearbyStreets({
        latitude: request.query.lat,
        longitude: request.query.lng,
        radiusMeters: request.query.radius,
      });
      return streets.map((street) => ({
        id: street.id,
        officialName: street.officialName,
        distanceMeters: Math.round(street.distanceMeters),
        neighborhood: street.neighborhoodName,
        commune: street.communeName,
      }));
    },
  );

  app.get<{ Params: StreetParams }>(
    '/streets/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuidPattern } },
        },
      },
    },
    async (request, reply) => {
      const street = await catalog.findStreet(request.params.id);
      if (!street)
        return reply.code(404).send({ code: 'STREET_NOT_FOUND', message: 'Street not found.' });
      return {
        id: street.id,
        officialName: street.officialName,
        segmentCount: street.segmentCount,
        neighborhoods: street.neighborhoods,
        communes: street.communes,
      };
    },
  );

  app.get<{ Params: StreetParams }>(
    '/streets/:id/reports',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuidPattern } },
        },
      },
    },
    async (request, reply) => {
      const street = await catalog.findStreet(request.params.id);
      if (!street)
        return reply.code(404).send({ code: 'STREET_NOT_FOUND', message: 'Street not found.' });
      const items = await reports.findByStreetId(street.id, 200);
      const evaluatedAt = feedback.now();
      const summaries = await feedback.summariesForReports(
        items.map((item) => item.id),
        request.authUser?.id ?? null,
        evaluatedAt,
      );
      return items.map((item) =>
        toReportDto(item, summaries.get(item.id) ?? emptyReportFeedbackSummary, evaluatedAt),
      );
    },
  );
}
