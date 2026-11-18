import { Pool } from 'pg';
import { getDatabasePoolOptions, getDatabaseUrl } from './config.js';

/**
 * Reportes ficticios SOLO para probar el mapa de puntajes en una base local.
 * Uso: npm run seed:lab --workspace backend [-- --clean]
 */
const url = getDatabaseUrl();
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error(`Rechazado: DATABASE_URL apunta a "${host}". Este seed solo corre en localhost.`);
  process.exit(1);
}

const MARK = '[LAB] reporte de prueba';
const TYPES = ['POTHOLE', 'ROAD_DAMAGE', 'ROAD_IRREGULARITY', 'ROAD_ELEVATION', 'ROAD_SUBSIDENCE'];
// Zona de prueba: microcentro y alrededores.
const AREA = { south: -34.625, north: -34.585, west: -58.41, east: -58.36 };
const SEGMENTS = 220;

const pool = new Pool({
  connectionString: url,
  options: '-c search_path=public,extensions',
  ...getDatabasePoolOptions(),
});

try {
  const removed = await pool.query('DELETE FROM street_reports WHERE description LIKE $1', [
    `${MARK}%`,
  ]);
  console.log(`Reportes [LAB] previos eliminados: ${removed.rowCount}`);

  if (!process.argv.includes('--clean')) {
    const result = await pool.query(
      `WITH picked AS (
         SELECT id, street_id, geometry
         FROM street_segments
         WHERE road_class IN ('PRIMARY', 'SECONDARY', 'LOCAL')
           AND geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326)
         ORDER BY random()
         LIMIT $5
       ), expanded AS (
         SELECT p.*, generate_series(1, 1 + floor(random() * 4)::int) AS n FROM picked p
       )
       INSERT INTO street_reports
         (street_id, street_segment_id, type, severity, description, location, status, created_at, updated_at)
       SELECT street_id, id,
         (ARRAY[${TYPES.map((type) => `'${type}'`).join(',')}])[1 + floor(random() * ${TYPES.length})::int]::report_type,
         1 + floor(random() * 4)::int,
         $6,
         ST_SetSRID(ST_LineInterpolatePoint(ST_GeometryN(geometry, 1), 0.2 + random() * 0.6), 4326)::geography,
         'ACTIVE',
         now() - (random() * interval '25 days'),
         now() - (random() * interval '5 days')
       FROM expanded`,
      [AREA.west, AREA.south, AREA.east, AREA.north, SEGMENTS, MARK],
    );
    console.log(`Reportes [LAB] insertados: ${result.rowCount}`);
  }
} finally {
  await pool.end();
}
