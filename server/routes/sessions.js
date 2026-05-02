import { Router } from 'express';
import db from '../db.js';
import { nextExerciseTargets, computeCheckinModifier } from '../../shared/algorithm.js';

const router = Router();

const todayStr = () => new Date().toISOString().split('T')[0];

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

  // A session is only "done" when explicitly checked in. The previous
  // "done_sets >= expected_sets" fallback let Finish-Workout auto-skip
  // the entire session past the check-in modal — no algorithm run, no
  // set_targets update.
  const slotDone = s => s && !s.unlocked && s.checked_in === 1;

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

  // Date stamping rules:
  //   - Blank session (no live logs): date is NULL, displayed as "today".
  //   - First live log lands → stamp date = today. Locked while in-progress.
  //   - All sets unlogged again → DELETE handler clears date back to NULL.
  //   - Once finalized (checked_in=1 or unlocked=1), date is locked forever.
  // The WHERE clause ensures we only stamp blank, never-finalized sessions —
  // even if a later "first live log" event fires for some other reason.
  const liveCount = db.prepare(
    'SELECT COUNT(*) as n FROM logged_sets WHERE session_id = ? AND (skipped = 1 OR reps_done IS NOT NULL)'
  ).get(req.params.id).n;
  if (liveCount === 1) {
    db.prepare(`
      UPDATE sessions SET date = date('now')
      WHERE id = ? AND date IS NULL AND checked_in = 0 AND unlocked = 0
    `).run(req.params.id);
  }

  res.status(201).json({ id: lastInsertRowid });
});

router.delete('/:id/sets/:exerciseId/:setNum', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  db.prepare(
    'DELETE FROM logged_sets WHERE session_id = ? AND exercise_id = ? AND set_num = ?'
  ).run(req.params.id, req.params.exerciseId, req.params.setNum);

  // If the session is now blank again (and never finalized), unlock its date
  // so future visits show today's date until a new first-log re-stamps it.
  const liveCount = db.prepare(
    'SELECT COUNT(*) as n FROM logged_sets WHERE session_id = ? AND (skipped = 1 OR reps_done IS NOT NULL)'
  ).get(req.params.id).n;
  if (liveCount === 0) {
    db.prepare(`
      UPDATE sessions SET date = NULL
      WHERE id = ? AND checked_in = 0 AND unlocked = 0
    `).run(req.params.id);
  }

  res.json({ ok: true });
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
  const { pain, recovery, pump, intensity, pause_weight, muscle_group } = req.body;
  const sessionId = req.params.id;

  const session = db.prepare('SELECT plan_id, date FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  const planId = session.plan_id ?? null;

  db.prepare(`
    INSERT OR REPLACE INTO session_checkins (session_id, muscle_group, pain, recovery, pump, intensity, pause_weight)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, muscle_group, pain, recovery, pump, intensity ?? null, pause_weight ? 1 : 0);

  const modifier = computeCheckinModifier({ pain, recovery, pump, intensity });

  const mgSettings   = db.prepare(
    'SELECT rep_range, aggressiveness FROM muscle_group_settings WHERE user_id = ? AND muscle_group = ?'
  ).get(req.user.id, muscle_group) ?? {};
  const repRange       = mgSettings.rep_range      ?? 'standard';
  const aggressiveness = mgSettings.aggressiveness ?? 'moderate';

  // Anchor next-day target validity on the session's actual workout date,
  // not "tomorrow from now". This keeps check-in writes and unlock cleanup
  // consistent (unlock deletes WHERE valid_from = session.date + 1 day),
  // and is correct even if check-in happens days after the workout.
  const sessionDateStr = session.date ?? todayStr();
  const tomorrow = new Date(sessionDateStr + 'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const loggedSets = db.prepare(`
    SELECT ls.*, e.equipment FROM logged_sets ls
    JOIN exercises e ON e.id = ls.exercise_id
    WHERE ls.session_id = ? AND e.muscle_group = ?
  `).all(sessionId, muscle_group);

  const getTarget = db.prepare(`
    SELECT st.*, e.default_increment as increment, e.equipment
    FROM set_targets st JOIN exercises e ON e.id = st.exercise_id
    WHERE st.exercise_id = ? AND st.set_num = ?
      AND st.valid_from <= date('now') AND st.plan_id IS ?
    ORDER BY st.valid_from DESC LIMIT 1
  `);

  const writeTarget = db.prepare(
    'INSERT INTO set_targets (exercise_id, set_num, weight, reps, valid_from, plan_id) VALUES (?, ?, ?, ?, ?, ?)'
  );

  // Group logged sets by exercise so the algorithm sees the full cluster at once
  const byExercise = new Map();
  for (const ls of loggedSets) {
    if (!byExercise.has(ls.exercise_id)) byExercise.set(ls.exercise_id, []);
    byExercise.get(ls.exercise_id).push(ls);
  }

  db.transaction(() => {
    for (const [exerciseId, sets] of byExercise) {
      const setData = sets
        .map(ls => ({ set_num: ls.set_num, target: getTarget.get(exerciseId, ls.set_num, planId), logged: ls }))
        .filter(s => s.target != null);
      if (!setData.length) continue;

      const newTargets = nextExerciseTargets(setData, modifier, {
        pauseWeight: !!pause_weight, pain, repRange, aggressiveness,
      });

      for (const { set_num, weight, reps } of newTargets) {
        writeTarget.run(exerciseId, set_num, weight, reps, tomorrowStr, planId);
      }
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

  // Only require a check-in row for groups that actually have a real (non-skipped)
  // logged set. Groups whose sets are all skipped don't need a check-in — there
  // was no exercise to give feedback on — so they shouldn't block the session
  // from being marked checked_in = 1.
  const allGroups = db.prepare(`
    SELECT DISTINCT e.muscle_group FROM logged_sets ls
    JOIN exercises e ON e.id = ls.exercise_id
    WHERE ls.session_id = ? AND ls.skipped = 0
  `).all(sessionId).map(r => r.muscle_group);

  const checkedGroups = db.prepare(
    'SELECT muscle_group FROM session_checkins WHERE session_id = ?'
  ).all(sessionId).map(r => r.muscle_group);

  if (allGroups.length > 0 && allGroups.every(g => checkedGroups.includes(g))) {
    db.prepare('UPDATE sessions SET checked_in = 1, unlocked = 0 WHERE id = ?').run(sessionId);
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
