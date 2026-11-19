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
import { surfaceSourceFromSlug } from '../../modules/streets/domain/road-information.js';
import type { StoredScore } from '../../modules/streets/domain/stored-street-score.js';
import type {
  ConditionFeatureInput,
  StreetScoreReportInput,
  StreetScoreStreetInput,
  StreetScoreRepository,
} from '../../modules/streets/application/street-score-repository.js';
import { reportFreshnessThresholds } from '../../modules/reports/domain/report-freshness-policy.js';
import type { StreetRoadClass } from '../../modules/streets/domain/street-road-class.js';
import { STREET_LAYER_ZOOM_CONFIG } from '../../modules/streets/domain/street-road-class.js';

interface ScoreReportRow extends Record<string, unknown> {
  id: string;
  actor_id?: string | null;
  segment_id?: string | null;
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
  return {
    report,
    feedback,
    actorId: row.actor_id ?? null,
    segmentId: row.segment_id ?? null,
  };
}

export class DrizzleStreetScoreRepository implements StreetScoreRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async findConditionFeatures(
    query: ReportViewportQuery,
    zoom: number,
    roadClasses: StreetRoadClass[],
  ): Promise<ConditionFeatureInput[]> {
    if (roadClasses.length === 0) return [];
    const envelope = sql`ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326)`;
    const tolerance = Math.max(0.00001, Math.min(0.001, 0.08 / 2 ** Math.max(0, zoom - 12)));
    const classesSql = sql.join(
      roadClasses.map((roadClass) => sql`${roadClass}::street_road_class`),
      sql`, `,
    );
    if (zoom >= STREET_LAYER_ZOOM_CONFIG.detailedSegmentMinZoom) {
      const result = await this.database.execute<{
        id: string;
        street_id: string;
        street_name: string;
        road_class: StreetRoadClass;
        road_type: 'STREET' | 'AVENUE' | 'PASSAGE' | 'BOULEVARD' | 'HIGHWAY' | 'ACCESS' | null;
        surface_type: string | null;
        surface_source: string | null;
        surface_condition: string | null;
        special_treatments: string[] | null;
        information_updated_at: Date | string | null;
        geometry: string;
        score_result: StoredScore | null;
      }>(sql`
        SELECT ss.id::text AS id, ss.street_id::text AS street_id, st.official_name AS street_name,
          ss.road_class AS road_class, info.road_type,
          COALESCE(info.surface_type, base.surface_type) AS surface_type,
          CASE WHEN info.surface_type IS NOT NULL THEN 'COMMUNITY' ELSE base.source_slug END AS surface_source,
          info.surface_condition,
          info.special_treatments, info.updated_at AS information_updated_at,
          ST_AsGeoJSON(ST_SimplifyPreserveTopology(ss.geometry, ${tolerance})) AS geometry,
          sc.result AS score_result
        FROM street_segments ss
        JOIN streets st ON st.id = ss.street_id
        LEFT JOIN street_segment_information info ON info.segment_id = ss.id
        LEFT JOIN street_segment_surface_base base ON base.segment_id = ss.id
        LEFT JOIN street_segment_scores sc ON sc.segment_id = ss.id
        WHERE ss.geometry && ${envelope}
          AND ST_Intersects(ss.geometry, ${envelope})
          AND ss.road_class IN (${classesSql})
        ORDER BY ss.street_id, ss.id
        LIMIT 1200
      `);
      return result.rows.map((row) => ({
        id: row.id,
        streetId: row.street_id,
        streetName: row.street_name,
        roadClass: row.road_class,
        roadInformation: {
          roadType: row.road_type,
          surfaceType: row.surface_type as never,
          surfaceSource:
            row.surface_source === 'COMMUNITY'
              ? ('COMMUNITY' as const)
              : surfaceSourceFromSlug(row.surface_source),
          surfaceCondition: row.surface_condition as never,
          specialTreatments: row.special_treatments as never,
          updatedAt: row.information_updated_at
            ? new Date(row.information_updated_at).toISOString()
            : null,
        },
        geometry: JSON.parse(row.geometry) as ConditionFeatureInput['geometry'],
        score: row.score_result,
      }));
    }
    // Calles agrupadas: geometría ya unida (vista materializada) y puntaje por calle guardado.
    // Se recorta a un marco algo mayor que el viewport para no enviar avenidas enteras.
    const result = await this.database.execute<{
      street_id: string;
      street_name: string;
      road_class: StreetRoadClass;
      geometry: string | null;
      score_result: StoredScore | null;
    }>(sql`
      SELECT g.street_id::text AS street_id, g.official_name AS street_name,
        g.road_class AS road_class,
        ST_AsGeoJSON(ST_Multi(ST_SimplifyPreserveTopology(
          ST_CollectionExtract(ST_ClipByBox2D(g.geometry, ST_Expand(${envelope}, 0.01)), 2),
          ${tolerance}))) AS geometry,
        sc.result AS score_result
      FROM street_class_geometries g
      LEFT JOIN street_scores sc ON sc.street_id = g.street_id
      WHERE g.geometry && ${envelope} AND ST_Intersects(g.geometry, ${envelope})
        AND g.road_class IN (${classesSql})
      ORDER BY g.official_name
      LIMIT 600
    `);
    return result.rows
      .filter((row) => row.geometry !== null)
      .map((row) => ({
        id: `${row.street_id}:${row.road_class}`,
        streetId: row.street_id,
        streetName: row.street_name,
        roadClass: row.road_class,
        roadInformation: null,
        geometry: JSON.parse(row.geometry as string) as ConditionFeatureInput['geometry'],
        score: row.score_result,
      }));
  }

  async findStreetScore(streetId: string, asOf: Date): Promise<StreetScoreStreetInput | null> {
    const street = await this.database.execute<{ id: string; official_name: string }>(sql`
      SELECT id::text, official_name FROM streets WHERE id = ${streetId}::uuid LIMIT 1
    `);
    const streetRow = street.rows[0];
    if (!streetRow) return null;
    const result = await this.database.execute<ScoreReportRow>(sql`
      SELECT
        r.id::text AS id,
        r.user_id::text AS actor_id,
        r.street_segment_id::text AS segment_id,
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
        FROM report_feedback WHERE report_id = r.id
      ) f ON TRUE
      WHERE r.street_id = ${streetId}::uuid
        AND r.moderation_status = 'VISIBLE'
      ORDER BY r.created_at DESC
      LIMIT 5000
    `);
    const grouped = new Map<string, StreetScoreReportInput[]>();
    for (const row of result.rows) {
      const input = mapInput(row);
      const segmentId = row.segment_id ?? 'unassigned';
      const reports = grouped.get(segmentId) ?? [];
      reports.push(input);
      grouped.set(segmentId, reports);
    }
    return {
      id: streetRow.id,
      officialName: streetRow.official_name,
      segments: [...grouped.entries()].map(([id, reports]) => ({ id, reports })),
    };
  }

  async findSegmentScore(segmentId: string, asOf: Date) {
    const segment = await this.database.execute<{ id: string }>(sql`
      SELECT id::text FROM street_segments WHERE id = ${segmentId}::uuid LIMIT 1
    `);
    if (!segment.rows[0]) return null;
    const result = await this.database.execute<ScoreReportRow>(sql`
      SELECT r.id::text AS id, r.user_id::text AS actor_id, r.street_segment_id::text AS segment_id,
        r.type, r.severity, r.description,
        ST_Y(r.location::geometry) AS latitude, ST_X(r.location::geometry) AS longitude,
        r.status, r.created_at, r.updated_at,
        COALESCE(f.confirmations, 0) AS confirmations,
        COALESCE(f.resolved_reports, 0) AS resolved_reports,
        COALESCE(f.weighted_confirmations, 0) AS weighted_confirmations,
        COALESCE(f.weighted_resolved_reports, 0) AS weighted_resolved_reports,
        f.latest_confirmation_at
      FROM street_reports r
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE type = 'CONFIRM') AS confirmations,
          COUNT(*) FILTER (WHERE type = 'RESOLVED') AS resolved_reports,
          SUM(EXP(-LN(2) * GREATEST(EXTRACT(EPOCH FROM (${asOf}::timestamptz - updated_at)) / 86400.0, 0) / ${reportFreshnessThresholds.confirmationHalfLifeDays}))
            FILTER (WHERE type = 'CONFIRM') AS weighted_confirmations,
          SUM(EXP(-LN(2) * GREATEST(EXTRACT(EPOCH FROM (${asOf}::timestamptz - updated_at)) / 86400.0, 0) / ${reportFreshnessThresholds.confirmationHalfLifeDays}))
            FILTER (WHERE type = 'RESOLVED') AS weighted_resolved_reports,
          MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
        FROM report_feedback WHERE report_id = r.id
      ) f ON TRUE
      WHERE r.street_segment_id = ${segmentId}::uuid AND r.moderation_status = 'VISIBLE'
      ORDER BY r.created_at DESC LIMIT 5000
    `);
    return { id: segmentId, reports: result.rows.map(mapInput) };
  }

  async findSegmentScores(segmentIds: string[], asOf: Date) {
    if (segmentIds.length === 0) return [];
    // Un solo parámetro JSON en lugar de un bind por id (evita el límite de parámetros).
    const segmentIdList = sql`(SELECT jsonb_array_elements_text(${JSON.stringify(segmentIds)}::jsonb)::uuid)`;
    const result = await this.database.execute<ScoreReportRow>(sql`
      SELECT r.id::text AS id, r.user_id::text AS actor_id, r.street_segment_id::text AS segment_id,
        r.type, r.severity, r.description,
        ST_Y(r.location::geometry) AS latitude, ST_X(r.location::geometry) AS longitude,
        r.status, r.created_at, r.updated_at,
        COALESCE(f.confirmations, 0) AS confirmations,
        COALESCE(f.resolved_reports, 0) AS resolved_reports,
        COALESCE(f.weighted_confirmations, 0) AS weighted_confirmations,
        COALESCE(f.weighted_resolved_reports, 0) AS weighted_resolved_reports,
        f.latest_confirmation_at
      FROM street_reports r
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE type = 'CONFIRM') AS confirmations,
          COUNT(*) FILTER (WHERE type = 'RESOLVED') AS resolved_reports,
          SUM(EXP(-LN(2) * GREATEST(EXTRACT(EPOCH FROM (${asOf}::timestamptz - updated_at)) / 86400.0, 0) / ${reportFreshnessThresholds.confirmationHalfLifeDays}))
            FILTER (WHERE type = 'CONFIRM') AS weighted_confirmations,
          SUM(EXP(-LN(2) * GREATEST(EXTRACT(EPOCH FROM (${asOf}::timestamptz - updated_at)) / 86400.0, 0) / ${reportFreshnessThresholds.confirmationHalfLifeDays}))
            FILTER (WHERE type = 'RESOLVED') AS weighted_resolved_reports,
          MAX(updated_at) FILTER (WHERE type = 'CONFIRM') AS latest_confirmation_at
        FROM report_feedback WHERE report_id = r.id
      ) f ON TRUE
      WHERE r.street_segment_id IN ${segmentIdList}
        AND r.moderation_status = 'VISIBLE'
      ORDER BY r.created_at DESC
    `);
    const grouped = new Map<string, StreetScoreReportInput[]>();
    for (const row of result.rows) {
      if (!row.segment_id) continue;
      const values = grouped.get(row.segment_id) ?? [];
      values.push(mapInput(row));
      grouped.set(row.segment_id, values);
    }
    return [...grouped.entries()].map(([id, reports]) => ({ id, reports }));
  }
}
