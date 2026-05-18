import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT s.id, s.day_of_week, s.set_count, s.position,
           e.id as exercise_id, e.name, e.muscle_group, e.equipment,
           (SELECT st.weight FROM set_targets st
            WHERE st.exercise_id = e.id AND st.set_num = 1 AND st.valid_from <= date('now')
              AND st.plan_id IS s.plan_id
            ORDER BY st.is_suggestion ASC, st.valid_from DESC LIMIT 1) as weight
    FROM schedule s
    JOIN exercises e ON e.id = s.exercise_id
    JOIN workout_plans wp ON s.plan_id = wp.id
    WHERE wp.user_id = ?
    ORDER BY s.day_of_week, s.position
  `).all(req.user.id));
});

router.get('/today', (req, res) => {
  const dayOfWeek  = req.query.dow !== undefined
    ? parseInt(req.query.dow, 10)
    : (new Date().getDay() + 6) % 7;
  const weekNum    = req.query.week !== undefined ? parseInt(req.query.week, 10) : null;
  const activePlan = db.prepare('SELECT id FROM workout_plans WHERE is_active = 1 AND user_id = ?').get(req.user.id);
  if (!activePlan) return res.json([]);

  const slots = db.prepare(`
    SELECT s.id as schedule_id, s.set_count, s.position, s.plan_id,
           e.id as exercise_id, e.name, e.muscle_group, e.equipment,
           COALESCE(ues.default_increment, e.default_increment) AS default_increment,
           COALESCE(ues.rep_min, e.rep_min) AS rep_min,
           COALESCE(ues.rep_max, e.rep_max) AS rep_max,
           COALESCE(ues.pause_weight, 0)    AS pause_weight
    FROM schedule s JOIN exercises e ON e.id = s.exercise_id
    LEFT JOIN user_exercise_settings ues ON ues.exercise_id = e.id AND ues.user_id = ?
    WHERE s.day_of_week = ? AND s.plan_id = ?
      AND EXISTS (SELECT 1 FROM plan_days pd WHERE pd.plan_id = s.plan_id AND pd.day_of_week = s.day_of_week)
    ORDER BY s.position
  `).all(req.user.id, dayOfWeek, activePlan.id);

  // The session being viewed (when week is provided). Its date — when set —
  // serves as the cutoff for prev: only logs from sessions strictly before
  // this one count. Without a viewing session (or with a future, undated one),
  // any prior log qualifies.
  const viewingSess = weekNum != null
    ? db.prepare(
        'SELECT id, date FROM sessions WHERE plan_id = ? AND week_num = ? AND session_dow = ? AND user_id = ?'
      ).get(activePlan.id, weekNum, dayOfWeek, req.user.id)
    : null;
  const viewingDate = viewingSess?.date ?? null;
  const viewingId   = viewingSess?.id   ?? null;

  // Algorithm target for the viewed session: the most recent set_target valid
  // as of that session's date. Completing an exercise writes the NEXT
  // session's targets at valid_from = this session's date + 1 — independently
  // of whether the whole session is checked in. Bounding the lookup by the
  // session's own date keeps those later rows out, so the per-set
  // actual-vs-target glyph always compares against the target the user
  // actually trained. A blank/unvisited session has no date — viewingDate is
  // null, the bound is skipped, and the latest target (its freshly written
  // input) shows for the rep placeholders and the volume hint.
  const getCurrent = db.prepare(`
    SELECT weight, reps FROM set_targets
    WHERE exercise_id = ? AND set_num = ? AND plan_id IS ?
      AND (? IS NULL OR valid_from <= ?)
    ORDER BY is_suggestion ASC, valid_from DESC LIMIT 1
  `);
  // "Previous" is the user's most recently logged completion of this set,
  // from a session strictly before the one being viewed. Comparing the
  // algorithm's current target against this drives the volume-change hint.
  // The date guard prevents Day-2-just-finished views from being compared
  // to their own logged sets (which would be a self-comparison, not progress).
  const getPrev = db.prepare(`
    SELECT ls.weight_used as weight, ls.reps_done as reps
    FROM logged_sets ls
    JOIN sessions s ON s.id = ls.session_id
    WHERE ls.exercise_id = @ex AND ls.set_num = @set
      AND s.plan_id IS @plan AND s.user_id = @user
      AND s.checked_in = 1
      AND ls.skipped = 0
      AND ls.reps_done IS NOT NULL
      AND ls.weight_used IS NOT NULL
      AND (
        @date IS NULL
        OR s.date < @date
        OR (s.date = @date AND s.id < @id)
      )
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1
  `);

  const result = slots.map(slot => {
    const sets = Array.from({ length: slot.set_count }, (_, i) => {
      const setNum  = i + 1;
      const target  = getCurrent.get(slot.exercise_id, setNum, slot.plan_id, viewingDate, viewingDate);
      // Suppress prev when there's no real target — comparing the 20/8 default
      // against a stray logged set produces a misleading hint.
      const prev    = target
        ? getPrev.get({
            ex:   slot.exercise_id,
            set:  setNum,
            plan: slot.plan_id,
            user: req.user.id,
            date: viewingDate,
            id:   viewingId,
          })
        : null;
      return {
        set_num:     setNum,
        // New exercises have no target yet — start with an empty weight and
        // reps at the floor of the exercise's rep range.
        weight:      target?.weight ?? null,
        reps:        target?.reps   ?? slot.rep_min,
        prev_weight: prev?.weight   ?? null,
        prev_reps:   prev?.reps     ?? null,
      };
    });
    return { ...slot, sets };
  });

  res.json(result);
});

router.post('/', (req, res) => {
  const { day_of_week, exercise_id, set_count = 3, position = 0, plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'plan_id required' });
  if (!db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(plan_id, req.user.id))
    return res.status(404).json({ error: 'Plan not found' });
  const result = db.prepare(
    'INSERT INTO schedule (day_of_week, exercise_id, set_count, position, plan_id) VALUES (?, ?, ?, ?, ?)'
  ).run(day_of_week, exercise_id, set_count, position, plan_id);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/:id', (req, res) => {
  const slot = db.prepare('SELECT plan_id FROM schedule WHERE id = ?').get(req.params.id);
  if (!slot || !db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(slot.plan_id, req.user.id))
    return res.status(404).json({ error: 'Not found' });
  const { set_count, position, day_of_week } = req.body;
  const fields = [], values = [];
  if (set_count   !== undefined) { fields.push('set_count = ?');   values.push(set_count); }
  if (position    !== undefined) { fields.push('position = ?');    values.push(position); }
  if (day_of_week !== undefined) { fields.push('day_of_week = ?'); values.push(day_of_week); }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  db.prepare(`UPDATE schedule SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const slot = db.prepare('SELECT plan_id FROM schedule WHERE id = ?').get(req.params.id);
  if (!slot || !db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(slot.plan_id, req.user.id))
    return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM schedule WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
