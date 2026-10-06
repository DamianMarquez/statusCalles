import { createDatabase } from '../../database/database.js';
import { getDatabaseUrl } from '../../database/config.js';
import {
  CabaMobilityDatasetImporter,
  cabaMobilityDatasets,
  type CabaMobilityDataset,
} from './mobility-dataset-importer.js';

const name = process.argv[2];
const all: CabaMobilityDataset[] = ['ciclovias', 'metrobus', 'metrobusStops'];
const selected = name === 'all' ? all : [name as CabaMobilityDataset];
if (!selected.every((item) => item in cabaMobilityDatasets)) {
  console.error(
    'Usage: sync:caba:<ciclovias|metrobus|metrobus-stops|all> [--file=/path/to/data.geojson]',
  );
  process.exitCode = 2;
} else {
  const localFile = process.argv
    .find((argument) => argument.startsWith('--file='))
    ?.slice('--file='.length);
  const { database, pool } = createDatabase(getDatabaseUrl());
  try {
    const importer = new CabaMobilityDatasetImporter(database);
    for (const dataset of selected) {
      const count = await importer.sync(dataset, localFile ? { localFile } : {});
      console.info(`${dataset}: ${count} official records synchronized.`);
    }
  } catch (error) {
    const messages: string[] = [];
    let cause: unknown = error;
    while (cause && typeof cause === 'object') {
      const item = cause as { message?: unknown; cause?: unknown };
      if (typeof item.message === 'string' && !messages.includes(item.message))
        messages.push(item.message);
      cause = item.cause;
    }
    console.error(messages.join(' | ') || 'Official mobility sync failed.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
