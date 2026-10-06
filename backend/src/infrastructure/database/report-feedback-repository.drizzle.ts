import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import type { ReportFeedbackRepository } from '../../modules/reports/application/report-feedback-repository.js';
import type {
  ReportFeedbackSummary,
  ReportFeedbackType,
} from '../../modules/reports/domain/report-feedback.js';

interface FeedbackSummaryRow extends Record<string, unknown> {
  report_id: string;
  confirmations: number | string;
  resolved_reports: number | string;
  user_feedback: ReportFeedbackType | null;
}

function toSummary(row: FeedbackSummaryRow): ReportFeedbackSummary {
  return {
    confirmations: Number(row.confirmations),
    resolvedReports: Number(row.resolved_reports),
    userFeedback: row.user_feedback,
  };
}

export class DrizzleReportFeedbackRepository implements ReportFeedbackRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async submit(input: {
    reportId: string;
    voterId: string;
    type: ReportFeedbackType;
  }): Promise<ReportFeedbackSummary | null> {
    const vote = await this.database.execute<{ report_id: string }>(sql`
      INSERT INTO report_feedback (report_id, voter_id, type)
      SELECT id, ${input.voterId}::uuid, ${input.type}::report_feedback_type
      FROM street_reports
      WHERE id = ${input.reportId}::uuid
      ON CONFLICT (report_id, voter_id)
      DO UPDATE SET type = EXCLUDED.type, updated_at = NOW()
      RETURNING report_id::text AS report_id
    `);
    if (!vote.rows[0]) return null;

    const summaries = await this.summariesForReports([input.reportId], input.voterId);
    return summaries.get(input.reportId) ?? null;
  }

  async summariesForReports(
    reportIds: string[],
    voterId: string | null,
  ): Promise<Map<string, ReportFeedbackSummary>> {
    if (reportIds.length === 0) return new Map();
    const reportIdList = sql.join(
      reportIds.map((reportId) => sql`${reportId}::uuid`),
      sql`, `,
    );
    const result = await this.database.execute<FeedbackSummaryRow>(sql`
      SELECT
        report_id::text AS report_id,
        COUNT(*) FILTER (WHERE type = 'CONFIRM') AS confirmations,
        COUNT(*) FILTER (WHERE type = 'RESOLVED') AS resolved_reports,
        MAX(type) FILTER (WHERE voter_id = ${voterId}::uuid) AS user_feedback
      FROM report_feedback
      WHERE report_id IN (${reportIdList})
      GROUP BY report_id
    `);
    return new Map(result.rows.map((row) => [row.report_id, toSummary(row)]));
  }
}
