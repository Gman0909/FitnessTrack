import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare(`
    SELECT s.id, s.day_of_week, s.set_count, s.position,
           e.id as exercise_id, e.name, e.muscle_group, e.equipment,
           (SELECT st.weight FROM set_targets st
            WHERE st.exercise_id = e.id AND st.set_num = 1 AND st.valid_from <= date('now')
            ORDER BY st.is_suggestion ASC, st.valid_from DESC LIMIT 1) as weight
    FROM schedule s JOIN exercises e ON e.id = s.exercise_id
    ORDER BY s.day_of_week, s.position
  `).all());
});

router.get('/today', (req, res) => {
  const dayOfWeek  = req.query.dow !== undefined
    ? parseInt(req.query.dow, 10)
    : (new Date().getDay() + 6) % 7;
  const activePlan = db.prepare('SELECT id FROM workout_plans WHERE is_active = 1 AND user_id = ?').get(req.user.id);
  if (!activePlan) return res.json([]);

  const slots = db.prepare(`
    SELECT s.id as schedule_id, s.set_count, s.position, s.plan_id,
           e.id as exercise_id, e.name, e.muscle_group, e.equipment, e.default_increment
    FROM schedule s JOIN exercises e ON e.id = s.exercise_id
    WHERE s.day_of_week = ? AND s.plan_id = ?
      AND EXISTS (SELECT 1 FROM plan_days pd WHERE pd.plan_id = s.plan_id AND pd.day_of_week = s.day_of_week)
    ORDER BY s.position
  `).all(dayOfWeek, activePlan.id);

  // Prefer algorithm targets (is_suggestion=0) over user suggestions; fall back
  // to the suggestion only when no algorithm target has been written yet.
  const getCurrent = db.prepare(`
    SELECT weight, reps FROM set_targets
    WHERE exercise_id = ? AND set_num = ? AND valid_from <= date('now') AND plan_id IS ?
    ORDER BY is_suggestion ASC, valid_from DESC LIMIT 1
  `);
  // "Previous" means a genuinely older algorithm target — a different (earlier)
  // valid_from date. Suggestions and same-date duplicates are excluded so the
  // UI never shows a false volume-change hint on a first-time exercise.
  const getPrev = db.prepare(`
    SELECT weight, reps FROM set_targets
    WHERE exercise_id = ? AND set_num = ? AND plan_id IS ?
      AND is_suggestion = 0
      AND valid_from < (
        SELECT MAX(valid_from) FROM set_targets
        WHERE exercise_id = ? AND set_num = ? AND plan_id IS ?
          AND is_suggestion = 0 AND valid_from <= date('now')
      )
    ORDER BY valid_from DESC LIMIT 1
  `);

  const result = slots.map(slot => {
    const sets = Array.from({ length: slot.set_count }, (_, i) => {
      const setNum  = i + 1;
      const target  = getCurrent.get(slot.exercise_id, setNum, slot.plan_id);
      const prev    = getPrev.get(slot.exercise_id, setNum, slot.plan_id,
                                  slot.exercise_id, setNum, slot.plan_id);
      return {
        set_num:     setNum,
        weight:      target?.weight ?? 20,
        reps:        target?.reps   ?? 8,
        prev_weight: prev?.weight   ?? null,
        prev_reps:   prev?.reps     ?? null,
      };
    });
    return { ...slot, sets };
  });

  res.json(result);
});

router.post('/', (req, res) => {
  const { day_of_week, exercise_id, set_count = 3, position = 0 } = req.body;
  const result = db.prepare(
    'INSERT INTO schedule (day_of_week, exercise_id, set_count, position) VALUES (?, ?, ?, ?)'
  ).run(day_of_week, exercise_id, set_count, position);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/:id', (req, res) => {
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
  db.prepare('DELETE FROM schedule WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Record the user's starting-weight suggestion for a scheduled exercise.
// Suggestions are shown in the UI as pre-fills but are ignored by the
// progression algorithm; the algorithm bootstraps from the first logged session.
// Idempotent: if the exercise already has a suggestion for this plan (because
// it appears on multiple days), the first entry wins and subsequent calls are
// no-ops — targets are plan-wide, not per-day.
router.post('/targets', (req, res) => {
  const { exercise_id, set_num, weight, reps, plan_id } = req.body;
  const exists = db.prepare(
    'SELECT 1 FROM set_targets WHERE exercise_id = ? AND set_num = ? AND plan_id IS ? AND is_suggestion = 1'
  ).get(exercise_id, set_num, plan_id ?? null);
  if (exists) return res.status(200).json({ id: null, skipped: true });

  const today = new Date().toISOString().split('T')[0];
  const result = db.prepare(
    'INSERT INTO set_targets (exercise_id, set_num, weight, reps, valid_from, plan_id, is_suggestion) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).run(exercise_id, set_num, weight, reps, today, plan_id ?? null);
  res.status(201).json({ id: result.lastInsertRowid });
});

export default router;
