import { Router } from 'express';
import { join, dirname } from 'path';
import db, { dbPath } from '../db.js';

const router = Router();

const WEEK_OF = `date(s.date, '-' || ((cast(strftime('%w', s.date) as integer) + 6) % 7) || ' days')`;
const SCOPE   = `s.user_id = ? AND (? IS NULL OR s.plan_id = ?)`;
const SCOPE2  = `s2.user_id = ? AND (? IS NULL OR s2.plan_id = ?)`;
const DOW_NAME = `CASE s.session_dow WHEN 0 THEN 'Mon' WHEN 1 THEN 'Tue' WHEN 2 THEN 'Wed' WHEN 3 THEN 'Thu' WHEN 4 THEN 'Fri' WHEN 5 THEN 'Sat' ELSE 'Sun' END`;

function sendCsv(res, filename, headers, rows) {
  const esc = v => {
    const s = String(v ?? '');
    return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

router.get('/', (req, res) => {
  const uid    = req.user.id;
  const planId = req.query.scope === 'active'
    ? (db.prepare('SELECT id FROM workout_plans WHERE is_active = 1 AND user_id = ?').get(uid)?.id ?? null)
    : null;
  const P = [uid, planId, planId];

  const ov = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL THEN s.id END) AS total_workouts,
      COALESCE(SUM(CASE WHEN ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL
        THEN ls.weight_used * ls.reps_done END), 0)                                                                       AS total_volume,
      COUNT(CASE WHEN ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL THEN 1 END)              AS sets_logged,
      MIN(CASE WHEN ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL THEN s.date END)           AS first_date,
      MAX(CASE WHEN ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL THEN s.date END)           AS last_date
    FROM sessions s LEFT JOIN logged_sets ls ON ls.session_id = s.id
    WHERE ${SCOPE}
  `).get(...P);

  let avg_per_week = 0;
  if (ov.first_date && ov.last_date && ov.total_workouts > 0) {
    const days = Math.max(7, (new Date(ov.last_date) - new Date(ov.first_date)) / 86400000 + 1);
    avg_per_week = +(ov.total_workouts / (days / 7)).toFixed(1);
  }

  const weekly_volume = db.prepare(`
    SELECT ${WEEK_OF} AS week_start, SUM(ls.weight_used * ls.reps_done) AS volume
    FROM sessions s JOIN logged_sets ls ON ls.session_id = s.id
    WHERE ${SCOPE} AND ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL
    GROUP BY week_start ORDER BY week_start
  `).all(...P);

  const session_volume = db.prepare(`
    SELECT s.date, SUM(ls.weight_used * ls.reps_done) AS volume
    FROM sessions s JOIN logged_sets ls ON ls.session_id = s.id
    WHERE ${SCOPE} AND ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL
    GROUP BY s.date ORDER BY s.date
  `).all(...P);

  const muscle_volume = db.prepare(`
    SELECT e.muscle_group, SUM(ls.weight_used * ls.reps_done) AS volume
    FROM logged_sets ls
    JOIN sessions s  ON s.id  = ls.session_id
    JOIN exercises e ON e.id  = ls.exercise_id
    WHERE ${SCOPE} AND ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL
    GROUP BY e.muscle_group ORDER BY volume DESC
  `).all(...P);

  const personal_bests = db.prepare(`
    SELECT e.id AS exercise_id, e.name, e.muscle_group,
           ls.weight_used AS max_weight, ls.reps_done
    FROM logged_sets ls
    JOIN sessions s  ON s.id  = ls.session_id
    JOIN exercises e ON e.id  = ls.exercise_id
    WHERE ${SCOPE} AND ls.skipped = 0 AND ls.weight_used IS NOT NULL AND ls.reps_done IS NOT NULL
      AND ls.weight_used = (
        SELECT MAX(ls2.weight_used)
        FROM logged_sets ls2 JOIN sessions s2 ON s2.id = ls2.session_id
        WHERE ls2.exercise_id = ls.exercise_id AND ${SCOPE2}
          AND ls2.skipped = 0 AND ls2.weight_used IS NOT NULL
      )
    GROUP BY ls.exercise_id
    ORDER BY max_weight DESC
    LIMIT 20
  `).all(...P, ...P);

  const top_exercises = db.prepare(`
    SELECT e.id AS exercise_id, e.name, e.muscle_group,
           COUNT(DISTINCT s.id) AS session_count, COUNT(ls.id) AS set_count
    FROM logged_sets ls
    JOIN sessions s  ON s.id  = ls.session_id
    JOIN exercises e ON e.id  = ls.exercise_id
    WHERE ${SCOPE} AND ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL
    GROUP BY ls.exercise_id
    ORDER BY session_count DESC
    LIMIT 10
  `).all(...P);

  res.json({ overview: { ...ov, avg_per_week }, weekly_volume, session_volume, muscle_volume, personal_bests, top_exercises });
});

router.get('/export', (req, res) => {
  const uid    = req.user.id;
  const type   = req.query.type ?? 'exercise_history';
  const planId = req.query.scope === 'active'
    ? (db.prepare('SELECT id FROM workout_plans WHERE is_active = 1 AND user_id = ?').get(uid)?.id ?? null)
    : null;
  const P    = [uid, planId, planId];
  const slug = planId ? '-this-plan' : '';

  if (type === 'exercise_history') {
    const rows = db.prepare(`
      SELECT s.date, COALESCE(wp.name,'') AS plan_name, s.week_num,
             ${DOW_NAME} AS day,
             e.name AS exercise, e.muscle_group,
             ls.set_num, ls.weight_used, ls.reps_done, ls.skipped
      FROM logged_sets ls
      JOIN sessions s  ON s.id  = ls.session_id
      JOIN exercises e ON e.id  = ls.exercise_id
      LEFT JOIN workout_plans wp ON wp.id = s.plan_id
      WHERE ${SCOPE} AND s.date IS NOT NULL
      ORDER BY s.date, s.id, e.id, ls.set_num
    `).all(...P);
    return sendCsv(res, `exercise-history${slug}.csv`,
      ['date','plan','week','day','exercise','muscle_group','set_num','weight_kg','reps','skipped'],
      rows.map(r => [r.date, r.plan_name, r.week_num, r.day, r.exercise, r.muscle_group,
                     r.set_num, r.weight_used ?? '', r.reps_done ?? '', r.skipped ? 'yes' : 'no']));
  }

  if (type === 'sessions') {
    const rows = db.prepare(`
      SELECT s.date, COALESCE(wp.name,'') AS plan_name, s.week_num,
             ${DOW_NAME} AS day,
             ROUND(COALESCE(SUM(CASE WHEN ls.skipped=0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL
               THEN ls.weight_used * ls.reps_done END), 0)) AS volume,
             COUNT(CASE WHEN ls.skipped=0 AND ls.reps_done IS NOT NULL THEN 1 END) AS sets_logged,
             s.checked_in
      FROM sessions s
      LEFT JOIN logged_sets ls ON ls.session_id = s.id
      LEFT JOIN workout_plans wp ON wp.id = s.plan_id
      WHERE ${SCOPE} AND s.date IS NOT NULL
      GROUP BY s.id
      HAVING volume > 0 OR sets_logged > 0
      ORDER BY s.date, s.id
    `).all(...P);
    return sendCsv(res, `sessions${slug}.csv`,
      ['date','plan','week','day','volume_kg_reps','sets_logged','checked_in'],
      rows.map(r => [r.date, r.plan_name, r.week_num, r.day, r.volume, r.sets_logged,
                     r.checked_in ? 'yes' : 'no']));
  }

  if (type === 'personal_bests') {
    const rows = db.prepare(`
      SELECT e.name AS exercise, e.muscle_group,
             ls.weight_used AS weight_kg, ls.reps_done AS reps, s.date
      FROM logged_sets ls
      JOIN sessions s  ON s.id  = ls.session_id
      JOIN exercises e ON e.id  = ls.exercise_id
      WHERE ${SCOPE} AND ls.skipped=0 AND ls.weight_used IS NOT NULL AND ls.reps_done IS NOT NULL
        AND ls.weight_used = (
          SELECT MAX(ls2.weight_used) FROM logged_sets ls2
          JOIN sessions s2 ON s2.id = ls2.session_id
          WHERE ls2.exercise_id = ls.exercise_id AND ${SCOPE2}
            AND ls2.skipped=0 AND ls2.weight_used IS NOT NULL
        )
      GROUP BY ls.exercise_id
      ORDER BY ls.weight_used DESC
    `).all(...P, ...P);
    return sendCsv(res, `personal-bests${slug}.csv`,
      ['exercise','muscle_group','max_weight_kg','reps','date'],
      rows.map(r => [r.exercise, r.muscle_group, r.weight_kg, r.reps, r.date]));
  }

  if (type === 'weekly_volume') {
    const rows = db.prepare(`
      SELECT ${WEEK_OF} AS week_start,
             ROUND(SUM(ls.weight_used * ls.reps_done)) AS volume_kg_reps
      FROM sessions s JOIN logged_sets ls ON ls.session_id = s.id
      WHERE ${SCOPE} AND ls.skipped=0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL
      GROUP BY week_start ORDER BY week_start
    `).all(...P);
    return sendCsv(res, `weekly-volume${slug}.csv`,
      ['week_start','volume_kg_reps'],
      rows.map(r => [r.week_start, r.volume_kg_reps]));
  }

  res.status(400).json({ error: 'Unknown export type' });
});

router.post('/reset', async (req, res) => {
  const uid  = req.user.id;
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = `fitness-backup-${ts}.db`;
  try {
    await db.backup(join(dirname(dbPath), file));
    db.transaction(() => {
      for (const { id } of db.prepare('SELECT id FROM workout_plans WHERE user_id = ?').all(uid))
        db.prepare('DELETE FROM set_targets WHERE plan_id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
    })();
    res.json({ ok: true, backup: file });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
