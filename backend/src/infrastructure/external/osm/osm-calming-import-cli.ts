import { createDatabase } from '../../database/database.js';
import { getDatabaseUrl } from '../../database/config.js';
import { OsmTrafficCalmingImporter } from './osm-traffic-calming-importer.js';

/**
 * Importa los reductores de velocidad de OpenStreetMap (`traffic_calming`).
 * Uso: npm run import:osm:calming --workspace @street-status/backend [-- --file=/ruta/overpass.json]
 */
const localFile = process.argv
  .find((argument) => argument.startsWith('--file='))
  ?.slice('--file='.length);
const { pool } = createDatabase(getDatabaseUrl());
try {
  const summary = await new OsmTrafficCalmingImporter(pool).import({
    ...(localFile ? { localFile } : {}),
  });
  console.info(
    `OSM: ${summary.elements} elementos, ${summary.mapped} con equivalente; ${summary.inserted} dentro de CABA (${summary.outsideCaba} afuera).`,
  );
  for (const [type, count] of Object.entries(summary.byType)) console.info(`  ${type}: ${count}`);
} catch (error) {
  console.error('No se pudieron importar los reductores de OpenStreetMap.', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
