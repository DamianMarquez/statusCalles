import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import type { ReportFeedbackRepository } from '../../modules/reports/application/report-feedback-repository.js';
import type {
  ReportFeedbackSummary,
  ReportFeedbackType,
} from '../../modules/reports/domain/report-feedback.js';
import { reportFreshnessThresholds } from '../../modules/reports/domain/report-freshness-policy.js';

interface FeedbackSummaryRow extends Record<string, unknown> {
  report_id: string;
  confirmations: number | string;
  resolved_reports: number | string;
  user_feedback: ReportFeedbackType | null;
  weighted_confirmations: number | string;
  weighted_resolved_reports: number | string;
  latest_confirmation_at: Date | string | null;
}

function toSummary(row: FeedbackSummaryRow): ReportFeedbackSummary {
  return {
    confirmations: Number(row.confirmations),
    resolvedReports: Number(row.resolved_reports),
    userFeedback: row.user_feedback,
    weightedConfirmations: Number(row.weighted_confirmations),
    weightedResolvedReports: Number(row.weighted_resolved_reports),
    latestConfirmationAt: row.latest_confirmation_at ? new Date(row.latest_confirmation_at) : null,
  };
}

export class DrizzleReportFeedbackRepository implements ReportFeedbackRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async submit(
    input: {
      reportId: string;
      voterId: string;
      type: ReportFeedbackType;
    },
    asOf: Date,
  ): Promise<ReportFeedbackSummary | null> {
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

    const summaries = await this.summariesForReports([input.reportId], input.voterId, asOf);
    return summaries.get(input.reportId) ?? null;
  }

  async summariesForReports(
    reportIds: string[],
    voterId: string | null,
    asOf: Date,
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
        MAX(type) FILTER (WHERE voter_id = ${voterId}::uuid) AS user_feedback,
        SUM(EXP(-LN(2) * GREATEST(EXTRACT(EPOCH FROM (${asOf}::timestamptz - updated_at)) / 86400.0, 0) / ${reportFreshnessThresholds.confirmationHalfLifeDays}))
          FILTER (WHERE type = 'CONFIRM') AS weighted_confirmations,
        SUM(EXP(-LN(2) * GREATEST(EXTRACT(EPOCH FROM (${asOf}::timestamptz - updated_at)) / 86400.0, 0) / ${reportFreshnessThresholds.confirmationHalfLifeDays}))
          FILTER (WHERE type = 'RESOLVED') AS weighted_resolved_reports,
        MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
      FROM report_feedback
      WHERE report_id IN (${reportIdList})
      GROUP BY report_id
    `);
    return new Map(result.rows.map((row) => [row.report_id, toSummary(row)]));
  }
}
