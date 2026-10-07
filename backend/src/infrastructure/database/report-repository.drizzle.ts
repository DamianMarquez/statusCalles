import { sql, type SQL } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import type {
  ReportRepository,
  NearbyReportsQuery,
  OwnedReport,
  ReportFilters,
  ReportPage,
  ReportViewportQuery,
  ViewportReport,
} from '../../modules/reports/application/report-repository.js';
import {
  SEVERITY_LEVELS,
  type CreateStreetReport,
  type ReportSeverity,
  type ReportStatus,
  type ReportType,
  type StreetReport,
} from '../../modules/reports/domain/street-report.js';

interface ReportRow extends Record<string, unknown> {
  id: string;
  type: ReportType;
  severity: number;
  description: string;
  latitude: number;
  longitude: number;
  status: ReportStatus;
  created_at: Date | string;
  updated_at: Date | string;
  street: {
    id: string;
    officialName: string;
    neighborhoodName: string | null;
    communeName: string | null;
  } | null;
  moderation_status?: 'VISIBLE' | 'HIDDEN';
}

const severityByLevel = new Map<number, ReportSeverity>(
  Object.entries(SEVERITY_LEVELS).map(([severity, level]) => [level, severity as ReportSeverity]),
);

function mapReport(row: ReportRow): StreetReport {
  const severity = severityByLevel.get(row.severity);
  if (!severity) throw new Error(`Unknown report severity stored in database: ${row.severity}`);

  return {
    id: row.id,
    type: row.type,
    severity,
    description: row.description,
    location: { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    street: row.street ?? null,
  };
}

const reportProjection = sql`
  id,
  type,
  severity,
  description,
  ST_Y(location::geometry) AS latitude,
  ST_X(location::geometry) AS longitude,
  status,
  created_at,
  updated_at,
  (SELECT jsonb_build_object(
      'id', st.id,
      'officialName', st.official_name,
      'neighborhoodName', n.name,
      'communeName', c.name
    )
    FROM streets st
    LEFT JOIN street_segments ss ON ss.id = street_reports.street_segment_id
    LEFT JOIN neighborhoods n ON n.id = ss.neighborhood_id
    LEFT JOIN communes c ON c.id = ss.commune_id
    WHERE st.id = street_reports.street_id
  ) AS street
`;

export class DrizzleReportRepository implements ReportRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async create(
    input: CreateStreetReport,
    userId?: string | null,
    street?: { streetId: string; streetSegmentId: string } | null,
  ): Promise<StreetReport> {
    const result = await this.database.execute<ReportRow>(sql`
      INSERT INTO street_reports (user_id, street_id, street_segment_id, type, severity, description, location)
      VALUES (
        ${userId ?? null}::uuid,
        ${street?.streetId ?? null}::uuid,
        ${street?.streetSegmentId ?? null}::uuid,
        ${input.type}::report_type,
        ${SEVERITY_LEVELS[input.severity]},
        ${input.description},
        ST_SetSRID(ST_MakePoint(${input.location.longitude}, ${input.location.latitude}), 4326)::geography
      )
      RETURNING ${reportProjection}
    `);
    const row = result.rows[0];
    if (!row) throw new Error('The created report was not returned by the database.');
    return mapReport(row);
  }

  async findNearby(query: NearbyReportsQuery): Promise<StreetReport[]> {
    const result = await this.database.execute<ReportRow>(sql`
      SELECT ${reportProjection}
      FROM street_reports
      WHERE ST_DWithin(
        location,
        ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography,
        ${query.radiusMeters}
      ) AND moderation_status = 'VISIBLE'
      ORDER BY created_at DESC
      LIMIT 200
    `);
    return result.rows.map(mapReport);
  }

  async findInViewport(query: ReportViewportQuery & ReportFilters): Promise<ReportPage> {
    const envelope = sql`ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326)`;
    const conditions: SQL[] = [
      sql`location && (${envelope})::geography`,
      sql`ST_Intersects(location::geometry, ${envelope})`,
    ];
    if (query.userId) {
      conditions.push(sql`(moderation_status = 'VISIBLE' OR user_id = ${query.userId}::uuid)`);
    } else {
      conditions.push(sql`moderation_status = 'VISIBLE'`);
    }
    if (query.types && query.types.length === 0) conditions.push(sql`FALSE`);
    if (query.types?.length) {
      conditions.push(
        sql`type IN (${sql.join(
          query.types.map((type) => sql`${type}::report_type`),
          sql`, `,
        )})`,
      );
    }
    if (query.statuses && query.statuses.length === 0) conditions.push(sql`FALSE`);
    if (query.statuses?.length) {
      const effectiveStatus = sql`CASE
        WHEN status = 'RESOLVED' THEN 'RESOLVED'
        WHEN GREATEST(created_at, COALESCE((
          SELECT MAX(f.updated_at) FROM report_feedback f
          WHERE f.report_id = street_reports.id AND f.type = 'CONFIRM'
        ), created_at)) < NOW() - INTERVAL '30 days' THEN 'STALE'
        ELSE 'ACTIVE' END`;
      conditions.push(
        sql`${effectiveStatus} IN (${sql.join(
          query.statuses.map((status) => sql`${status}`),
          sql`, `,
        )})`,
      );
    }
    if (query.fromDate) conditions.push(sql`created_at >= ${query.fromDate}`);
    if (query.toDate) conditions.push(sql`created_at <= ${query.toDate}`);
    if (query.period) {
      const interval = {
        '24h': sql`INTERVAL '24 hours'`,
        '3d': sql`INTERVAL '3 days'`,
        '7d': sql`INTERVAL '7 days'`,
        '30d': sql`INTERVAL '30 days'`,
        '90d': sql`INTERVAL '90 days'`,
      }[query.period];
      conditions.push(sql`created_at >= NOW() - ${interval}`);
    }
    if (query.minSeverity) {
      conditions.push(sql`severity >= ${SEVERITY_LEVELS[query.minSeverity]}`);
    }
    if (query.userId) conditions.push(sql`user_id = ${query.userId}::uuid`);
    const limit = Math.max(1, Math.min(query.limit ?? 200, 200));
    const result = await this.database.execute<ReportRow>(sql`
      SELECT ${reportProjection}, moderation_status
      FROM street_reports
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY created_at DESC
      LIMIT ${limit + 1}
    `);
    const hasMore = result.rows.length > limit;
    return {
      items: result.rows.slice(0, limit).map((row): ViewportReport => ({
        report: mapReport(row),
        publiclyVisible: row.moderation_status !== 'HIDDEN',
      })),
      hasMore,
    };
  }

  async findMine(
    userId: string,
    requestedLimit: number,
    requestedOffset: number,
  ): Promise<{ items: OwnedReport[]; hasMore: boolean }> {
    const limit = Math.max(1, Math.min(Math.floor(requestedLimit), 100));
    const offset = Math.max(0, Math.floor(requestedOffset));
    const result = await this.database.execute<
      ReportRow & {
        moderation_status: 'VISIBLE' | 'HIDDEN';
        feedback_count: number | string;
        latest_feedback_at: Date | string | null;
      }
    >(sql`
      SELECT ${reportProjection}, street_reports.moderation_status,
        COALESCE(f.feedback_count, 0) AS feedback_count,
        f.latest_feedback_at
      FROM street_reports
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS feedback_count, MAX(updated_at) AS latest_feedback_at
        FROM report_feedback WHERE report_id = street_reports.id
      ) f ON TRUE
      WHERE street_reports.user_id = ${userId}::uuid
      ORDER BY street_reports.created_at DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `);
    const hasMore = result.rows.length > limit;
    return {
      items: result.rows.slice(0, limit).map((row) => ({
        report: mapReport(row),
        publiclyVisible: row.moderation_status === 'VISIBLE',
        feedbackCount: Number(row.feedback_count),
        latestFeedbackAt: row.latest_feedback_at ? new Date(row.latest_feedback_at) : null,
      })),
      hasMore,
    };
  }

  async findById(id: string): Promise<StreetReport | null> {
    const result = await this.database.execute<ReportRow>(sql`
      SELECT ${reportProjection}
      FROM street_reports
      WHERE id = ${id}::uuid
        AND moderation_status = 'VISIBLE'
      LIMIT 1
    `);
    const row = result.rows[0];
    return row ? mapReport(row) : null;
  }

  async findByStreetId(id: string, limit = 200): Promise<StreetReport[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const result = await this.database.execute<ReportRow>(sql`
      SELECT ${reportProjection}
      FROM street_reports
      WHERE street_id = ${id}::uuid AND moderation_status = 'VISIBLE'
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `);
    return result.rows.map(mapReport);
  }

  async isOwner(id: string, userId: string): Promise<boolean> {
    const result = await this.database.execute<{ owned: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM street_reports WHERE id = ${id}::uuid AND user_id = ${userId}::uuid) AS owned
    `);
    return result.rows[0]?.owned === true;
  }

  async findSimilar(
    input: CreateStreetReport,
  ): Promise<{ id: string; distanceMeters: number; createdAt: Date } | null> {
    const result = await this.database.execute<{
      id: string;
      distance_meters: number | string;
      created_at: Date | string;
    }>(sql`
      SELECT id, ST_Distance(
        location,
        ST_SetSRID(ST_MakePoint(${input.location.longitude}, ${input.location.latitude}), 4326)::geography
      ) AS distance_meters, created_at
      FROM street_reports
      WHERE type = ${input.type}::report_type
        AND status <> 'RESOLVED'
        AND moderation_status = 'VISIBLE'
        AND created_at >= NOW() - INTERVAL '24 hours'
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${input.location.longitude}, ${input.location.latitude}), 4326)::geography,
          50
        )
      ORDER BY location <-> ST_SetSRID(ST_MakePoint(${input.location.longitude}, ${input.location.latitude}), 4326)::geography
      LIMIT 1
    `);
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          distanceMeters: Number(row.distance_meters),
          createdAt: new Date(row.created_at),
        }
      : null;
  }

  async updateStatus(id: string, status: ReportStatus): Promise<StreetReport | null> {
    const result = await this.database.execute<ReportRow>(sql`
      UPDATE street_reports
      SET status = ${status}::report_status, updated_at = NOW()
      WHERE id = ${id}::uuid AND moderation_status = 'VISIBLE'
      RETURNING ${reportProjection}
    `);
    const row = result.rows[0];
    return row ? mapReport(row) : null;
  }
}
