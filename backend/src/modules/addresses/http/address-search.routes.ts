import type { FastifyInstance } from 'fastify';
import { endpointRateLimit } from '../../../shared/rate-limits.js';
import { AddressSearchProviderError } from '../domain/address-search.js';
import type { AddressSearchService } from '../application/address-search-service.js';

function minimumQueryLength(): number {
  const configured = Number(process.env.ADDRESS_SEARCH_MIN_QUERY_LENGTH ?? 3);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 3;
}

export async function registerAddressSearchRoutes(
  app: FastifyInstance,
  options: { service: AddressSearchService },
): Promise<void> {
  app.get<{ Querystring: { q: string } }>(
    '/addresses/search',
    {
      config: { rateLimit: endpointRateLimit('ADDRESS_SEARCH') },
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          additionalProperties: false,
          properties: { q: { type: 'string', minLength: 1, maxLength: 120 } },
        },
      },
    },
    async (request, reply) => {
      try {
        if (request.query.q.trim().length < minimumQueryLength()) return { items: [] };
        const items = await options.service.search(request.query.q);
        return { items };
      } catch (error) {
        if (!(error instanceof AddressSearchProviderError)) throw error;
        const timedOut = error.kind === 'TIMEOUT';
        return reply.code(timedOut ? 504 : 502).send({
          code: timedOut ? 'ADDRESS_SEARCH_TIMEOUT' : 'ADDRESS_SEARCH_UNAVAILABLE',
          message: 'No pudimos buscar la dirección en este momento.',
        });
      }
    },
  );
}
