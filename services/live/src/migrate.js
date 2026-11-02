// Minimal forward-only migration runner: applies ../migrations/*.sql and *.js in name order,
// once each, inside a transaction, guarded by an advisory lock so several replicas can boot together.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool } from './db.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const LOCK_ID = 727001;

export async function migrate(log = console) {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    const files = (await readdir(dir)).filter(f => /\.(sql|js)$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      log.info(`applying migration ${f}`);
      await c.query('BEGIN');
      try {
        const full = path.join(dir, f);
        if (f.endsWith('.sql')) await c.query(await readFile(full, 'utf8'));
        else await (await import(pathToFileURL(full).href)).up(c);
        await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    c.release();
  }
}
