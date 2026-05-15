import { Router } from 'express';
import db from '../db.js';
import { nextExerciseTargets } from '../../shared/algorithm.js';
import { slotDone } from '../../shared/slotDone.js';

const router = Router();

const todayStr = () => new Date().toISOString().split('T')[0];

const addDay = dateStr => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
};

// ── Double-progression recompute ──────────────────────────────────────────────
// Re-derives one exercise's next-session targets from how the user actually
// performed this session. Runs whenever the exercise's logged sets change.
//   - Exercise complete (every scheduled set logged or skipped) → write the
//     next-session per-set targets at valid_from = session.date + 1.
//   - Not complete → remove any targets a prior completion produced.
// Pure performance-based: no check-ins, no subjective modifiers.
function recomputeExercise(session, exerciseId) {
  const planId = session.plan_id ?? null;
  const sched = db.prepare(`
    SELECT s.set_count, e.equipment, e.default_increment, e.rep_min, e.rep_max
    FROM schedule s JOIN exercises e ON e.id = s.exercise_id
    WHERE s.plan_id IS ? AND s.day_of_week = ? AND s.exercise_id = ?
  `).get(planId, session.session_dow, exerciseId);
  if (!sched) return;

  const sessionDateStr = session.date ?? todayStr();
  const nextDayStr = addDay(sessionDateStr);

  const logged = db.prepare(
    'SELECT set_num, weight_used, reps_done, skipped FROM logged_sets WHERE session_id = ? AND exercise_id = ?'
  ).all(session.id, exerciseId);
  const loggedBySet = new Map(logged.map(l => [l.set_num, l]));

  // Drop this exercise's previously-written next targets; rewrite below only
  // if the exercise is (still) complete. Keeps re-logging idempotent.
  db.prepare(
    'DELETE FROM set_targets WHERE exercise_id = ? AND plan_id IS ? AND valid_from = ? AND is_suggestion = 0'
  ).run(exerciseId, planId, nextDayStr);

  let complete = true;
  for (let i = 1; i <= sched.set_count; i++) {
    const l = loggedBySet.get(i);
    if (!l || (!l.skipped && l.reps_done == null)) { complete = false; break; }
  }
  if (!complete) return;

  // Expected target = most recent target valid as of the session date
  // (algorithm rows preferred over the initial suggestion).
  const getExpected = db.prepare(`
    SELECT weight, reps FROM set_targets
    WHERE exercise_id = ? AND set_num = ? AND plan_id IS ? AND valid_from <= ?
    ORDER BY is_suggestion ASC, valid_from DESC LIMIT 1
  `);
  const setData = [];
  for (let i = 1; i <= sched.set_count; i++) {
    const exp = getExpected.get(exerciseId, i, planId, sessionDateStr);
    setData.push({
      set_num: i,
      target:  exp ?? { weight: null, reps: sched.rep_min },
      logged:  loggedBySet.get(i),
    });
  }

  const nextTargets = nextExerciseTargets(setData, {
    repMin: sched.rep_min, repMax: sched.rep_max,
    increment: sched.default_increment ?? 2.5, equipment: sched.equipment,
  });

  const writeTarget = db.prepare(
    'INSERT INTO set_targets (exercise_id, set_num, weight, reps, valid_from, plan_id, is_suggestion) VALUES (?, ?, ?, ?, ?, ?, 0)'
  );
  for (const t of nextTargets) {
    writeTarget.run(exerciseId, t.set_num, t.weight ?? 0, t.reps, nextDayStr, planId);
  }

  // Bodyweight double progression: when every set reached the rep ceiling,
  // add a set (cap 6) — the weight axis is unavailable, so volume grows by sets.
  if (sched.equipment === 'bodyweight' && sched.set_count < 6) {
    const allAtCeiling = setData.every(s =>
      s.logged && !s.logged.skipped && s.logged.reps_done != null && s.logged.reps_done >= sched.rep_max
    );
    if (allAtCeiling) {
      db.prepare('UPDATE schedule SET set_count = set_count + 1 WHERE plan_id IS ? AND day_of_week = ? AND exercise_id = ?')
        .run(planId, session.session_dow, exerciseId);
      writeTarget.run(exerciseId, sched.set_count + 1, 0, sched.rep_min, nextDayStr, planId);
    }
  }
}

// Mark the session complete when the whole day's schedule is logged/skipped.
function updateCompletion(session) {
  const planId = session.plan_id ?? null;
  const expected = db.prepare(
    'SELECT COALESCE(SUM(set_count), 0) AS n FROM schedule WHERE plan_id IS ? AND day_of_week = ?'
  ).get(planId, session.session_dow).n;
  const done = db.prepare(
    'SELECT COUNT(*) AS n FROM logged_sets WHERE session_id = ? AND (skipped = 1 OR reps_done IS NOT NULL)'
  ).get(session.id).n;
  if (expected > 0 && done >= expected)
    db.prepare('UPDATE sessions SET checked_in = 1, unlocked = 0 WHERE id = ?').run(session.id);
  else
    db.prepare('UPDATE sessions SET checked_in = 0 WHERE id = ?').run(session.id);
}

// ── Slot endpoint — position-based session access ─────────────────────────────
// Returns { session, is_current, is_locked } for (plan_id, week_num, session_dow).
// Creates the session (with today's date) only when accessing the current slot.

router.get('/slot', (req, res) => {
  const { plan_id, week, dow } = req.query;
  if (!plan_id || week == null || dow == null)
    return res.status(400).json({ error: 'Missing params' });

  const planId     = parseInt(plan_id, 10);
  const weekNum    = parseInt(week,    10);
  const sessionDow = parseInt(dow,     10);
  const userId     = req.user.id;

  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(planId, userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const planDays = db.prepare(
    'SELECT day_of_week FROM plan_days WHERE plan_id = ? ORDER BY day_of_week'
  ).all(planId).map(r => r.day_of_week);

  if (!planDays.includes(sessionDow))
    return res.status(400).json({ error: 'Day not in plan' });

  const getSlotSession = db.prepare(`
    SELECT s.*,
      (SELECT COALESCE(SUM(sc.set_count), 0) FROM schedule sc
       WHERE sc.plan_id = s.plan_id AND sc.day_of_week = s.session_dow) as expected_sets,
      (SELECT COUNT(*) FROM logged_sets ls
       WHERE ls.session_id = s.id AND (ls.skipped = 1 OR ls.reps_done IS NOT NULL)) as done_sets
    FROM sessions s
    WHERE s.plan_id = ? AND s.week_num = ? AND s.session_dow = ? AND s.user_id = ?
  `);

  // Find current slot: first (week, dow) in sequence not yet workout-complete
  const maxScan   = Math.max(plan.week_count ?? 4, weekNum) + 1;
  let currentWeek = null, currentDow = null;
  outer: for (let w = 1; w <= maxScan; w++) {
    for (const d of planDays) {
      const s = getSlotSession.get(planId, w, d, userId);
      if (!slotDone(s)) { currentWeek = w; currentDow = d; break outer; }
    }
  }

  // Determine slot position relative to current
  const dayLen   = planDays.length;
  const reqIdx   = (weekNum - 1) * dayLen + planDays.indexOf(sessionDow);
  const curIdx   = currentWeek != null ? (currentWeek - 1) * dayLen + planDays.indexOf(currentDow) : Infinity;
  const isCurrent = currentWeek === weekNum && currentDow === sessionDow;
  const isLocked  = reqIdx > curIdx;

  let session = getSlotSession.get(planId, weekNum, sessionDow, userId);

  if (!session && !isLocked) {
    // Create with date = NULL. The session's date is stamped only when the
    // first live set is logged (POST /sets), and cleared again if the session
    // becomes blank (DELETE /sets last live row). Once finalized (checked_in
    // or unlocked), the date is locked permanently.
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO sessions (date, week_num, session_dow, plan_id, user_id) VALUES (NULL, ?, ?, ?, ?)'
    ).run(weekNum, sessionDow, planId, userId);
    session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(lastInsertRowid);
  }

  res.json({ session: session ?? null, is_current: isCurrent, is_locked: isLocked });
});

router.post('/:id/unlock', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  const expectedSets = db.prepare('SELECT COALESCE(SUM(set_count),0) as n FROM schedule WHERE plan_id IS ? AND day_of_week = ?').get(session.plan_id ?? null, session.session_dow)?.n ?? 0;
  const doneSets     = db.prepare('SELECT COUNT(*) as n FROM logged_sets WHERE session_id = ? AND (skipped = 1 OR reps_done IS NOT NULL)').get(session.id)?.n ?? 0;
  const isDone = session.checked_in === 1 || (expectedSets > 0 && doneSets >= expectedSets);
  if (!isDone) return res.status(400).json({ error: 'Session is not completed' });

  db.transaction(() => {
    db.prepare('DELETE FROM session_checkins WHERE session_id = ?').run(session.id);
    if (session.date) {
      const nextDay = new Date(session.date + 'T00:00:00Z');
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      db.prepare('DELETE FROM set_targets WHERE valid_from = ? AND plan_id IS ?')
        .run(nextDayStr, session.plan_id ?? null);
    }
    db.prepare('UPDATE sessions SET checked_in = 0, unlocked = 1 WHERE id = ?').run(session.id);
  })();

  res.json({ ok: true });
});

router.post('/:id/skip', (req, res) => {
  const sessionId = req.params.id;
  const session   = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  const dow    = session.session_dow ?? (() => {
    const d = new Date(session.date + 'T00:00:00');
    return (d.getDay() + 6) % 7;
  })();
  const planId = session.plan_id;

  db.transaction(() => {
    if (planId) {
      const slots = db.prepare(`
        SELECT s.set_count, e.id as exercise_id
        FROM schedule s JOIN exercises e ON e.id = s.exercise_id
        WHERE s.day_of_week = ? AND s.plan_id = ?
      `).all(dow, planId);
      const ins = db.prepare(`
        INSERT OR IGNORE INTO logged_sets (session_id, exercise_id, set_num, reps_done, skipped, weight_used)
        VALUES (?, ?, ?, NULL, 1, NULL)
      `);
      for (const slot of slots)
        for (let i = 1; i <= slot.set_count; i++)
          ins.run(sessionId, slot.exercise_id, i);
    }
    // Stamp today's date if the session is blank (first activity = the skip
    // itself). Don't overwrite an existing date — if the user already logged
    // something earlier in the session, that earlier date stands.
    db.prepare(`UPDATE sessions SET date = date('now') WHERE id = ? AND date IS NULL`).run(sessionId);
    db.prepare('UPDATE sessions SET checked_in = 1, unlocked = 0 WHERE id = ?').run(sessionId);
  })();

  res.json({ ok: true });
});

router.get('/:id/sets', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM logged_sets WHERE session_id = ?').all(req.params.id));
});

router.post('/:id/sets', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  const { exercise_id, set_num, reps_done, skipped = 0, weight_used } = req.body;

  const rowId = db.transaction(() => {
    const existing = db.prepare(
      'SELECT id FROM logged_sets WHERE session_id = ? AND exercise_id = ? AND set_num = ?'
    ).get(session.id, exercise_id, set_num);

    let id;
    if (existing) {
      db.prepare('UPDATE logged_sets SET reps_done = ?, skipped = ?, weight_used = ? WHERE id = ?')
        .run(reps_done ?? null, skipped ? 1 : 0, weight_used ?? null, existing.id);
      id = existing.id;
    } else {
      id = db.prepare(
        'INSERT INTO logged_sets (session_id, exercise_id, set_num, reps_done, skipped, weight_used) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(session.id, exercise_id, set_num, reps_done ?? null, skipped ? 1 : 0, weight_used ?? null).lastInsertRowid;
    }

    // Stamp the session date on the first live log (blank, never-finalized
    // sessions only); the DELETE handler clears it back to NULL if emptied.
    if (session.date == null) {
      db.prepare(`UPDATE sessions SET date = date('now')
        WHERE id = ? AND date IS NULL AND checked_in = 0 AND unlocked = 0`).run(session.id);
      session.date = db.prepare('SELECT date FROM sessions WHERE id = ?').get(session.id).date;
    }

    // Re-derive the exercise's next-session targets and the session's
    // completion flag from the new performance data.
    recomputeExercise(session, exercise_id);
    updateCompletion(session);
    return id;
  })();

  res.status(201).json({ id: rowId });
});

router.delete('/:id/sets/:exerciseId/:setNum', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  const exerciseId = parseInt(req.params.exerciseId, 10);

  db.transaction(() => {
    db.prepare('DELETE FROM logged_sets WHERE session_id = ? AND exercise_id = ? AND set_num = ?')
      .run(session.id, exerciseId, req.params.setNum);

    // If the session is blank again (and never finalized), clear its date.
    const liveCount = db.prepare(
      'SELECT COUNT(*) as n FROM logged_sets WHERE session_id = ? AND (skipped = 1 OR reps_done IS NOT NULL)'
    ).get(session.id).n;
    if (liveCount === 0) {
      db.prepare(`UPDATE sessions SET date = NULL WHERE id = ? AND checked_in = 0 AND unlocked = 0`).run(session.id);
      const r = db.prepare('SELECT date FROM sessions WHERE id = ?').get(session.id);
      session.date = r.date;
    }

    recomputeExercise(session, exerciseId);
    updateCompletion(session);
  })();

  res.json({ ok: true });
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
