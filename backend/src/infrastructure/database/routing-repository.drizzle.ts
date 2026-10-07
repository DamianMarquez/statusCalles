import { sql } from 'drizzle-orm';
import type { RoutingRepository } from '../../modules/routing/application/routing-repository.js';
import type { RoutePoint, RouteSegmentEvidence } from '../../modules/routing/domain/routing.js';
import type { StreetStatusDatabase } from './database.js';

export class DrizzleRoutingRepository implements RoutingRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async isWithinCaba(point: RoutePoint): Promise<boolean> {
    const result = await this.database.execute<{ inside: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM communes
        WHERE ST_Covers(geometry, ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}), 4326))
      ) AS inside
    `);
    return result.rows[0]?.inside === true;
  }

  async findSegmentsAlongRoute(coordinates: [number, number][]): Promise<RouteSegmentEvidence[]> {
    if (coordinates.length < 2 || coordinates.length > 20_000) return [];
    const routeGeoJson = JSON.stringify({ type: 'LineString', coordinates });
    const result = await this.database.execute<{
      id: string;
      official_name: string;
      length_meters: number | string;
      maximum_severity: number | null;
    }>(sql`
      WITH route AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON(${routeGeoJson}), 4326) AS geometry
      )
      SELECT ss.id::text AS id, s.official_name,
        GREATEST(ST_Length(ST_Intersection(route.geometry,
          ST_Buffer(ss.geometry::geography, 10)::geometry)::geography), 0) AS length_meters,
        activity.maximum_severity
      FROM route
      JOIN street_segments ss
        ON ss.geometry && ST_Expand(ST_Envelope(route.geometry), 0.0003)
        AND ST_DWithin(ss.geometry::geography, route.geometry::geography, 15)
      JOIN streets s ON s.id = ss.street_id
      LEFT JOIN LATERAL (
        SELECT MAX(r.severity)::int AS maximum_severity
        FROM street_reports r
        WHERE r.street_segment_id = ss.id
          AND r.moderation_status = 'VISIBLE'
          AND r.status <> 'RESOLVED'
          AND r.updated_at >= NOW() - INTERVAL '30 days'
      ) activity ON TRUE
      ORDER BY length_meters DESC
      LIMIT 350
    `);
    return result.rows.map((row) => ({
      id: row.id,
      officialName: row.official_name,
      lengthMeters: Number(row.length_meters),
      score: null,
      level: null,
      maximumSeverity:
        row.maximum_severity === 1 ||
        row.maximum_severity === 2 ||
        row.maximum_severity === 3 ||
        row.maximum_severity === 4
          ? row.maximum_severity
          : null,
      activeOfficialCut: false,
    }));
  }
}
