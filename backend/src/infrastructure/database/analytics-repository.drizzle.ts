import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import type {
  AnalyticsFilters,
  AnalyticsRepository,
} from '../../modules/analytics/application/analytics-repository.js';

function reportFilters(filters: AnalyticsFilters) {
  const clauses = [sql`r.moderation_status = 'VISIBLE'`];
  if (filters.from) clauses.push(sql`r.created_at >= ${filters.from}`);
  if (filters.to) clauses.push(sql`r.created_at < ${filters.to}`);
  if (filters.type) clauses.push(sql`r.type = ${filters.type}::report_type`);
  if (filters.severity) clauses.push(sql`r.severity = ${filters.severity}`);
  if (filters.neighborhoodId) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM neighborhoods n
      WHERE n.id = ${filters.neighborhoodId}
        AND ST_Covers(n.geometry, r.location::geometry)
    )`);
  }
  if (filters.communeId) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM communes c
      WHERE c.id = ${filters.communeId}
        AND ST_Covers(c.geometry, r.location::geometry)
    )`);
  }
  return sql.join(clauses, sql` AND `);
}

export class DrizzleAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async overview(filters: AnalyticsFilters) {
    const where = reportFilters(filters);
    const result = await this.database.execute(sql`
      WITH selected AS (
        SELECT r.id, r.status, r.created_at, r.updated_at,
          COALESCE(f.latest_confirmation_at, r.created_at) AS last_activity,
          EXISTS (SELECT 1 FROM report_feedback confirmed WHERE confirmed.report_id = r.id AND confirmed.type = 'CONFIRM') AS confirmed
        FROM street_reports r
        LEFT JOIN LATERAL (
          SELECT MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
          FROM report_feedback WHERE report_id = r.id
        ) f ON TRUE
        WHERE ${where}
      )
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status <> 'RESOLVED' AND last_activity >= NOW() - INTERVAL '30 days')::int AS active,
        COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
        COUNT(*) FILTER (WHERE status <> 'RESOLVED' AND last_activity < NOW() - INTERVAL '30 days')::int AS stale,
        COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)
          FILTER (WHERE status = 'RESOLVED' AND updated_at >= created_at), 0)::float AS average_resolution_hours,
        COUNT(*) FILTER (WHERE confirmed)::int AS confirmed,
        CASE WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE confirmed) / COUNT(*), 1) END::float AS confirmed_percent,
        CASE WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status <> 'RESOLVED' AND last_activity < NOW() - INTERVAL '30 days') / COUNT(*), 1) END::float AS stale_percent
      FROM selected
    `);
    return result.rows[0] ?? {};
  }

  async reports(filters: AnalyticsFilters) {
    const where = reportFilters(filters);
    const [types, severities] = await Promise.all([
      this.database.execute(sql`
        SELECT r.type, COUNT(*)::int AS count FROM street_reports r
        WHERE ${where} GROUP BY r.type ORDER BY count DESC, r.type
      `),
      this.database.execute(sql`
        SELECT r.severity, COUNT(*)::int AS count FROM street_reports r
        WHERE ${where} GROUP BY r.severity ORDER BY r.severity
      `),
    ]);
    return { byType: types.rows, bySeverity: severities.rows };
  }

  async neighborhoods(filters: AnalyticsFilters) {
    const where = reportFilters(filters);
    const result = await this.database.execute(sql`
      SELECT area.neighborhood_id AS id, area.neighborhood_name AS name,
        area.commune_id AS "communeId", area.commune_name AS "communeName",
        COUNT(*)::int AS reports,
        COUNT(*) FILTER (WHERE r.status <> 'RESOLVED' AND GREATEST(r.created_at, COALESCE(feedback.latest_confirmation_at, r.created_at)) >= NOW() - INTERVAL '30 days')::int AS active,
        COUNT(*) FILTER (WHERE r.status = 'RESOLVED')::int AS resolved
      FROM street_reports r
      LEFT JOIN LATERAL (
        SELECT n.id AS neighborhood_id, n.name AS neighborhood_name,
          c.id AS commune_id, c.name AS commune_name
        FROM neighborhoods n JOIN communes c ON c.id = n.commune_id
        WHERE ST_Covers(n.geometry, r.location::geometry)
        ORDER BY n.id LIMIT 1
      ) area ON TRUE
      LEFT JOIN LATERAL (
        SELECT MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
        FROM report_feedback WHERE report_id = r.id
      ) feedback ON TRUE
      WHERE ${where}
      GROUP BY area.neighborhood_id, area.neighborhood_name, area.commune_id, area.commune_name
      ORDER BY reports DESC, area.neighborhood_name NULLS LAST
      LIMIT 50
    `);
    return result.rows;
  }

  async communes(filters: AnalyticsFilters) {
    const where = reportFilters(filters);
    const result = await this.database.execute(sql`
      SELECT area.commune_id AS id, area.commune_name AS name, COUNT(*)::int AS reports,
        COUNT(*) FILTER (WHERE r.status <> 'RESOLVED' AND GREATEST(r.created_at, COALESCE(feedback.latest_confirmation_at, r.created_at)) >= NOW() - INTERVAL '30 days')::int AS active,
        COUNT(*) FILTER (WHERE r.status = 'RESOLVED')::int AS resolved
      FROM street_reports r
      LEFT JOIN LATERAL (
        SELECT c.id AS commune_id, c.name AS commune_name
        FROM communes c WHERE ST_Covers(c.geometry, r.location::geometry)
        ORDER BY c.id LIMIT 1
      ) area ON TRUE
      LEFT JOIN LATERAL (
        SELECT MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
        FROM report_feedback WHERE report_id = r.id
      ) feedback ON TRUE
      WHERE ${where}
      GROUP BY area.commune_id, area.commune_name
      ORDER BY reports DESC, area.commune_name NULLS LAST
      LIMIT 20
    `);
    return result.rows;
  }

  async trends(filters: AnalyticsFilters, bucket: 'day' | 'week' | 'month') {
    const where = reportFilters(filters);
    const bucketLiteral = sql.raw(`'${bucket}'`);
    const result = await this.database.execute(sql`
      SELECT date_trunc(${bucketLiteral}, r.created_at) AS period,
        COUNT(*)::int AS reports,
        COUNT(*) FILTER (WHERE r.severity >= 3)::int AS high_severity,
        COUNT(*) FILTER (WHERE r.status = 'RESOLVED')::int AS resolved
      FROM street_reports r
      WHERE ${where}
      GROUP BY period ORDER BY period ASC LIMIT 800
    `);
    return result.rows;
  }

  async heatmap(
    filters: AnalyticsFilters,
    bounds: { south: number; north: number; west: number; east: number; cellSize: number },
  ) {
    const where = reportFilters(filters);
    const envelope = sql`ST_MakeEnvelope(${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326)`;
    const result = await this.database.execute(sql`
      WITH cells AS (
        SELECT ST_SnapToGrid(r.location::geometry, ${bounds.cellSize}) AS cell,
          COUNT(*)::int AS reports,
          COUNT(*) FILTER (WHERE r.severity >= 3)::int AS high_severity,
          COUNT(*) FILTER (WHERE r.status <> 'RESOLVED' AND GREATEST(r.created_at, COALESCE(feedback.latest_confirmation_at, r.created_at)) >= NOW() - INTERVAL '30 days')::int AS active
        FROM street_reports r
        LEFT JOIN LATERAL (
          SELECT MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
          FROM report_feedback WHERE report_id = r.id
        ) feedback ON TRUE
        WHERE ${where}
          AND r.location && (${envelope})::geography
          AND ST_Intersects(r.location::geometry, ${envelope})
        GROUP BY cell
      )
      SELECT ST_Y(cell) AS latitude, ST_X(cell) AS longitude, reports, active, high_severity
      FROM cells ORDER BY reports DESC LIMIT 2500
    `);
    return { cellSize: bounds.cellSize, cells: result.rows };
  }

  async streets(filters: AnalyticsFilters, limit: number) {
    const where = reportFilters(filters);
    const result = await this.database.execute(sql`
      SELECT s.id, s.official_name AS "officialName", COUNT(*)::int AS reports,
        COUNT(*) FILTER (WHERE r.status <> 'RESOLVED' AND GREATEST(r.created_at, COALESCE(feedback.latest_confirmation_at, r.created_at)) >= NOW() - INTERVAL '30 days')::int AS active,
        COUNT(*) FILTER (WHERE r.severity >= 3)::int AS high_severity,
        COUNT(DISTINCT seg.neighborhood_id)::int AS neighborhoods,
        COUNT(DISTINCT seg.commune_id)::int AS communes
      FROM street_reports r
      JOIN streets s ON s.id = r.street_id
      LEFT JOIN street_segments seg ON seg.id = r.street_segment_id
      LEFT JOIN LATERAL (
        SELECT MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
        FROM report_feedback WHERE report_id = r.id
      ) feedback ON TRUE
      WHERE ${where}
      GROUP BY s.id, s.official_name
      ORDER BY active DESC, high_severity DESC, reports DESC
      LIMIT ${limit}
    `);
    return result.rows;
  }

  async segments(filters: AnalyticsFilters, limit: number) {
    const where = reportFilters(filters);
    const result = await this.database.execute(sql`
      SELECT seg.id, s.id AS "streetId", s.official_name AS "officialName", COUNT(*)::int AS reports
      FROM street_reports r
      JOIN street_segments seg ON seg.id = r.street_segment_id
      JOIN streets s ON s.id = seg.street_id
      LEFT JOIN LATERAL (
        SELECT MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
        FROM report_feedback WHERE report_id = r.id
      ) feedback ON TRUE
      WHERE ${where}
      GROUP BY seg.id, s.id, s.official_name
      ORDER BY COUNT(*) FILTER (WHERE r.status <> 'RESOLVED' AND GREATEST(r.created_at, COALESCE(feedback.latest_confirmation_at, r.created_at)) >= NOW() - INTERVAL '30 days') DESC,
        COUNT(*) FILTER (WHERE r.severity >= 3) DESC, reports DESC
      LIMIT ${limit}
    `);
    return result.rows;
  }

  async moderationOverview() {
    const result = await this.database.execute(sql`
      SELECT COUNT(*) FILTER (WHERE reviewed_at IS NULL)::int AS pending_flags,
        COUNT(*)::int AS total_flags,
        COUNT(*) FILTER (WHERE reason = 'SPAM' AND reviewed_at IS NULL)::int AS spam,
        COUNT(*) FILTER (WHERE reason = 'INAPPROPRIATE' AND reviewed_at IS NULL)::int AS inappropriate,
        COUNT(*) FILTER (WHERE reason = 'FALSE_INFORMATION' AND reviewed_at IS NULL)::int AS false_information,
        COUNT(*) FILTER (WHERE reason = 'OTHER' AND reviewed_at IS NULL)::int AS other
      FROM report_flags
    `);
    return result.rows[0] ?? {};
  }

  async adminOverview() {
    const result = await this.database.execute(sql`
      SELECT (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM street_reports) AS all_reports,
        (SELECT COUNT(*)::int FROM street_reports WHERE moderation_status = 'HIDDEN') AS hidden_reports,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'slug', slug, 'name', name, 'status', last_status,
          'lastSyncAt', last_sync_at, 'lastRecordCount', last_record_count
        ) ORDER BY name) FROM geographic_sources), '[]'::jsonb) AS official_sources
    `);
    return result.rows[0] ?? {};
  }

  async officialOverview() {
    const result = await this.database.execute(sql`
      SELECT
        COALESCE((SELECT jsonb_agg(jsonb_build_object('type', type, 'count', count) ORDER BY type)
          FROM (SELECT type, COUNT(*)::int AS count FROM mobility_infrastructure GROUP BY type) infrastructure), '[]'::jsonb) AS infrastructure,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'status', last_status,
          'lastSyncAt', last_sync_at, 'lastRecordCount', last_record_count) ORDER BY name)
          FROM geographic_sources), '[]'::jsonb) AS sources,
        FALSE AS realtime_traffic_available
    `);
    return result.rows[0] ?? {};
  }

  async proximity(
    filters: AnalyticsFilters,
    point: { latitude: number; longitude: number; radiusMeters: number },
  ) {
    const where = reportFilters(filters);
    const center = sql`ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}), 4326)::geography`;
    const result = await this.database.execute(sql`
      SELECT r.type, r.severity, COUNT(*)::int AS reports,
        ROUND(AVG(ST_Distance(r.location, ${center}))::numeric)::int AS average_distance_meters
      FROM street_reports r
      WHERE ${where} AND ST_DWithin(r.location, ${center}, ${point.radiusMeters})
      GROUP BY r.type, r.severity
      ORDER BY reports DESC, r.severity DESC
      LIMIT 100
    `);
    return {
      center: { latitude: point.latitude, longitude: point.longitude },
      radiusMeters: point.radiusMeters,
      groups: result.rows,
    };
  }
}
