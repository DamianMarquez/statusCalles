import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import {
  MAP_FEATURE_TYPES,
  type MapFeature,
  type MapFeatureCategory,
  type MapFeaturesRepository,
} from '../../modules/mobility/application/map-features.js';

export class DrizzleMapFeaturesRepository implements MapFeaturesRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async findFeatures(categories: MapFeatureCategory[]): Promise<MapFeature[]> {
    const types = categories.flatMap((category) => [...MAP_FEATURE_TYPES[category]]);
    if (types.length === 0) return [];
    const typeList = sql`(SELECT jsonb_array_elements_text(${JSON.stringify(types)}::jsonb))`;
    const result = await this.database.execute<{
      id: string;
      type: string;
      name: string | null;
      slug: string;
      longitude: number;
      latitude: number;
      metadata: Record<string, unknown> | null;
    }>(sql`
      SELECT mi.id::text AS id, mi.type, mi.name, gs.slug,
        ST_X(p.pt) AS longitude, ST_Y(p.pt) AS latitude, mi.metadata
      FROM mobility_infrastructure mi
      JOIN geographic_sources gs ON gs.id = mi.source_id
      CROSS JOIN LATERAL (SELECT ST_PointOnSurface(mi.geometry) AS pt) p
      WHERE mi.type IN ${typeList}
        -- Obras públicas vigentes: fin futuro, o sin fecha de fin pero iniciadas hace menos de un año.
        AND (mi.type <> 'PUBLIC_WORK'
             OR mi.metadata ->> 'endDate' >= to_char(CURRENT_DATE, 'YYYY-MM-DD')
             OR (mi.metadata ->> 'endDate' IS NULL
                 AND mi.metadata ->> 'startDate' >= to_char(CURRENT_DATE - INTERVAL '1 year', 'YYYY-MM-DD')))
    `);
    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name ?? '',
      source: row.slug,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      metadata: row.metadata ?? {},
    }));
  }
}
