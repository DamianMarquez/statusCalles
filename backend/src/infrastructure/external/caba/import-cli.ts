import { createDatabase } from '../../database/database.js';
import { getDatabaseUrl } from '../../database/config.js';
import { CabaDatasetImporter, type cabaDatasets } from './caba-dataset-importer.js';

type DatasetName = keyof typeof cabaDatasets;
const requested = process.argv[2];
const order: DatasetName[] = ['communes', 'neighborhoods', 'streets'];
const selected = requested === 'all' ? order : [requested as DatasetName];

if (!selected.every((name) => order.includes(name))) {
  console.error(
    'Usage: import:caba:<streets|neighborhoods|communes|all> [--file=/path/to/data.geojson]',
  );
  process.exitCode = 2;
} else {
  const localFile = process.argv
    .find((argument) => argument.startsWith('--file='))
    ?.slice('--file='.length);
  const { database, pool } = createDatabase(getDatabaseUrl());
  const importer = new CabaDatasetImporter(database);
  try {
    for (const dataset of selected) {
      const count = await importer.import(dataset, { ...(localFile ? { localFile } : {}) });
      console.info(`${dataset}: ${count} official records imported/updated.`);
    }
  } catch (error) {
    let cause: unknown = error;
    const messages: string[] = [];
    while (cause && typeof cause === 'object') {
      const item = cause as {
        message?: unknown;
        cause?: unknown;
        code?: unknown;
        detail?: unknown;
      };
      if (typeof item.message === 'string') messages.push(item.message);
      if (typeof item.code === 'string') messages.push(`database code ${item.code}`);
      if (typeof item.detail === 'string') messages.push(item.detail);
      cause = item.cause;
    }
    console.error(messages.join(' | ') || 'CABA dataset import failed.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
