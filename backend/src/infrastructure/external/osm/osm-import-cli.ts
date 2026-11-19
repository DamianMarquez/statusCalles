import { createDatabase } from '../../database/database.js';
import { getDatabaseUrl } from '../../database/config.js';
import { OsmSurfaceImporter } from './osm-surface-importer.js';

/**
 * Importa el pavimento base de OpenStreetMap (etiqueta `surface`).
 * Uso: npm run import:osm:surface --workspace @street-status/backend [-- --file=/ruta/overpass.json]
 */
const localFile = process.argv
  .find((argument) => argument.startsWith('--file='))
  ?.slice('--file='.length);
// El cruce espacial de decenas de miles de vías tarda más que el tiempo límite habitual.
process.env.DB_QUERY_TIMEOUT_MS ??= '900000';
const { pool } = createDatabase(getDatabaseUrl());
try {
  const started = Date.now();
  const summary = await new OsmSurfaceImporter(pool).import({
    ...(localFile ? { localFile } : {}),
  });
  const total = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM street_segments');
  const segments = total.rows[0]?.n ?? 0;
  console.info(
    `OSM: ${summary.ways} vías con "surface", ${summary.mappedWays} con equivalente en nuestros tipos.`,
  );
  console.info(
    `Tramos con pavimento base: ${summary.matchedSegments} de ${segments} (${((summary.matchedSegments / Math.max(segments, 1)) * 100).toFixed(1)} %) en ${Date.now() - started} ms.`,
  );
  for (const [surface, count] of Object.entries(summary.bySurface)) {
    console.info(`  ${surface}: ${count}`);
  }
} catch (error) {
  console.error('No se pudo importar el pavimento de OpenStreetMap.', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
