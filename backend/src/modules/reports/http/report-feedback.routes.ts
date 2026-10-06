import type { FastifyInstance } from 'fastify';
import { ReportFeedbackService } from '../application/report-feedback-service.js';
import { REPORT_FEEDBACK_TYPES } from '../domain/report-feedback.js';

interface ReportIdParams {
  id: string;
}

interface FeedbackBody {
  type: (typeof REPORT_FEEDBACK_TYPES)[number];
}

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export async function registerReportFeedbackRoutes(
  app: FastifyInstance,
  options: { feedbackService: ReportFeedbackService },
): Promise<void> {
  const { feedbackService } = options;

  app.post<{ Params: ReportIdParams; Body: FeedbackBody }>(
    '/reports/:id/feedback',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuidPattern } },
        },
        body: {
          type: 'object',
          required: ['type'],
          additionalProperties: false,
          properties: { type: { type: 'string', enum: REPORT_FEEDBACK_TYPES } },
        },
      },
    },
    async (request, reply) => {
      const voterId = request.headers['x-voter-id'];
      if (typeof voterId !== 'string' || !new RegExp(uuidPattern).test(voterId)) {
        return reply
          .code(400)
          .send({ code: 'INVALID_VOTER_ID', message: 'A valid voter ID is required.' });
      }

      const feedback = await feedbackService.submit({
        reportId: request.params.id,
        voterId: voterId.toLowerCase(),
        type: request.body.type,
      });
      if (!feedback) {
        return reply.code(404).send({ code: 'REPORT_NOT_FOUND', message: 'Report not found.' });
      }
      return feedback;
    },
  );
}
