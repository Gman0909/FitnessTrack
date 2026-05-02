import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = process.env.DATABASE_PATH ?? join(__dirname, '..', 'fitness.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    name          TEXT    NOT NULL,
    glyph         TEXT    NOT NULL DEFAULT '🏋️',
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL UNIQUE,
    muscle_group     TEXT    NOT NULL,
    equipment        TEXT    NOT NULL,
    default_increment REAL   NOT NULL DEFAULT 2.5
  );

  CREATE TABLE IF NOT EXISTS user_equipment (
    equipment TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS schedule (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    day_of_week INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    set_count   INTEGER NOT NULL DEFAULT 3,
    position    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS set_targets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    set_num     INTEGER NOT NULL,
    weight      REAL    NOT NULL,
    reps        INTEGER NOT NULL,
    valid_from  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT,
    week_num    INTEGER,
    session_dow INTEGER,
    pain        TEXT,
    recovery    TEXT,
    pump        TEXT,
    checked_in  INTEGER NOT NULL DEFAULT 0,
    plan_id     INTEGER REFERENCES workout_plans(id),
    user_id     INTEGER REFERENCES users(id),
    UNIQUE(plan_id, week_num, session_dow, user_id)
  );

  CREATE TABLE IF NOT EXISTS logged_sets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    set_num     INTEGER NOT NULL,
    reps_done   INTEGER,
    skipped     INTEGER NOT NULL DEFAULT 0,
    weight_used REAL
  );

  CREATE TABLE IF NOT EXISTS session_checkins (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    muscle_group TEXT    NOT NULL,
    pain         TEXT,
    recovery     TEXT,
    pump         TEXT,
    UNIQUE(session_id, muscle_group)
  );

  CREATE TABLE IF NOT EXISTS workout_plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    created_at TEXT    NOT NULL DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS plan_days (
    plan_id     INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    PRIMARY KEY (plan_id, day_of_week)
  );
`);

// ── Column migrations ─────────────────────────────────────────────────────────

const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);

if (!cols('exercises').includes('is_custom'))
  db.exec('ALTER TABLE exercises ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0');
if (!cols('schedule').includes('plan_id'))
  db.exec('ALTER TABLE schedule ADD COLUMN plan_id INTEGER REFERENCES workout_plans(id) ON DELETE CASCADE');
if (!cols('sessions').includes('plan_id'))
  db.exec('ALTER TABLE sessions ADD COLUMN plan_id INTEGER REFERENCES workout_plans(id)');
if (!cols('workout_plans').includes('week_count'))
  db.exec('ALTER TABLE workout_plans ADD COLUMN week_count INTEGER NOT NULL DEFAULT 4');
if (!cols('set_targets').includes('plan_id')) {
  db.exec('ALTER TABLE set_targets ADD COLUMN plan_id INTEGER REFERENCES workout_plans(id)');
  const activePlan = db.prepare('SELECT id FROM workout_plans WHERE is_active = 1').get();
  if (activePlan) {
    db.prepare(`
      UPDATE set_targets SET plan_id = ?
      WHERE plan_id IS NULL
      AND exercise_id IN (SELECT exercise_id FROM schedule WHERE plan_id = ?)
    `).run(activePlan.id, activePlan.id);
  }
}

// ── user_id on workout_plans ──────────────────────────────────────────────────

if (!cols('workout_plans').includes('user_id'))
  db.exec('ALTER TABLE workout_plans ADD COLUMN user_id INTEGER REFERENCES users(id)');

// ── Recreate sessions with per-user uniqueness ────────────────────────────────
// Original table had UNIQUE(date); multi-user needs UNIQUE(date, user_id).

if (!cols('sessions').includes('user_id')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE sessions_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT    NOT NULL,
      pain       TEXT,
      recovery   TEXT,
      pump       TEXT,
      checked_in INTEGER NOT NULL DEFAULT 0,
      plan_id    INTEGER REFERENCES workout_plans(id),
      user_id    INTEGER REFERENCES users(id),
      UNIQUE(date, user_id)
    );
    INSERT INTO sessions_new (id, date, pain, recovery, pump, checked_in, plan_id)
      SELECT id, date, pain, recovery, pump, checked_in, plan_id FROM sessions;
    DROP TABLE sessions;
    ALTER TABLE sessions_new RENAME TO sessions;
  `);
  db.pragma('foreign_keys = ON');
}

// ── Recreate sessions with week_num / session_dow ────────────────────────────
// Replaces date-based identity with position-based (week_num, session_dow).

if (!cols('sessions').includes('week_num')) {
  db.pragma('foreign_keys = OFF');

  const existing = db.prepare('SELECT * FROM sessions').all();
  const planMap  = {};
  for (const p of db.prepare('SELECT id, started_at FROM workout_plans').all())
    planMap[p.id] = p;

  function dowOfDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  }
  function weekNumOfDate(dateStr, startedAt) {
    const [y1, m1, d1] = dateStr.split('-').map(Number);
    const [y2, m2, d2] = startedAt.split('-').map(Number);
    const sessMs  = Date.UTC(y1, m1 - 1, d1);
    const startMs = Date.UTC(y2, m2 - 1, d2);
    const base    = startMs - ((new Date(startMs).getUTCDay() + 6) % 7) * 86400000;
    return Math.max(1, Math.floor((sessMs - base) / (7 * 86400000)) + 1);
  }

  db.exec(`
    CREATE TABLE sessions_new (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT,
      week_num    INTEGER,
      session_dow INTEGER,
      pain        TEXT,
      recovery    TEXT,
      pump        TEXT,
      checked_in  INTEGER NOT NULL DEFAULT 0,
      plan_id     INTEGER REFERENCES workout_plans(id),
      user_id     INTEGER REFERENCES users(id),
      UNIQUE(plan_id, week_num, session_dow, user_id)
    );
  `);

  const ins = db.prepare(`
    INSERT OR IGNORE INTO sessions_new
      (id, date, week_num, session_dow, pain, recovery, pump, checked_in, plan_id, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const s of existing) {
      let weekNum = null, sessionDow = null;
      if (s.date) {
        sessionDow = dowOfDate(s.date);
        const plan = s.plan_id ? planMap[s.plan_id] : null;
        weekNum    = plan?.started_at ? weekNumOfDate(s.date, plan.started_at) : 1;
      }
      ins.run(s.id, s.date ?? null, weekNum, sessionDow,
              s.pain, s.recovery, s.pump, s.checked_in,
              s.plan_id ?? null, s.user_id ?? null);
    }
  })();

  db.exec(`DROP TABLE sessions; ALTER TABLE sessions_new RENAME TO sessions;`);
  db.pragma('foreign_keys = ON');
}

if (!cols('session_checkins').includes('intensity'))
  db.exec('ALTER TABLE session_checkins ADD COLUMN intensity TEXT');
if (!cols('session_checkins').includes('pause_weight'))
  db.exec('ALTER TABLE session_checkins ADD COLUMN pause_weight INTEGER NOT NULL DEFAULT 0');
if (!cols('sessions').includes('unlocked'))
  db.exec('ALTER TABLE sessions ADD COLUMN unlocked INTEGER NOT NULL DEFAULT 0');

// Clear stale dates on currently-blank, never-finalized sessions. Earlier
// versions stamped session.date at slot-creation time (when the user merely
// navigated to the slot). The new rule is: blank sessions have NULL date and
// display as "today" until a real first log stamps a value. This is
// idempotent — re-runs only affect rows that are still in the blank state.
db.prepare(`
  UPDATE sessions SET date = NULL
  WHERE date IS NOT NULL
    AND checked_in = 0
    AND unlocked = 0
    AND id NOT IN (
      SELECT DISTINCT session_id FROM logged_sets
      WHERE skipped = 1 OR reps_done IS NOT NULL
    )
`).run();

// ── Per-muscle-group training preferences ─────────────────────────────────────

const tableNames = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
if (!tableNames.includes('muscle_group_settings')) {
  db.exec(`
    CREATE TABLE muscle_group_settings (
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      muscle_group   TEXT    NOT NULL,
      rep_range      TEXT    NOT NULL DEFAULT 'standard',
      aggressiveness TEXT    NOT NULL DEFAULT 'moderate',
      PRIMARY KEY (user_id, muscle_group)
    )
  `);
}

// ── Default equipment (all enabled on first install) ─────────────────────────

if (db.prepare('SELECT COUNT(*) as n FROM user_equipment').get().n === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO user_equipment (equipment) VALUES (?)');
  db.transaction(() => {
    for (const eq of ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight']) ins.run(eq);
  })();
}

// ── JWT secret (generated once, stored in DB) ─────────────────────────────────

if (!db.prepare("SELECT 1 FROM config WHERE key = 'jwt_secret'").get())
  db.prepare("INSERT INTO config (key, value) VALUES ('jwt_secret', ?)").run(randomBytes(32).toString('hex'));

export const jwtSecret = db.prepare("SELECT value FROM config WHERE key = 'jwt_secret'").get().value;

// ── Default-plan bootstrap (fresh DB with no plans) ───────────────────────────

if (db.prepare('SELECT COUNT(*) as n FROM workout_plans').get().n === 0) {
  const { lastInsertRowid: planId } = db.prepare(
    "INSERT INTO workout_plans (name, is_active, started_at) VALUES ('My Plan', 1, date('now'))"
  ).run();
  db.prepare('UPDATE schedule SET plan_id = ? WHERE plan_id IS NULL').run(planId);
  const days = db.prepare('SELECT DISTINCT day_of_week FROM schedule WHERE plan_id = ?').all(planId);
  const insDay = db.prepare('INSERT OR IGNORE INTO plan_days (plan_id, day_of_week) VALUES (?, ?)');
  db.transaction(() => { for (const { day_of_week } of days) insDay.run(planId, day_of_week); })();
}

export default db;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Database schema initialized');
  process.exit(0);
}
