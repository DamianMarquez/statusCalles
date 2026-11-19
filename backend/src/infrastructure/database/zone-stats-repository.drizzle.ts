import { sql, type SQL } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import { publicWorkInForce } from './public-work-rule.js';
import type { ZoneStatsRepository } from '../../modules/zones/application/zone-service.js';
import type { ZoneLevel, ZoneRaw } from '../../modules/zones/domain/zone-metrics.js';
import { MAP_FEATURE_TYPES } from '../../modules/mobility/application/map-features.js';

/** Las tablas se eligen de una lista fija: nunca se arma un nombre con datos externos. */
const ZONE_TABLES: Record<ZoneLevel, SQL> = {
  commune: sql.raw('communes'),
  neighborhood: sql.raw('neighborhoods'),
};
/** Columna del tramo con la zona que le asignó el callejero (puede ser nula). */
const SEGMENT_ZONE_COLUMN: Record<ZoneLevel, SQL> = {
  commune: sql.raw('ss.commune_id'),
  neighborhood: sql.raw('ss.neighborhood_id'),
};

// Tolerancia en grados (~10 m): los polígonos son de manzana a barrio y se dibujan a zoom bajo.
const SIMPLIFY_TOLERANCE = 0.0001;

function jsonList(values: readonly string[]): SQL {
  return sql`(SELECT jsonb_array_elements_text(${JSON.stringify(values)}::jsonb))`;
}

/**
 * Totales por zona. Cada tramo, marca o reporte se asigna a la zona que lo contiene
 * (cruce espacial): así no se pierden los tramos sin `commune_id` en el callejero.
 */
export class DrizzleZoneStatsRepository implements ZoneStatsRepository {
  /**
   * `tableOverrides` permite apuntar a otras tablas de zonas (con las mismas columnas), por ejemplo
   * en pruebas, sin tocar las comunas y barrios reales. Los nombres se validan.
   */
  constructor(
    private readonly database: StreetStatusDatabase,
    private readonly tableOverrides: Partial<Record<ZoneLevel, string>> = {},
  ) {
    for (const name of Object.values(tableOverrides)) {
      if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name))
        throw new Error('Nombre de tabla de zonas inválido.');
    }
  }

  async findZones(level: ZoneLevel): Promise<ZoneRaw[]> {
    const override = this.tableOverrides[level];
    const zones = override ? sql.raw(override) : ZONE_TABLES[level];
    const storedZone = SEGMENT_ZONE_COLUMN[level];
    const communeColumn = level === 'neighborhood' ? sql`z.commune_id` : sql`NULL::int`;

    const [geometry, segments, marks, reports] = await Promise.all([
      this.database.execute<{
        id: number;
        name: string;
        commune_id: number | null;
        geometry: string;
      }>(sql`
        SELECT z.id, z.name, ${communeColumn} AS commune_id,
          ST_AsGeoJSON(ST_SimplifyPreserveTopology(z.geometry, ${SIMPLIFY_TOLERANCE})) AS geometry
        FROM ${zones} z
        ORDER BY z.id
      `),
      this.database.execute<{
        zone_id: number;
        st: string | null;
        km: number;
        segments: number;
        scored: number;
        score_sum: number | null;
        scored_km: number | null;
      }>(sql`
        WITH seg AS (
          SELECT COALESCE(${storedZone}, located.id) AS zone_id,
            ST_Length(ss.geometry::geography) AS len,
            COALESCE(info.surface_type, base.surface_type)::text AS st,
            sc.has_evidence AS ev, sc.score
          FROM street_segments ss
          -- Casi todos los tramos ya traen su zona del callejero; solo a los que no, se les busca por ubicación.
          LEFT JOIN LATERAL (
            SELECT z.id FROM ${zones} z
            WHERE ${storedZone} IS NULL
              AND z.geometry && ST_PointOnSurface(ss.geometry)
              AND ST_Within(ST_PointOnSurface(ss.geometry), z.geometry)
            LIMIT 1
          ) located ON TRUE
          LEFT JOIN street_segment_information info ON info.segment_id = ss.id
          LEFT JOIN street_segment_surface_base base ON base.segment_id = ss.id
          LEFT JOIN street_segment_scores sc ON sc.segment_id = ss.id
        )
        SELECT zone_id, st, SUM(len) / 1000.0 AS km, COUNT(*)::int AS segments,
          COUNT(*) FILTER (WHERE ev)::int AS scored,
          SUM(score) FILTER (WHERE ev)::float AS score_sum,
          SUM(len) FILTER (WHERE ev) / 1000.0 AS scored_km
        FROM seg
        WHERE zone_id IS NOT NULL
        GROUP BY zone_id, st
      `),
      this.database.execute<{ zone_id: number; type: string; n: number }>(sql`
        SELECT z.id AS zone_id, mi.type, COUNT(*)::int AS n
        FROM mobility_infrastructure mi
        CROSS JOIN LATERAL (SELECT ST_PointOnSurface(mi.geometry) AS pt) p
        JOIN ${zones} z ON z.geometry && p.pt AND ST_Within(p.pt, z.geometry)
        WHERE mi.type IN ${jsonList([...MAP_FEATURE_TYPES.calming, ...MAP_FEATURE_TYPES.works])}
          AND ${publicWorkInForce('mi')}
        GROUP BY z.id, mi.type
      `),
      // Reportes visibles, no resueltos y con actividad en los últimos 30 días.
      this.database.execute<{ zone_id: number; type: string; severity: number; n: number }>(sql`
        SELECT z.id AS zone_id, r.type::text AS type, r.severity::int AS severity, COUNT(*)::int AS n
        FROM street_reports r
        JOIN ${zones} z ON z.geometry && r.location::geometry
          AND ST_Within(r.location::geometry, z.geometry)
        LEFT JOIN LATERAL (
          SELECT MAX(f.updated_at) AS last_confirmation
          FROM report_feedback f WHERE f.report_id = r.id AND f.type = 'CONFIRM'
        ) f ON TRUE
        WHERE r.moderation_status = 'VISIBLE' AND r.status <> 'RESOLVED'
          AND GREATEST(r.created_at, COALESCE(f.last_confirmation, r.created_at))
              >= NOW() - INTERVAL '30 days'
        GROUP BY z.id, r.type, r.severity
      `),
    ]);

    const byId = new Map<number, ZoneRaw>(
      geometry.rows.map((row) => [
        Number(row.id),
        {
          id: Number(row.id),
          name: row.name,
          communeId: row.commune_id === null ? null : Number(row.commune_id),
          geometry: JSON.parse(row.geometry) as unknown,
          totalKm: 0,
          segments: 0,
          scoredSegments: 0,
          scoreSum: 0,
          scoredKm: 0,
          surfaceKm: {},
          publicWorks: 0,
          calming: {},
          reportedWorks: 0,
          reportedCuts: 0,
          criticalReports: 0,
          highReports: 0,
          activeReports: 0,
        },
      ]),
    );

    for (const row of segments.rows) {
      const zone = byId.get(Number(row.zone_id));
      if (!zone) continue;
      zone.totalKm += Number(row.km);
      zone.segments += Number(row.segments);
      zone.scoredSegments += Number(row.scored);
      zone.scoreSum += Number(row.score_sum ?? 0);
      zone.scoredKm += Number(row.scored_km ?? 0);
      if (row.st) zone.surfaceKm[row.st] = (zone.surfaceKm[row.st] ?? 0) + Number(row.km);
    }
    for (const row of marks.rows) {
      const zone = byId.get(Number(row.zone_id));
      if (!zone) continue;
      if (row.type === 'PUBLIC_WORK') zone.publicWorks += Number(row.n);
      else zone.calming[row.type] = (zone.calming[row.type] ?? 0) + Number(row.n);
    }
    for (const row of reports.rows) {
      const zone = byId.get(Number(row.zone_id));
      if (!zone) continue;
      const count = Number(row.n);
      zone.activeReports += count;
      if (row.type === 'ROAD_WORK') zone.reportedWorks += count;
      if (row.type === 'ROAD_BLOCKED') zone.reportedCuts += count;
      if (Number(row.severity) === 4) zone.criticalReports += count;
      if (Number(row.severity) === 3) zone.highReports += count;
    }
    return [...byId.values()];
  }
}
