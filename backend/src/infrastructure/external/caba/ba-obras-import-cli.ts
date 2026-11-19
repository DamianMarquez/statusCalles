import { createDatabase } from '../../database/database.js';
import { getDatabaseUrl } from '../../database/config.js';
import { BaObrasImporter } from './ba-obras-importer.js';

/**
 * Importa las obras públicas del GCBA (BA Obras) con coordenadas.
 * Uso: npm run sync:caba:obras --workspace @street-status/backend [-- --file=/ruta/ba-obras.csv]
 */
const localFile = process.argv
  .find((argument) => argument.startsWith('--file='))
  ?.slice('--file='.length);
const { pool } = createDatabase(getDatabaseUrl());
try {
  const summary = await new BaObrasImporter(pool).import({ ...(localFile ? { localFile } : {}) });
  console.info(
    `BA Obras: ${summary.rows} filas; ${summary.inserted} obras con coordenadas importadas.`,
  );
  console.info(
    `  Sin coordenadas: ${summary.withoutCoordinates}. Fuera de CABA: ${summary.outsideCaba}.`,
  );
} catch (error) {
  console.error('No se pudieron importar las obras públicas de BA Obras.', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
