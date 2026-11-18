import { createDatabase } from './database.js';
import { getDatabaseUrl } from './config.js';
import { DrizzleStreetScoreStore } from './street-score-store.drizzle.js';
import { StreetScoreRefresher } from '../../modules/streets/application/street-score-refresher.js';

/** Recalcula los puntajes guardados. Pensado para cron (por ejemplo cada hora). */
const { database, pool } = createDatabase(getDatabaseUrl());
try {
  const started = Date.now();
  const refresher = new StreetScoreRefresher(new DrizzleStreetScoreStore(database));
  const count = await refresher.refreshAll();
  console.info(`Puntajes recalculados para ${count} calles en ${Date.now() - started} ms.`);
} catch (error) {
  console.error('No se pudieron recalcular los puntajes.', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
