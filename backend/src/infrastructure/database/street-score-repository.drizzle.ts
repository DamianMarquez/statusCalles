import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import type { ReportViewportQuery } from '../../modules/reports/application/report-repository.js';
import type { ReportFeedbackSummary } from '../../modules/reports/domain/report-feedback.js';
import {
  SEVERITY_LEVELS,
  type ReportSeverity,
  type ReportStatus,
  type ReportType,
  type StreetReport,
} from '../../modules/reports/domain/street-report.js';
import type {
  StreetScoreReportInput,
  StreetScoreRepository,
} from '../../modules/streets/application/street-score-repository.js';
import { reportFreshnessThresholds } from '../../modules/reports/domain/report-freshness-policy.js';

interface ScoreReportRow extends Record<string, unknown> {
  id: string;
  type: ReportType;
  severity: number;
  description: string;
  latitude: number;
  longitude: number;
  status: ReportStatus;
  created_at: Date | string;
  updated_at: Date | string;
  confirmations: number | string;
  resolved_reports: number | string;
  weighted_confirmations: number | string | null;
  weighted_resolved_reports: number | string | null;
  latest_confirmation_at: Date | string | null;
}

const severityByLevel = new Map<number, ReportSeverity>(
  Object.entries(SEVERITY_LEVELS).map(([severity, level]) => [level, severity as ReportSeverity]),
);

function mapInput(row: ScoreReportRow): StreetScoreReportInput {
  const severity = severityByLevel.get(row.severity);
  if (!severity) throw new Error(`Unknown report severity stored in database: ${row.severity}`);
  const report: StreetReport = {
    id: row.id,
    type: row.type,
    severity,
    description: row.description,
    location: { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
  const feedback: ReportFeedbackSummary = {
    confirmations: Number(row.confirmations),
    resolvedReports: Number(row.resolved_reports),
    userFeedback: null,
    weightedConfirmations: Number(row.weighted_confirmations ?? 0),
    weightedResolvedReports: Number(row.weighted_resolved_reports ?? 0),
    latestConfirmationAt: row.latest_confirmation_at ? new Date(row.latest_confirmation_at) : null,
  };
  return { report, feedback };
}

export class DrizzleStreetScoreRepository implements StreetScoreRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async findReportsInViewport(
    query: ReportViewportQuery,
    asOf: Date,
  ): Promise<StreetScoreReportInput[]> {
    const envelope = sql`ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326)`;
    const result = await this.database.execute<ScoreReportRow>(sql`
      SELECT
        r.id::text AS id,
        r.type,
        r.severity,
        r.description,
        ST_Y(r.location::geometry) AS latitude,
        ST_X(r.location::geometry) AS longitude,
        r.status,
        r.created_at,
        r.updated_at,
        COALESCE(f.confirmations, 0) AS confirmations,
        COALESCE(f.resolved_reports, 0) AS resolved_reports,
        COALESCE(f.weighted_confirmations, 0) AS weighted_confirmations,
        COALESCE(f.weighted_resolved_reports, 0) AS weighted_resolved_reports,
        f.latest_confirmation_at
      FROM street_reports r
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE type = 'CONFIRM') AS confirmations,
          COUNT(*) FILTER (WHERE type = 'RESOLVED') AS resolved_reports,
          SUM(EXP(-LN(2) * GREATEST(EXTRACT(EPOCH FROM (${asOf}::timestamptz - updated_at)) / 86400.0, 0) / ${reportFreshnessThresholds.confirmationHalfLifeDays}))
            FILTER (WHERE type = 'CONFIRM') AS weighted_confirmations,
          SUM(EXP(-LN(2) * GREATEST(EXTRACT(EPOCH FROM (${asOf}::timestamptz - updated_at)) / 86400.0, 0) / ${reportFreshnessThresholds.confirmationHalfLifeDays}))
            FILTER (WHERE type = 'RESOLVED') AS weighted_resolved_reports,
          MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
        FROM report_feedback
        WHERE report_id = r.id
      ) f ON TRUE
      WHERE r.location && (${envelope})::geography
        AND ST_Intersects(r.location::geometry, ${envelope})
      ORDER BY r.created_at DESC
      LIMIT 5000
    `);
    return result.rows.map(mapInput);
  }
}
