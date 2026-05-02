import { Router } from 'express';
import db from '../db.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPlanDays(planId) {
  return db.prepare('SELECT day_of_week FROM plan_days WHERE plan_id = ? ORDER BY day_of_week')
    .all(planId).map(r => r.day_of_week);
}

function getPlanSlots(planId) {
  return db.prepare(`
    SELECT s.id, s.day_of_week, s.set_count, s.position,
           e.id as exercise_id, e.name, e.muscle_group, e.equipment,
           (SELECT st.weight FROM set_targets st
            WHERE st.exercise_id = e.id AND st.set_num = 1 AND st.valid_from <= date('now')
              AND st.plan_id IS s.plan_id
            ORDER BY st.valid_from DESC LIMIT 1) as weight
    FROM schedule s JOIN exercises e ON e.id = s.exercise_id
    WHERE s.plan_id = ?
    ORDER BY s.day_of_week, s.position
  `).all(planId);
}

function ownPlan(planId, userId) {
  return db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(planId, userId);
}

// ── Plans CRUD ────────────────────────────────────────────────────────────────

router.get('/active', (req, res) => {
  const plan = db.prepare('SELECT * FROM workout_plans WHERE is_active = 1 AND user_id = ?').get(req.user.id);
  if (!plan) return res.json(null);
  res.json({ ...plan, days: getPlanDays(plan.id) });
});

router.get('/', (req, res) => {
  const plans = db.prepare('SELECT * FROM workout_plans WHERE user_id = ? ORDER BY is_active DESC, created_at DESC').all(req.user.id);

  const getCompletedDays = db.prepare(`
    SELECT COUNT(*) as n FROM sessions s
    WHERE s.plan_id = ? AND s.user_id = ? AND s.week_num <= ?
      AND (
        s.checked_in = 1
        OR (
          (SELECT COALESCE(SUM(sc.set_count), 0) FROM schedule sc
           WHERE sc.plan_id = s.plan_id AND sc.day_of_week = s.session_dow) > 0
          AND
          (SELECT COUNT(*) FROM logged_sets ls
           WHERE ls.session_id = s.id AND (ls.skipped = 1 OR ls.reps_done IS NOT NULL))
          >=
          (SELECT COALESCE(SUM(sc.set_count), 0) FROM schedule sc
           WHERE sc.plan_id = s.plan_id AND sc.day_of_week = s.session_dow)
        )
      )
  `);

  res.json(plans.map(p => {
    const days      = getPlanDays(p.id);
    const weekCount = p.week_count ?? 4;
    return {
      ...p,
      days,
      exercise_count:  db.prepare('SELECT COUNT(*) as n FROM schedule WHERE plan_id = ?').get(p.id).n,
      completed_days:  getCompletedDays.get(p.id, req.user.id, weekCount).n,
      total_days:      days.length * weekCount,
    };
  }));
});

router.post('/', (req, res) => {
  const { name, days = [] } = req.body;
  const { lastInsertRowid: planId } = db.prepare(
    'INSERT INTO workout_plans (name, user_id) VALUES (?, ?)'
  ).run(name, req.user.id);
  const ins = db.prepare('INSERT INTO plan_days (plan_id, day_of_week) VALUES (?, ?)');
  db.transaction(() => { for (const d of days) ins.run(planId, d); })();
  res.status(201).json({ id: planId });
});

router.get('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Not found' });
  res.json({ ...plan, days: getPlanDays(plan.id), slots: getPlanSlots(plan.id) });
});

router.patch('/:id', (req, res) => {
  if (!ownPlan(req.params.id, req.user.id)) return res.status(404).json({ error: 'Not found' });
  const { name, week_count } = req.body;
  const fields = [], vals = [];
  if (name       !== undefined) { fields.push('name = ?');       vals.push(name); }
  if (week_count !== undefined) { fields.push('week_count = ?'); vals.push(week_count); }
  if (fields.length) { vals.push(req.params.id); db.prepare(`UPDATE workout_plans SET ${fields.join(', ')} WHERE id = ?`).run(...vals); }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const plan = db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Not found' });
  db.transaction(() => {
    db.prepare('DELETE FROM set_targets WHERE plan_id = ?').run(req.params.id);
    db.prepare('UPDATE sessions SET plan_id = NULL WHERE plan_id = ?').run(req.params.id);
    db.prepare('DELETE FROM workout_plans WHERE id = ?').run(req.params.id);
  })();
  res.json({ ok: true });
});

router.post('/:id/activate', (req, res) => {
  if (!ownPlan(req.params.id, req.user.id)) return res.status(404).json({ error: 'Not found' });
  db.transaction(() => {
    db.prepare('UPDATE workout_plans SET is_active = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare(`UPDATE workout_plans SET is_active = 1,
      started_at = COALESCE(started_at, date('now')) WHERE id = ?`).run(req.params.id);
  })();
  res.json({ ok: true });
});

router.post('/:id/clone', (req, res) => {
  const src = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });

  const { seed_week } = req.body ?? {};

  const { lastInsertRowid: newId } = db.prepare(
    'INSERT INTO workout_plans (name, user_id) VALUES (?, ?)'
  ).run(`${src.name} (copy)`, req.user.id);

  const srcDays  = db.prepare('SELECT day_of_week FROM plan_days WHERE plan_id = ?').all(src.id);
  const srcSlots = db.prepare('SELECT * FROM schedule WHERE plan_id = ?').all(src.id);

  db.transaction(() => {
    const insDay  = db.prepare('INSERT INTO plan_days (plan_id, day_of_week) VALUES (?, ?)');
    const insSlot = db.prepare('INSERT INTO schedule (plan_id, day_of_week, exercise_id, set_count, position) VALUES (?, ?, ?, ?, ?)');
    for (const { day_of_week } of srcDays) insDay.run(newId, day_of_week);
    for (const s of srcSlots) insSlot.run(newId, s.day_of_week, s.exercise_id, s.set_count, s.position);

    const insTarget = db.prepare(
      "INSERT INTO set_targets (exercise_id, set_num, weight, reps, valid_from, plan_id) VALUES (?, ?, ?, ?, date('now'), ?)"
    );

    if (seed_week) {
      const getLogged = db.prepare(`
        SELECT ls.weight_used, ls.reps_done
        FROM logged_sets ls
        JOIN sessions s ON s.id = ls.session_id
        WHERE ls.exercise_id = ? AND ls.set_num = ?
          AND ls.skipped = 0 AND ls.reps_done IS NOT NULL
          AND s.plan_id = ? AND s.week_num = ?
        ORDER BY ls.id DESC
        LIMIT 1
      `);
      const getTarget = db.prepare(`
        SELECT weight, reps FROM set_targets
        WHERE exercise_id = ? AND set_num = ? AND plan_id IS ?
        ORDER BY valid_from DESC LIMIT 1
      `);
      for (const slot of srcSlots) {
        for (let setNum = 1; setNum <= slot.set_count; setNum++) {
          const logged = getLogged.get(slot.exercise_id, setNum, src.id, seed_week);
          if (logged) {
            insTarget.run(slot.exercise_id, setNum, logged.weight_used, logged.reps_done, newId);
          } else {
            const target = getTarget.get(slot.exercise_id, setNum, src.id);
            if (target) insTarget.run(slot.exercise_id, setNum, target.weight, target.reps, newId);
          }
        }
      }
    } else {
      const getCurrentTarget = db.prepare(`
        SELECT weight, reps FROM set_targets
        WHERE exercise_id = ? AND set_num = ? AND plan_id IS ? AND valid_from <= date('now')
        ORDER BY valid_from DESC LIMIT 1
      `);
      for (const slot of srcSlots) {
        for (let setNum = 1; setNum <= slot.set_count; setNum++) {
          const target = getCurrentTarget.get(slot.exercise_id, setNum, src.id);
          if (target) insTarget.run(slot.exercise_id, setNum, target.weight, target.reps, newId);
        }
      }
    }
  })();

  res.status(201).json({ id: newId });
});

// ── Plan days ─────────────────────────────────────────────────────────────────

router.patch('/:id/days', (req, res) => {
  if (!ownPlan(req.params.id, req.user.id)) return res.status(404).json({ error: 'Not found' });
  const { days } = req.body;
  db.transaction(() => {
    db.prepare('DELETE FROM plan_days WHERE plan_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO plan_days (plan_id, day_of_week) VALUES (?, ?)');
    for (const d of days) ins.run(req.params.id, d);
  })();
  res.json({ ok: true });
});

// ── Plan schedule ─────────────────────────────────────────────────────────────

router.post('/:id/schedule', (req, res) => {
  if (!ownPlan(req.params.id, req.user.id)) return res.status(404).json({ error: 'Not found' });
  const { day_of_week, exercise_id, set_count = 3, position = 0 } = req.body;
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO schedule (plan_id, day_of_week, exercise_id, set_count, position) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, day_of_week, exercise_id, set_count, position);
  res.status(201).json({ id: lastInsertRowid });
});

router.patch('/:id/schedule/:slotId', (req, res) => {
  if (!ownPlan(req.params.id, req.user.id)) return res.status(404).json({ error: 'Not found' });
  const { set_count, position, day_of_week } = req.body;
  const fields = [], vals = [];
  if (set_count   !== undefined) { fields.push('set_count = ?');   vals.push(set_count); }
  if (position    !== undefined) { fields.push('position = ?');    vals.push(position); }
  if (day_of_week !== undefined) { fields.push('day_of_week = ?'); vals.push(day_of_week); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.slotId, req.params.id);
  db.prepare(`UPDATE schedule SET ${fields.join(', ')} WHERE id = ? AND plan_id = ?`).run(...vals);
  res.json({ ok: true });
});

router.delete('/:id/schedule/:slotId', (req, res) => {
  if (!ownPlan(req.params.id, req.user.id)) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM schedule WHERE id = ? AND plan_id = ?').run(req.params.slotId, req.params.id);
  res.json({ ok: true });
});

// ── Calendar ──────────────────────────────────────────────────────────────────
// Position-based: sessions are identified by (plan_id, week_num, session_dow).
// Dates only appear on cells where a session has already been opened.

router.get('/:id/calendar', (req, res) => {
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!plan) return res.status(404).json({ error: 'Not found' });

  const workoutDays = getPlanDays(plan.id);
  if (workoutDays.length === 0) return res.json({ weeks: [] });

  const weekCount = plan.week_count ?? 4;
  const userId    = req.user.id;
  const planId    = plan.id;

  const getSlotSession = db.prepare(`
    SELECT s.id, s.checked_in, s.unlocked, s.date,
           COUNT(DISTINCT ls.exercise_id) as exercise_count,
           COUNT(DISTINCT CASE WHEN ls.skipped = 0 AND ls.reps_done IS NOT NULL AND ls.weight_used IS NOT NULL
             THEN ls.exercise_id END) as logged_count,
           (SELECT COALESCE(SUM(sc.set_count), 0) FROM schedule sc
            WHERE sc.plan_id = s.plan_id AND sc.day_of_week = s.session_dow) as expected_sets,
           (SELECT COUNT(*) FROM logged_sets ls2
            WHERE ls2.session_id = s.id AND (ls2.skipped = 1 OR ls2.reps_done IS NOT NULL)) as done_sets
    FROM sessions s
    LEFT JOIN logged_sets ls ON ls.session_id = s.id
    WHERE s.plan_id = ? AND s.week_num = ? AND s.session_dow = ? AND s.user_id = ?
    GROUP BY s.id
  `);

  // A session is only "done" when explicitly checked in. Mirrors the predicate
  // in routes/sessions.js — both must stay identical or the current-slot
  // calculation diverges (per CLAUDE.md).
  const slotDone = s => s && !s.unlocked && s.checked_in === 1;

  const getWeekDates = db.prepare(`
    SELECT MIN(date) as start_date, MAX(date) as end_date
    FROM sessions
    WHERE plan_id = ? AND week_num = ? AND user_id = ? AND date IS NOT NULL
  `);

  // Pre-compute scheduled exercise count per workout day (same across all weeks)
  const getScheduledCount = db.prepare(
    'SELECT COUNT(DISTINCT exercise_id) as n FROM schedule WHERE plan_id = ? AND day_of_week = ?'
  );
  const scheduledCounts = {};
  for (const d of workoutDays) scheduledCounts[d] = getScheduledCount.get(planId, d)?.n ?? 0;

  // Find current slot: first (week_num, session_dow) not yet workout-complete
  const dayLen = workoutDays.length;
  let currentWeek = null, currentDow = null;
  outer: for (let w = 1; w <= weekCount; w++) {
    for (const d of workoutDays) {
      const s = getSlotSession.get(planId, w, d, userId);
      if (!slotDone(s)) { currentWeek = w; currentDow = d; break outer; }
    }
  }
  const curIdx = currentWeek != null
    ? (currentWeek - 1) * dayLen + workoutDays.indexOf(currentDow)
    : Infinity;

  const today = new Date().toISOString().split('T')[0];
  const weeks = [];
  for (let w = 1; w <= weekCount; w++) {
    const days = [];
    for (const d of workoutDays) {
      const s      = getSlotSession.get(planId, w, d, userId);
      const reqIdx = (w - 1) * dayLen + workoutDays.indexOf(d);
      const isCurrent = currentWeek === w && currentDow === d;
      // Blank current slot has no stamped date yet — show today so the picker
      // doesn't render an empty cell. Past blank slots stay null (they were
      // never started). Locked-in dates pass through as-is.
      const displayDate = s?.date ?? (isCurrent ? today : null);
      days.push({
        day_of_week:     d,
        date:            displayDate,
        is_current:      isCurrent,
        is_locked:       reqIdx > curIdx,
        scheduled_count: scheduledCounts[d],
        session:         s ? { id: s.id, checked_in: s.checked_in, exercise_count: s.exercise_count, logged_count: s.logged_count } : null,
      });
    }
    const dates = getWeekDates.get(planId, w, userId);
    weeks.push({ week_num: w, start_date: dates?.start_date ?? null, end_date: dates?.end_date ?? null, days });
  }

  res.json({ weeks });
});

export default router;
