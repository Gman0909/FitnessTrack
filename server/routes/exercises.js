import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const conditions = [];
  const params = [req.user.id];   // first ? — the user_exercise_settings join

  if (req.query.user_equipment === 'true') {
    conditions.push('e.equipment IN (SELECT equipment FROM user_equipment)');
  }
  if (req.query.muscle_group) {
    conditions.push('e.muscle_group = ?');
    params.push(req.query.muscle_group);
  }
  if (req.query.custom_only === 'true') {
    conditions.push('e.is_custom = 1');
  }

  // rep_min/rep_max/default_increment are returned as effective values —
  // the caller's personal override if set, otherwise the shared default.
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  res.json(db.prepare(`
    SELECT e.id, e.name, e.muscle_group, e.equipment, e.is_custom,
           COALESCE(ues.rep_min, e.rep_min)                     AS rep_min,
           COALESCE(ues.rep_max, e.rep_max)                     AS rep_max,
           COALESCE(ues.default_increment, e.default_increment) AS default_increment
    FROM exercises e
    LEFT JOIN user_exercise_settings ues ON ues.exercise_id = e.id AND ues.user_id = ?
    ${where}
    ORDER BY e.muscle_group, e.name
  `).all(...params));
});

router.post('/', (req, res) => {
  const { name, muscle_group, equipment, default_increment = 2.5, rep_min = 8, rep_max = 12 } = req.body;
  if (!(rep_min >= 1 && rep_max > rep_min))
    return res.status(400).json({ error: 'rep_max must be greater than rep_min (>= 1)' });
  const result = db.prepare(
    'INSERT INTO exercises (name, muscle_group, equipment, default_increment, is_custom, rep_min, rep_max) VALUES (?, ?, ?, ?, 1, ?, ?)'
  ).run(name, muscle_group, equipment, default_increment, rep_min, rep_max);
  res.status(201).json({ id: result.lastInsertRowid, name, muscle_group, equipment, default_increment, rep_min, rep_max, is_custom: 1 });
});

router.patch('/:id', (req, res) => {
  const { name, muscle_group, equipment, default_increment, rep_min, rep_max } = req.body;
  const exId = Number(req.params.id);
  const ex   = db.prepare('SELECT rep_min, rep_max FROM exercises WHERE id = ?').get(exId);
  if (!ex) return res.status(404).json({ error: 'Not found' });

  // Validate the resulting rep range against this user's effective values.
  if (rep_min !== undefined || rep_max !== undefined) {
    const ues = db.prepare(
      'SELECT rep_min, rep_max FROM user_exercise_settings WHERE user_id = ? AND exercise_id = ?'
    ).get(req.user.id, exId);
    const newMin = rep_min ?? ues?.rep_min ?? ex.rep_min;
    const newMax = rep_max ?? ues?.rep_max ?? ex.rep_max;
    if (!(Number.isInteger(newMin) && Number.isInteger(newMax) && newMin >= 1 && newMax > newMin))
      return res.status(400).json({ error: 'rep_max must be a whole number greater than rep_min (>= 1)' });
  }

  db.transaction(() => {
    // Intrinsic properties — shared across all users.
    const fields = [], vals = [];
    if (name         !== undefined) { fields.push('name = ?');         vals.push(name); }
    if (muscle_group !== undefined) { fields.push('muscle_group = ?'); vals.push(muscle_group); }
    if (equipment    !== undefined) { fields.push('equipment = ?');    vals.push(equipment); }
    if (fields.length) {
      vals.push(exId);
      db.prepare(`UPDATE exercises SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    }
    // Training parameters — personal override (NULL = fall back to default).
    if (rep_min !== undefined || rep_max !== undefined || default_increment !== undefined) {
      db.prepare(`
        INSERT INTO user_exercise_settings (user_id, exercise_id, rep_min, rep_max, default_increment)
        VALUES (@u, @e, @rmin, @rmax, @inc)
        ON CONFLICT(user_id, exercise_id) DO UPDATE SET
          rep_min           = COALESCE(@rmin, rep_min),
          rep_max           = COALESCE(@rmax, rep_max),
          default_increment = COALESCE(@inc,  default_increment)
      `).run({
        u: req.user.id, e: exId,
        rmin: rep_min ?? null, rmax: rep_max ?? null, inc: default_increment ?? null,
      });
    }
  })();
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM exercises WHERE id = ? AND is_custom = 1').run(req.params.id);
  res.json({ ok: true });
});

router.get('/equipment', (_req, res) => {
  res.json(db.prepare('SELECT equipment FROM user_equipment').all().map(r => r.equipment));
});

router.post('/equipment', (req, res) => {
  const { equipment } = req.body;
  db.prepare('INSERT OR IGNORE INTO user_equipment (equipment) VALUES (?)').run(equipment);
  res.status(201).json({ equipment });
});

router.delete('/equipment/:name', (req, res) => {
  db.prepare('DELETE FROM user_equipment WHERE equipment = ?').run(req.params.name);
  res.json({ ok: true });
});

export default router;
