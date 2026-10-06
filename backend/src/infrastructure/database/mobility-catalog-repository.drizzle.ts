import { sql } from 'drizzle-orm';
import type { MobilityCatalogRepository } from '../../modules/mobility/application/mobility-catalog.js';
import type {
  MobilityInfrastructureItem,
  MobilitySourceStatus,
} from '../../modules/mobility/domain/mobility-data.js';
import type { StreetStatusDatabase } from './database.js';

export class DrizzleMobilityCatalogRepository implements MobilityCatalogRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async findForStreet(streetId: string): Promise<MobilityInfrastructureItem[]> {
    const result = await this.database.execute<{
      id: string;
      type: MobilityInfrastructureItem['type'];
      name: string;
      metadata: Record<string, unknown>;
      source_name: string;
      source_url: string;
      last_sync_at: Date | null;
    }>(sql`
      SELECT DISTINCT mi.id, mi.type, mi.name, mi.metadata, gs.name AS source_name,
        gs.source_url, gs.last_sync_at
      FROM mobility_infrastructure mi
      JOIN geographic_sources gs ON gs.id = mi.source_id AND gs.last_status = 'SUCCEEDED'
      JOIN street_segments ss ON ss.street_id = ${streetId}::uuid
        AND ss.geometry && ST_Expand(mi.geometry, 25 / 90000.0)
        AND ST_DWithin(ss.geometry::geography, mi.geometry::geography, 25)
      ORDER BY mi.type, mi.name
      LIMIT 100
    `);
    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      details: row.metadata,
      source: {
        name: row.source_name,
        url: row.source_url,
        lastSuccessfulSync: row.last_sync_at?.toISOString() ?? null,
      },
    }));
  }

  async listSourceStatuses(): Promise<MobilitySourceStatus[]> {
    const result = await this.database.execute<{
      name: string;
      source_url: string;
      last_status: MobilitySourceStatus['status'];
      last_attempt_at: Date | null;
      last_sync_at: Date | null;
      last_record_count: number | null;
      last_error: string | null;
    }>(sql`
      SELECT name, source_url, last_status, last_attempt_at, last_sync_at, last_record_count, last_error
      FROM geographic_sources
      WHERE slug IN ('gcba-ciclovias', 'gcba-metrobus-corredores', 'gcba-metrobus-paradas')
      ORDER BY slug
    `);
    return result.rows.map((row) => ({
      source: row.name,
      url: row.source_url,
      status: row.last_status,
      lastAttempt: row.last_attempt_at?.toISOString() ?? null,
      lastSuccessfulSync: row.last_sync_at?.toISOString() ?? null,
      recordsImported: row.last_record_count,
      errorMessage: row.last_status === 'FAILED' ? row.last_error : null,
    }));
  }
}
