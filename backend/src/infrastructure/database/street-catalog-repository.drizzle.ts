import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import type {
  NearbyStreet,
  StreetCatalogRepository,
  StreetDetail,
  TerritoryDto,
} from '../../modules/streets/application/street-catalog.js';
import type { StreetLocationResolution } from '../../modules/streets/application/street-location-resolver.js';

export class DrizzleStreetCatalogRepository implements StreetCatalogRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async findNearestStreetSegment(
    latitude: number,
    longitude: number,
    maxDistanceMeters: number,
  ): Promise<StreetLocationResolution | null> {
    const point = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;
    const result = await this.database.execute<
      StreetLocationResolution & Record<string, unknown>
    >(sql`
      SELECT s.id AS "streetId", ss.id AS "streetSegmentId"
      FROM street_segments ss
      JOIN streets s ON s.id = ss.street_id
      WHERE ss.geometry && ST_Expand(${point}, ${maxDistanceMeters} / 90000.0)
        AND ST_DWithin(
          ss.geometry::geography,
          (${point})::geography,
          ${maxDistanceMeters}
        )
      ORDER BY ST_Distance(ss.geometry::geography, (${point})::geography), ss.source_segment_id
      LIMIT 1
    `);
    return result.rows[0] ?? null;
  }

  async findStreet(id: string): Promise<StreetDetail | null> {
    const result = await this.database.execute<{
      id: string;
      official_name: string;
      normalized_name: string;
      segment_count: number | string;
      neighborhoods: string[] | null;
      communes: string[] | null;
    }>(sql`
      SELECT s.id, s.official_name, s.normalized_name,
        COUNT(DISTINCT ss.id)::int AS segment_count,
        COALESCE(array_agg(DISTINCT n.name) FILTER (WHERE n.name IS NOT NULL), ARRAY[]::text[]) AS neighborhoods,
        COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), ARRAY[]::text[]) AS communes
      FROM streets s
      LEFT JOIN street_segments ss ON ss.street_id = s.id
      LEFT JOIN neighborhoods n ON n.id = ss.neighborhood_id
      LEFT JOIN communes c ON c.id = ss.commune_id
      WHERE s.id = ${id}::uuid
      GROUP BY s.id
      LIMIT 1
    `);
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          officialName: row.official_name,
          normalizedName: row.normalized_name,
          segmentCount: Number(row.segment_count),
          neighborhoods: row.neighborhoods ?? [],
          communes: row.communes ?? [],
        }
      : null;
  }

  async findNearbyStreets(query: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  }): Promise<NearbyStreet[]> {
    const point = sql`ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)`;
    const result = await this.database.execute<{
      id: string;
      official_name: string;
      distance_meters: number | string;
      neighborhood_name: string | null;
      commune_name: string | null;
    }>(sql`
      SELECT DISTINCT ON (s.id) s.id, s.official_name,
        ST_Distance(ss.geometry::geography, (${point})::geography) AS distance_meters,
        n.name AS neighborhood_name, c.name AS commune_name
      FROM street_segments ss
      JOIN streets s ON s.id = ss.street_id
      LEFT JOIN neighborhoods n ON n.id = ss.neighborhood_id
      LEFT JOIN communes c ON c.id = ss.commune_id
      WHERE ss.geometry && ST_Expand(${point}, ${query.radiusMeters} / 90000.0)
        AND ST_DWithin(ss.geometry::geography, (${point})::geography, ${query.radiusMeters})
      ORDER BY s.id, ST_Distance(ss.geometry::geography, (${point})::geography)
    `);
    return result.rows
      .map((row) => ({
        id: row.id,
        officialName: row.official_name,
        distanceMeters: Number(row.distance_meters),
        neighborhoodName: row.neighborhood_name,
        communeName: row.commune_name,
      }))
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
      .slice(0, 50);
  }

  async listNeighborhoods(): Promise<TerritoryDto[]> {
    const result = await this.database.execute<{
      id: number;
      name: string;
      commune_id: number;
      geometry: unknown;
    }>(sql`
      SELECT id, name, commune_id, ST_AsGeoJSON(geometry)::json AS geometry
      FROM neighborhoods ORDER BY normalized_name
    `);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      communeId: row.commune_id,
      geometry: row.geometry,
    }));
  }

  async listCommunes(): Promise<TerritoryDto[]> {
    const result = await this.database.execute<{ id: number; name: string; geometry: unknown }>(sql`
      SELECT id, name, ST_AsGeoJSON(geometry)::json AS geometry
      FROM communes ORDER BY id
    `);
    return result.rows.map((row) => ({ id: row.id, name: row.name, geometry: row.geometry }));
  }
}
