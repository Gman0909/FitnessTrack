import { Router } from 'express';
import db from '../db.js';
import { nextSetTarget, computeCheckinModifier } from '../../shared/algorithm.js';

const router = Router();

const todayStr = () => new Date().toISOString().split('T')[0];

function getOrCreateSession(date, userId) {
  let session = db.prepare('SELECT * FROM sessions WHERE date = ? AND user_id = ?').get(date, userId);
  if (!session) {
    const activePlan = db.prepare('SELECT id FROM workout_plans WHERE is_active = 1 AND user_id = ?').get(userId);
    const { lastInsertRowid } = db.prepare('INSERT INTO sessions (date, plan_id, user_id) VALUES (?, ?, ?)')
      .run(date, activePlan?.id ?? null, userId);
    session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(lastInsertRowid);
  }
  return session;
}

router.get('/today', (req, res) => { res.json(getOrCreateSession(todayStr(), req.user.id)); });

router.get('/date/:date', (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date))
    return res.status(400).json({ error: 'Invalid date format' });
  res.json(getOrCreateSession(req.params.date, req.user.id));
});

router.post('/:id/skip', (req, res) => {
  const sessionId = req.params.id;
  const session   = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  const dayDate    = new Date(session.date + 'T00:00:00');
  const dow        = (dayDate.getDay() + 6) % 7;
  const activePlan = db.prepare('SELECT id FROM workout_plans WHERE is_active = 1 AND user_id = ?').get(req.user.id);

  db.transaction(() => {
    if (activePlan) {
      const slots = db.prepare(`
        SELECT s.set_count, e.id as exercise_id
        FROM schedule s JOIN exercises e ON e.id = s.exercise_id
        WHERE s.day_of_week = ? AND s.plan_id = ?
      `).all(dow, activePlan.id);
      const ins = db.prepare(`
        INSERT OR IGNORE INTO logged_sets (session_id, exercise_id, set_num, reps_done, skipped, weight_used)
        VALUES (?, ?, ?, NULL, 1, NULL)
      `);
      for (const slot of slots)
        for (let i = 1; i <= slot.set_count; i++)
          ins.run(sessionId, slot.exercise_id, i);
    }
    db.prepare('UPDATE sessions SET checked_in = 1 WHERE id = ?').run(sessionId);
  })();

  res.json({ ok: true });
});

router.get('/:id/sets', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM logged_sets WHERE session_id = ?').all(req.params.id));
});

router.post('/:id/sets', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  const { exercise_id, set_num, reps_done, skipped = 0, weight_used } = req.body;

  const existing = db.prepare(
    'SELECT id FROM logged_sets WHERE session_id = ? AND exercise_id = ? AND set_num = ?'
  ).get(req.params.id, exercise_id, set_num);

  if (existing) {
    db.prepare(
      'UPDATE logged_sets SET reps_done = ?, skipped = ?, weight_used = ? WHERE id = ?'
    ).run(reps_done ?? null, skipped ? 1 : 0, weight_used ?? null, existing.id);
    return res.json({ id: existing.id });
  }

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO logged_sets (session_id, exercise_id, set_num, reps_done, skipped, weight_used) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, exercise_id, set_num, reps_done ?? null, skipped ? 1 : 0, weight_used ?? null);
  res.status(201).json({ id: lastInsertRowid });
});

router.delete('/:id/checkins/:muscleGroup', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM session_checkins WHERE session_id = ? AND muscle_group = ?')
    .run(req.params.id, req.params.muscleGroup);
  db.prepare('UPDATE sessions SET checked_in = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/:id/checkins', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare('SELECT muscle_group FROM session_checkins WHERE session_id = ?').all(req.params.id);
  res.json(rows.map(r => r.muscle_group));
});

router.post('/:id/checkin', (req, res) => {
  const { pain, recovery, pump, muscle_group } = req.body;
  const sessionId = req.params.id;

  const session = db.prepare('SELECT plan_id FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  const planId = session.plan_id ?? null;

  db.prepare(`
    INSERT OR REPLACE INTO session_checkins (session_id, muscle_group, pain, recovery, pump)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, muscle_group, pain, recovery, pump);

  const modifier = computeCheckinModifier({ pain, recovery, pump });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const loggedSets = db.prepare(`
    SELECT ls.*, e.equipment FROM logged_sets ls
    JOIN exercises e ON e.id = ls.exercise_id
    WHERE ls.session_id = ? AND e.muscle_group = ?
  `).all(sessionId, muscle_group);

  const writeTarget = db.prepare(
    'INSERT INTO set_targets (exercise_id, set_num, weight, reps, valid_from, plan_id) VALUES (?, ?, ?, ?, ?, ?)'
  );

  db.transaction(() => {
    for (const ls of loggedSets) {
      const current = db.prepare(`
        SELECT st.*, e.default_increment as increment, e.equipment
        FROM set_targets st JOIN exercises e ON e.id = st.exercise_id
        WHERE st.exercise_id = ? AND st.set_num = ?
          AND st.valid_from <= date('now') AND st.plan_id IS ?
        ORDER BY st.valid_from DESC LIMIT 1
      `).get(ls.exercise_id, ls.set_num, planId);

      if (!current) continue;
      const { weight, reps } = nextSetTarget(current, ls, modifier);
      writeTarget.run(ls.exercise_id, ls.set_num, weight, reps, tomorrowStr, planId);
    }
  })();

  // Bodyweight: if any set logged > 50 reps, add a set to the schedule (max 6)
  const bwOver50 = [...new Set(
    loggedSets
      .filter(ls => ls.equipment === 'bodyweight' && !ls.skipped && ls.reps_done > 50)
      .map(ls => ls.exercise_id)
  )];
  if (bwOver50.length > 0) {
    const getCount   = db.prepare('SELECT MAX(set_count) as n FROM schedule WHERE exercise_id = ? AND plan_id IS ?');
    const bumpCount  = db.prepare('UPDATE schedule SET set_count = set_count + 1 WHERE exercise_id = ? AND plan_id IS ? AND set_count < 6');
    const getTarget  = db.prepare('SELECT weight, reps FROM set_targets WHERE exercise_id = ? AND set_num = ? AND plan_id IS ? AND valid_from <= date(\'now\') ORDER BY valid_from DESC LIMIT 1');
    const insTarget  = db.prepare('INSERT INTO set_targets (exercise_id, set_num, weight, reps, valid_from, plan_id) VALUES (?, ?, ?, ?, ?, ?)');
    db.transaction(() => {
      for (const exId of bwOver50) {
        const cur = getCount.get(exId, planId)?.n ?? 0;
        if (cur >= 6) continue;
        bumpCount.run(exId, planId);
        const tmpl = getTarget.get(exId, cur, planId);
        insTarget.run(exId, cur + 1, tmpl?.weight ?? 0, tmpl?.reps ?? 10, tomorrowStr, planId);
      }
    })();
  }

  const allGroups = db.prepare(`
    SELECT DISTINCT e.muscle_group FROM logged_sets ls
    JOIN exercises e ON e.id = ls.exercise_id
    WHERE ls.session_id = ?
  `).all(sessionId).map(r => r.muscle_group);

  const checkedGroups = db.prepare(
    'SELECT muscle_group FROM session_checkins WHERE session_id = ?'
  ).all(sessionId).map(r => r.muscle_group);

  if (allGroups.length > 0 && allGroups.every(g => checkedGroups.includes(g))) {
    db.prepare('UPDATE sessions SET checked_in = 1 WHERE id = ?').run(sessionId);
  }

  res.json({ ok: true, modifier });
});

router.get('/history', (req, res) => {
  const { exercise_id } = req.query;
  if (exercise_id) {
    const rows = db.prepare(`
      SELECT s.date,
             SUM(ls.weight_used * ls.reps_done) as volume,
             MAX(ls.weight_used)                as max_weight,
             COUNT(*)                           as sets_logged
      FROM logged_sets ls
      JOIN sessions s ON s.id = ls.session_id
      WHERE ls.exercise_id = ? AND s.user_id = ?
        AND ls.skipped = 0 AND ls.weight_used IS NOT NULL AND ls.reps_done IS NOT NULL
      GROUP BY s.date
      ORDER BY s.date ASC
    `).all(exercise_id, req.user.id);
    return res.json(rows);
  }

  const rows = db.prepare(`
    SELECT e.id as exercise_id, e.name, e.muscle_group
    FROM exercises e
    WHERE e.id IN (
      SELECT DISTINCT ls.exercise_id FROM logged_sets ls
      JOIN sessions s ON s.id = ls.session_id
      WHERE s.user_id = ?
    )
    ORDER BY e.muscle_group, e.name
  `).all(req.user.id);
  res.json(rows);
});

export default router;
