import { sql } from 'drizzle-orm';
import type { StreetStatusDatabase } from './database.js';
import type { StreetTileRepository } from '../../modules/streets/application/street-tile-service.js';
import type { StreetRoadClass } from '../../modules/streets/domain/street-road-class.js';
import { STREET_TILE_SEGMENT_ZOOM } from '../../modules/streets/domain/street-tiles.js';

/** Nombre de la capa dentro del tile; el frontend la usa como `source-layer`. */
export const STREET_TILE_LAYER = 'streets';
const EXTENT = 4096;

/**
 * Genera el tile con PostGIS (ST_AsMVT). Los puntajes y el pavimento ya están calculados:
 * a zoom < 16 cada tramo lleva el puntaje agregado de su calle; desde 16, el de su tramo.
 */
export class DrizzleStreetTileRepository implements StreetTileRepository {
  constructor(private readonly database: StreetStatusDatabase) {}

  async findTile(
    zoom: number,
    x: number,
    y: number,
    roadClasses: StreetRoadClass[],
  ): Promise<Buffer | null> {
    if (roadClasses.length === 0) return null;
    const classesSql = sql.join(
      roadClasses.map((roadClass) => sql`${roadClass}::street_road_class`),
      sql`, `,
    );
    const bySegment = zoom >= STREET_TILE_SEGMENT_ZOOM;
    // Metros por píxel en EPSG:3857: la simplificación sube al alejarse el zoom.
    const metersPerPixel = 156543.03392804097 / 2 ** zoom;
    const tolerance = zoom < 14 ? metersPerPixel / 2 : metersPerPixel / 4;
    const scoreJoin = bySegment
      ? sql`LEFT JOIN street_segment_scores sc ON sc.segment_id = ss.id`
      : sql`LEFT JOIN street_scores sc ON sc.street_id = ss.street_id`;
    const lengthSql = bySegment
      ? sql`ROUND(ST_Length(ss.geometry::geography))::int`
      : sql`NULL::int`;
    const result = await this.database.execute<{ tile: Buffer | null }>(sql`
      WITH bounds AS (
        SELECT ST_TileEnvelope(${zoom}, ${x}, ${y}) AS env,
          ST_Transform(ST_TileEnvelope(${zoom}, ${x}, ${y}), 4326) AS env4326
      ), features AS (
        SELECT ss.id::text AS id, ss.street_id::text AS sid, st.official_name AS n,
          ss.road_class::text AS rc,
          sc.score::int AS sc, sc.level AS lv, COALESCE(sc.has_evidence, false) AS ev,
          (sc.result -> 'metrics' ->> 'activeReports')::int AS ar,
          sc.result -> 'availability' ->> 'status' AS av,
          COALESCE(info.surface_type, base.surface_type)::text AS st,
          CASE WHEN info.surface_type IS NOT NULL THEN 'COMMUNITY'
               WHEN base.source_slug = 'osm-surface' THEN 'OSM'
               WHEN base.source_slug = 'gcba-adoquinado' THEN 'GCBA' END AS ss,
          info.surface_condition::text AS sco,
          array_to_string(info.special_treatments::text[], ',') AS tr,
          ${lengthSql} AS len,
          ST_AsMVTGeom(
            ST_Simplify(ST_Transform(ss.geometry, 3857), ${tolerance}),
            b.env, ${EXTENT}, 64, true
          ) AS geom
        FROM bounds b
        JOIN street_segments ss ON ss.geometry && b.env4326
        JOIN streets st ON st.id = ss.street_id
        LEFT JOIN street_segment_information info ON info.segment_id = ss.id
        LEFT JOIN street_segment_surface_base base ON base.segment_id = ss.id
        ${scoreJoin}
        WHERE ss.road_class IN (${classesSql})
      )
      SELECT ST_AsMVT(features.*, ${STREET_TILE_LAYER}, ${EXTENT}, 'geom') AS tile
      FROM features
      WHERE geom IS NOT NULL
    `);
    const tile = result.rows[0]?.tile ?? null;
    return tile && tile.length > 0 ? tile : null;
  }
}
