import type { Pool } from 'pg';
import type { SurfaceType } from '../../../modules/streets/domain/road-information.js';

export interface SurfaceLine {
  /** Identificador en la fuente (id del way, id del feature). */
  ref: string;
  /** Nombre normalizado de la calle, si la fuente lo trae; sirve para desempatar. */
  normalizedName: string | null;
  surfaceType: SurfaceType;
  /** Vértices [longitud, latitud] de una polilínea. */
  coordinates: number[][];
}

export interface SurfaceMatchOptions {
  /** Distancia máxima entre la línea de la fuente y el tramo, en metros. */
  bufferMeters: number;
  /** Proporción mínima del tramo que debe quedar cubierta por la línea. */
  minRatio: number;
}

export const DEFAULT_MATCH_OPTIONS: SurfaceMatchOptions = { bufferMeters: 10, minRatio: 0.5 };

export interface SurfaceMatchResult {
  lines: number;
  matchedSegments: number;
  bySurface: Record<string, number>;
}

function toWkt(coordinates: number[][]): string {
  return `LINESTRING(${coordinates.map(([lon, lat]) => `${lon} ${lat}`).join(', ')})`;
}

/**
 * Reemplaza el pavimento base de una fuente: carga las líneas en una tabla temporal y asigna a
 * cada tramo del callejero la línea que más lo cubre. Todo en una transacción; solo toca la
 * tabla base de esa fuente (jamás la información de la comunidad).
 */
export async function replaceSourceSurfaces(
  pool: Pool,
  sourceId: string,
  lines: SurfaceLine[],
  options: SurfaceMatchOptions = DEFAULT_MATCH_OPTIONS,
): Promise<SurfaceMatchResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE surface_lines (
        ref text NOT NULL, normalized_name text, surface_type surface_type NOT NULL,
        geom geometry(LineString, 4326) NOT NULL,
        buf geometry NOT NULL
      ) ON COMMIT DROP
    `);
    const valid = lines.filter((line) => line.coordinates.length >= 2);
    for (let start = 0; start < valid.length; start += 500) {
      const batch = valid.slice(start, start + 500);
      const values: unknown[] = [];
      // El buffer en metros se calcula una sola vez por línea, no por cada tramo candidato.
      const bufferMeters = Number(options.bufferMeters);
      const placeholders = batch.map((line, index) => {
        const base = index * 4;
        values.push(line.ref, line.normalizedName, line.surfaceType, toWkt(line.coordinates));
        return `($${base + 1}, $${base + 2}, $${base + 3}::surface_type, ST_GeomFromText($${base + 4}, 4326), ST_Buffer(ST_Transform(ST_GeomFromText($${base + 4}, 4326), 5347), ${bufferMeters}))`;
      });
      await client.query(
        `INSERT INTO surface_lines (ref, normalized_name, surface_type, geom, buf) VALUES ${placeholders.join(', ')}`,
        values,
      );
    }
    await client.query('CREATE INDEX ON surface_lines USING gist (geom)');
    await client.query('ANALYZE surface_lines');
    await client.query('DELETE FROM street_segment_surface_baseline WHERE source_id = $1::uuid', [
      sourceId,
    ]);
    // El filtro por caja usa el índice GiST del callejero; las medidas se hacen en metros
    // (POSGAR 2007 / Argentina 5) solo para los candidatos.
    const inserted = await client.query(
      `INSERT INTO street_segment_surface_baseline
         (segment_id, source_id, surface_type, source_ref, match_ratio)
       SELECT DISTINCT ON (c.segment_id) c.segment_id, $1::uuid, c.surface_type, c.ref, LEAST(c.ratio, 1)
       FROM (
         SELECT ss.id AS segment_id, l.ref, l.surface_type,
           COALESCE(l.normalized_name = st.normalized_name, false) AS same_name,
           ST_Length(ST_Intersection(l.buf, ST_Transform(ss.geometry, 5347)))
             / NULLIF(ST_Length(ST_Transform(ss.geometry, 5347)), 0) AS ratio
         FROM surface_lines l
         JOIN street_segments ss ON ss.geometry && ST_Expand(l.geom, 0.0003)
         JOIN streets st ON st.id = ss.street_id
       ) c
       WHERE c.ratio >= $2
       ORDER BY c.segment_id, c.same_name DESC, c.ratio DESC`,
      [sourceId, options.minRatio],
    );
    const breakdown = await client.query<{ surface_type: string; n: number }>(
      `SELECT surface_type::text, COUNT(*)::int AS n FROM street_segment_surface_baseline
       WHERE source_id = $1::uuid GROUP BY 1 ORDER BY 2 DESC`,
      [sourceId],
    );
    await client.query('COMMIT');
    return {
      lines: valid.length,
      matchedSegments: inserted.rowCount ?? 0,
      bySurface: Object.fromEntries(breakdown.rows.map((row) => [row.surface_type, row.n])),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
