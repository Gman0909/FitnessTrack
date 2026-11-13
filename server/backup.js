import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Automatic database snapshots, written to a `backups/` folder next to the DB.
// Taken before schema migrations and before an in-app update. Uses
// `VACUUM INTO`, which is synchronous and produces a consistent, compacted copy
// even while the database is in WAL mode. Only the newest KEEP automatic
// snapshots are retained.
export const KEEP = 10;

export function backupDir(dbPath) {
  return join(dirname(dbPath), 'backups');
}

export function backupDb(db, dbPath, reason) {
  if (!dbPath || dbPath === ':memory:') return null;
  const dir = backupDir(dbPath);
  mkdirSync(dir, { recursive: true });
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(dir, `fitness-${ts}-${reason.replace(/[^a-z0-9-]/gi, '')}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  prune(dir);
  return file;
}

function prune(dir) {
  const snaps = readdirSync(dir).filter(f => /^fitness-.*\.db$/.test(f)).sort();
  for (const f of snaps.slice(0, Math.max(0, snaps.length - KEEP))) rmSync(join(dir, f));
}
