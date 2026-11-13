// Versioned schema migrations, tracked with SQLite's PRAGMA user_version.
//
// The column-sniffing block in db.js is the frozen *baseline* (idempotent, run
// on every start). Every schema change from 1.8 onward goes here instead:
// append a new entry with the next version number — never edit or reorder a
// shipped one. Each migration runs in its own transaction together with the
// user_version bump, so a failure leaves the database at the previous version.
// db.js snapshots the database (backups/) before applying any pending ones.

const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);

export const MIGRATIONS = [
  {
    version: 1,
    name: 'admin flag',
    up(db) {
      // The first account is the admin: it alone may run the in-app updater,
      // open/close registration and edit shared library exercises.
      if (!cols(db, 'users').includes('is_admin'))
        db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
      db.exec('UPDATE users SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM users)');
    },
  },
  {
    version: 2,
    name: 'custom exercise ownership',
    up(db) {
      // Custom exercises become private to the account that uses them. A
      // custom exercise referenced (scheduled or logged) by exactly one account
      // is assigned to it; anything ambiguous stays shared (owner NULL), so no
      // one loses access to an exercise they already use.
      if (!cols(db, 'exercises').includes('owner_user_id'))
        db.exec('ALTER TABLE exercises ADD COLUMN owner_user_id INTEGER REFERENCES users(id)');
      const users = db.prepare(`
        SELECT wp.user_id AS u FROM schedule s JOIN workout_plans wp ON wp.id = s.plan_id
          WHERE s.exercise_id = @id AND wp.user_id IS NOT NULL
        UNION
        SELECT se.user_id AS u FROM logged_sets ls JOIN sessions se ON se.id = ls.session_id
          WHERE ls.exercise_id = @id AND se.user_id IS NOT NULL
      `);
      const setOwner = db.prepare('UPDATE exercises SET owner_user_id = ? WHERE id = ?');
      for (const { id } of db.prepare('SELECT id FROM exercises WHERE is_custom = 1').all()) {
        const us = users.all({ id });
        if (us.length === 1) setOwner.run(us[0].u, id);
      }
    },
  },
  {
    version: 3,
    name: 'per-user equipment',
    up(db) {
      // user_equipment was one global list shared by every account. Each
      // existing account inherits the current list.
      if (cols(db, 'user_equipment').includes('user_id')) return;
      db.exec(`
        ALTER TABLE user_equipment RENAME TO user_equipment_legacy;
        CREATE TABLE user_equipment (
          user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          equipment TEXT    NOT NULL,
          PRIMARY KEY (user_id, equipment)
        );
        INSERT INTO user_equipment (user_id, equipment)
          SELECT u.id, l.equipment FROM users u CROSS JOIN user_equipment_legacy l;
        DROP TABLE user_equipment_legacy;
      `);
    },
  },
];

export const LATEST_VERSION = MIGRATIONS.at(-1).version;

export function pendingMigrations(db) {
  const v = db.pragma('user_version', { simple: true });
  return MIGRATIONS.filter(m => m.version > v);
}

export function runMigrations(db) {
  for (const m of pendingMigrations(db)) {
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
    console.log(`Migrated database to v${m.version} (${m.name})`);
  }
}
