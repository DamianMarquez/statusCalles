import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { getDatabasePoolOptions, getDatabaseUrl } from './config.js';

interface MigrationJournal {
  entries: { idx: number; when: number; tag: string }[];
}

const journalPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle/meta/_journal.json',
);
const journal = JSON.parse(await readFile(journalPath, 'utf8')) as MigrationJournal;
const pool = new Pool({
  connectionString: getDatabaseUrl(),
  options: '-c search_path=public,extensions',
  ...getDatabasePoolOptions(),
});

try {
  const table = await pool.query<{ exists: string | null }>(
    "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS exists",
  );

  if (!table.rows[0]?.exists) {
    console.log('No Drizzle migration history found. All migrations are pending.');
    for (const migration of journal.entries) console.log(`PENDING ${migration.tag}`);
  } else {
    const result = await pool.query<{ created_at: string }>(
      'SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
    );
    const applied = new Set(result.rows.map((row) => Number(row.created_at)));
    const pending = journal.entries.filter((migration) => !applied.has(migration.when));

    console.log(`Applied: ${journal.entries.length - pending.length}/${journal.entries.length}`);
    for (const migration of pending) console.log(`PENDING ${migration.tag}`);
    if (pending.length === 0) console.log('All migrations are applied.');
  }
} finally {
  await pool.end();
}
