import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from '../../../infrastructure/database/database.js';
import { endpointRateLimit } from '../../../shared/rate-limits.js';

const reportIdSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    },
  },
} as const;
const flagReasons = ['SPAM', 'INAPPROPRIATE', 'FALSE_INFORMATION', 'OTHER'] as const;
const moderationStatuses = ['VISIBLE', 'HIDDEN'] as const;

function authenticated(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.authUser) {
    void reply
      .code(401)
      .send({ code: 'AUTHENTICATION_REQUIRED', message: 'Iniciá sesión para continuar.' });
    return false;
  }
  return true;
}

function moderator(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!authenticated(request, reply)) return false;
  if (request.authUser?.role !== 'MODERATOR' && request.authUser?.role !== 'ADMIN') {
    void reply
      .code(403)
      .send({ code: 'FORBIDDEN', message: 'No tenés permisos para moderar reportes.' });
    return false;
  }
  return true;
}

export async function registerModerationRoutes(
  app: FastifyInstance,
  options: { database: StreetStatusDatabase },
): Promise<void> {
  const { database } = options;

  app.post<{ Params: { id: string }; Body: { reason: (typeof flagReasons)[number] } }>(
    '/reports/:id/flags',
    {
      config: { rateLimit: endpointRateLimit('FLAGS') },
      preHandler: async (request, reply) => {
        if (!authenticated(request, reply)) return reply;
      },
      schema: {
        params: reportIdSchema,
        body: {
          type: 'object',
          required: ['reason'],
          additionalProperties: false,
          properties: { reason: { type: 'string', enum: flagReasons } },
        },
      },
    },
    async (request, reply) => {
      if (!request.authUser) return reply.code(401).send({ code: 'AUTHENTICATION_REQUIRED' });
      const report = await database.execute<{ id: string }>(sql`
        SELECT id FROM street_reports WHERE id = ${request.params.id}::uuid AND moderation_status = 'VISIBLE' LIMIT 1
      `);
      if (!report.rows[0])
        return reply.code(404).send({ code: 'REPORT_NOT_FOUND', message: 'Report not found.' });
      const inserted = await database.execute<{ id: string }>(sql`
        INSERT INTO report_flags (report_id, user_id, reason)
        VALUES (${request.params.id}::uuid, ${request.authUser.id}::uuid, ${request.body.reason}::report_flag_reason)
        ON CONFLICT (report_id, user_id) DO NOTHING
        RETURNING id
      `);
      if (!inserted.rows[0]) {
        return reply
          .code(409)
          .send({ code: 'ALREADY_REPORTED', message: 'Ya marcaste este reporte para revisión.' });
      }
      return reply.code(201).send({ status: 'received' });
    },
  );

  app.get(
    '/admin/reports',
    {
      preHandler: async (request, reply) => {
        if (!moderator(request, reply)) return reply;
      },
    },
    async (request, reply) => {
      if (!moderator(request, reply)) return;
      const result = await database.execute(sql`
      SELECT r.id, r.type, r.severity, r.description, r.status, r.moderation_status,
        r.created_at, ST_Y(r.location::geometry) AS latitude, ST_X(r.location::geometry) AS longitude,
        COUNT(f.id)::int AS flag_count,
        COALESCE(jsonb_agg(jsonb_build_object('reason', f.reason, 'createdAt', f.created_at))
          FILTER (WHERE f.id IS NOT NULL), '[]'::jsonb) AS flags
      FROM street_reports r
      LEFT JOIN report_flags f ON f.report_id = r.id AND f.reviewed_at IS NULL
      WHERE EXISTS (SELECT 1 FROM report_flags open_flag WHERE open_flag.report_id = r.id AND open_flag.reviewed_at IS NULL)
      GROUP BY r.id
      ORDER BY COUNT(f.id) DESC, r.created_at DESC
      LIMIT 100
    `);
      return result.rows;
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { status: (typeof moderationStatuses)[number]; note?: string };
  }>(
    '/admin/reports/:id/moderation',
    {
      preHandler: async (request, reply) => {
        if (!moderator(request, reply)) return reply;
      },
      schema: {
        params: reportIdSchema,
        body: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: moderationStatuses },
            note: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      if (
        !request.authUser ||
        (request.authUser.role !== 'MODERATOR' && request.authUser.role !== 'ADMIN')
      ) {
        return reply
          .code(request.authUser ? 403 : 401)
          .send({ code: request.authUser ? 'FORBIDDEN' : 'AUTHENTICATION_REQUIRED' });
      }
      const moderatorId = request.authUser.id;
      const result = await database.transaction(async (tx) => {
        const current = await tx.execute<{ moderation_status: string }>(sql`
          SELECT moderation_status FROM street_reports WHERE id = ${request.params.id}::uuid FOR UPDATE
        `);
        const previousStatus = current.rows[0]?.moderation_status;
        if (!previousStatus) return null;
        const updated = await tx.execute<{ moderation_status: string }>(sql`
          UPDATE street_reports SET moderation_status = ${request.body.status}::report_moderation_status, updated_at = NOW()
          WHERE id = ${request.params.id}::uuid
          RETURNING moderation_status
        `);
        const row = updated.rows[0];
        if (!row) return null;
        await tx.execute(sql`
          INSERT INTO moderation_audit (moderator_id, report_id, previous_status, new_status, note)
          VALUES (${moderatorId}::uuid, ${request.params.id}::uuid,
            ${previousStatus}::report_moderation_status,
            ${request.body.status}::report_moderation_status, ${request.body.note?.trim() || null})
        `);
        await tx.execute(
          sql`UPDATE report_flags SET reviewed_at = NOW() WHERE report_id = ${request.params.id}::uuid AND reviewed_at IS NULL`,
        );
        return row;
      });
      if (!result)
        return reply.code(404).send({ code: 'REPORT_NOT_FOUND', message: 'Report not found.' });
      return { id: request.params.id, status: result.moderation_status };
    },
  );
}
