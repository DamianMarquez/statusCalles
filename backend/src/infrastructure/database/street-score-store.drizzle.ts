import { sql, type SQL } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import { DrizzleStreetScoreRepository } from './street-score-repository.drizzle.js';
import type {
  StoredScoreRow,
  StreetScoreStore,
  StreetScoreUpdate,
} from '../../modules/streets/application/street-score-store.js';

function valuesSql(rows: SQL[]): SQL {
  return sql.join(rows, sql`, `);
}

export class DrizzleStreetScoreStore implements StreetScoreStore {
  private readonly repository: DrizzleStreetScoreRepository;

  constructor(private readonly database: StreetStatusDatabase) {
    this.repository = new DrizzleStreetScoreRepository(database);
  }

  async findStreetEvidence(streetIds: string[], asOf: Date) {
    if (streetIds.length === 0) return [];
    const streetList = sql`(SELECT jsonb_array_elements_text(${JSON.stringify(streetIds)}::jsonb)::uuid)`;
    const segments = await this.database.execute<{ segment_id: string; street_id: string }>(sql`
      SELECT DISTINCT ss.id::text AS segment_id, ss.street_id::text AS street_id
      FROM street_reports r
      JOIN street_segments ss ON ss.id = r.street_segment_id
      WHERE ss.street_id IN ${streetList} AND r.moderation_status = 'VISIBLE'
    `);
    const evidence = await this.repository.findSegmentScores(
      segments.rows.map((row) => row.segment_id),
      asOf,
    );
    const reportsBySegment = new Map(evidence.map((item) => [item.id, item.reports]));
    const byStreet = new Map<string, Array<{ id: string; reports: never[] | unknown[] }>>();
    for (const row of segments.rows) {
      const list = byStreet.get(row.street_id) ?? [];
      list.push({ id: row.segment_id, reports: reportsBySegment.get(row.segment_id) ?? [] });
      byStreet.set(row.street_id, list);
    }
    return [...byStreet.entries()].map(([streetId, items]) => ({
      streetId,
      segments: items as Awaited<
        ReturnType<StreetScoreStore['findStreetEvidence']>
      >[number]['segments'],
    }));
  }

  async saveStreetScores(updates: StreetScoreUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    await this.database.transaction(async (tx) => {
      const streetIds = updates.map((update) => update.streetId);
      const streetList = sql`(SELECT jsonb_array_elements_text(${JSON.stringify(streetIds)}::jsonb)::uuid)`;
      await tx.execute(sql`DELETE FROM street_segment_scores WHERE street_id IN ${streetList}`);
      await tx.execute(sql`DELETE FROM street_scores WHERE street_id IN ${streetList}`);
      const segmentValues: SQL[] = [];
      const streetValues: SQL[] = [];
      const row = (item: StoredScoreRow) =>
        sql`${item.score}::smallint, ${item.level}, ${item.hasEvidence}, ${JSON.stringify(item.result)}::jsonb, ${item.calculatedAt.toISOString()}::timestamptz`;
      for (const update of updates) {
        for (const segment of update.segments) {
          segmentValues.push(sql`(${segment.id}::uuid, ${update.streetId}::uuid, ${row(segment)})`);
        }
        if (update.street)
          streetValues.push(sql`(${update.streetId}::uuid, ${row(update.street)})`);
      }
      if (segmentValues.length > 0) {
        await tx.execute(sql`
          INSERT INTO street_segment_scores
            (segment_id, street_id, score, level, has_evidence, result, calculated_at)
          VALUES ${valuesSql(segmentValues)}
        `);
      }
      if (streetValues.length > 0) {
        await tx.execute(sql`
          INSERT INTO street_scores (street_id, score, level, has_evidence, result, calculated_at)
          VALUES ${valuesSql(streetValues)}
        `);
      }
    });
  }

  async findStreetIdByReportId(reportId: string): Promise<string | null> {
    const result = await this.database.execute<{ street_id: string | null }>(sql`
      SELECT ss.street_id::text AS street_id
      FROM street_reports r
      JOIN street_segments ss ON ss.id = r.street_segment_id
      WHERE r.id = ${reportId}::uuid
      LIMIT 1
    `);
    return result.rows[0]?.street_id ?? null;
  }

  async findStreetIdsToRefresh(): Promise<string[]> {
    const result = await this.database.execute<{ street_id: string }>(sql`
      SELECT ss.street_id::text AS street_id
      FROM street_reports r
      JOIN street_segments ss ON ss.id = r.street_segment_id
      WHERE r.moderation_status = 'VISIBLE'
      UNION
      SELECT street_id::text FROM street_scores
    `);
    return result.rows.map((row) => row.street_id);
  }
}
