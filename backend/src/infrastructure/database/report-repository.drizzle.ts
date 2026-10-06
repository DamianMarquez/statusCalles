import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import type {
  ReportRepository,
  NearbyReportsQuery,
  ReportViewportQuery,
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
  updated_at
`;

export class DrizzleReportRepository implements ReportRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async create(input: CreateStreetReport, userId?: string | null): Promise<StreetReport> {
    const result = await this.database.execute<ReportRow>(sql`
      INSERT INTO street_reports (user_id, type, severity, description, location)
      VALUES (
        ${userId ?? null}::uuid,
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
      )
      ORDER BY created_at DESC
      LIMIT 200
    `);
    return result.rows.map(mapReport);
  }

  async findInViewport(query: ReportViewportQuery): Promise<StreetReport[]> {
    const envelope = sql`ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326)`;
    const result = await this.database.execute<ReportRow>(sql`
      SELECT ${reportProjection}
      FROM street_reports
      WHERE location && (${envelope})::geography
        AND ST_Intersects(location::geometry, ${envelope})
      ORDER BY created_at DESC
      LIMIT 200
    `);
    return result.rows.map(mapReport);
  }

  async findById(id: string): Promise<StreetReport | null> {
    const result = await this.database.execute<ReportRow>(sql`
      SELECT ${reportProjection}
      FROM street_reports
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const row = result.rows[0];
    return row ? mapReport(row) : null;
  }

  async updateStatus(id: string, status: ReportStatus): Promise<StreetReport | null> {
    const result = await this.database.execute<ReportRow>(sql`
      UPDATE street_reports
      SET status = ${status}::report_status, updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING ${reportProjection}
    `);
    const row = result.rows[0];
    return row ? mapReport(row) : null;
  }
}
