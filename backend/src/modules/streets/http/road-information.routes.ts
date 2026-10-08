import type { FastifyInstance } from 'fastify';
import { endpointRateLimit } from '../../../shared/rate-limits.js';
import {
  ROAD_TYPES,
  SPECIAL_TREATMENTS,
  SURFACE_CONDITIONS,
  SURFACE_TYPES,
  validateRoadInformationPatch,
} from '../domain/road-information.js';
import { RoadInformationService } from '../application/road-information-service.js';

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const segmentParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', pattern: uuidPattern } },
} as const;

function authenticated() {
  return async (
    request: { authUser: { id: string } | null },
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  ) => {
    if (!request.authUser)
      return reply
        .code(401)
        .send({ code: 'AUTHENTICATION_REQUIRED', message: 'Iniciá sesión para continuar.' });
  };
}

export async function registerRoadInformationRoutes(
  app: FastifyInstance,
  options: { service: RoadInformationService },
): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/streets/segments/:id/information',
    { schema: { params: segmentParams } },
    async (request, reply) => {
      const result = await options.service.findForSegment(
        request.params.id,
        request.authUser?.id ?? null,
      );
      if (!result)
        return reply.code(404).send({ code: 'SEGMENT_NOT_FOUND', message: 'Tramo no encontrado.' });
      return result;
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/streets/segments/:id/information',
    {
      config: { rateLimit: endpointRateLimit('ROAD_INFORMATION') },
      preHandler: authenticated(),
      schema: {
        params: segmentParams,
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            roadType: { type: 'string', enum: ROAD_TYPES },
            surfaceType: { type: 'string', enum: SURFACE_TYPES },
            surfaceCondition: { type: 'string', enum: SURFACE_CONDITIONS },
            specialTreatments: {
              type: 'array',
              maxItems: SPECIAL_TREATMENTS.length,
              uniqueItems: true,
              items: { type: 'string', enum: SPECIAL_TREATMENTS },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!validateRoadInformationPatch(request.body))
        return reply.code(400).send({
          code: 'INVALID_ROAD_INFORMATION',
          message: 'Indicá al menos un dato válido del tramo.',
        });
      const result = await options.service.createProposal(
        request.params.id,
        request.authUser!.id,
        request.body,
      );
      if (!result)
        return reply.code(404).send({ code: 'SEGMENT_NOT_FOUND', message: 'Tramo no encontrado.' });
      return reply.code(201).send(result);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/streets/information-proposals/:id/confirm',
    {
      config: { rateLimit: endpointRateLimit('ROAD_INFORMATION') },
      preHandler: authenticated(),
      schema: { params: segmentParams },
    },
    async (request, reply) => {
      const result = await options.service.confirmProposal(request.params.id, request.authUser!.id);
      if (result.reason === 'NOT_FOUND' || !result.information)
        return reply.code(result.reason === 'NOT_FOUND' ? 404 : 409).send({
          code: result.reason === 'NOT_FOUND' ? 'PROPOSAL_NOT_FOUND' : 'CONFIRMATION_REJECTED',
          message:
            result.reason === 'AUTHOR'
              ? 'No podés confirmar tu propia propuesta.'
              : result.reason === 'DUPLICATE'
                ? 'Ya confirmaste esta propuesta.'
                : 'No se pudo confirmar la propuesta.',
        });
      return result.information;
    },
  );
}
