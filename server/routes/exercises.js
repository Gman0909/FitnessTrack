import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const conditions = [];
  const params = [];

  if (req.query.user_equipment === 'true') {
    conditions.push('equipment IN (SELECT equipment FROM user_equipment)');
  }
  if (req.query.muscle_group) {
    conditions.push('muscle_group = ?');
    params.push(req.query.muscle_group);
  }
  if (req.query.custom_only === 'true') {
    conditions.push('is_custom = 1');
  }

  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  res.json(db.prepare(`SELECT * FROM exercises${where} ORDER BY muscle_group, name`).all(...params));
});

router.post('/', (req, res) => {
  const { name, muscle_group, equipment, default_increment = 2.5 } = req.body;
  const result = db.prepare(
    'INSERT INTO exercises (name, muscle_group, equipment, default_increment, is_custom) VALUES (?, ?, ?, ?, 1)'
  ).run(name, muscle_group, equipment, default_increment);
  res.status(201).json({ id: result.lastInsertRowid, name, muscle_group, equipment, default_increment, is_custom: 1 });
});

router.patch('/:id', (req, res) => {
  const { name, muscle_group, equipment, default_increment } = req.body;
  const fields = [], vals = [];
  if (name              !== undefined) { fields.push('name = ?');              vals.push(name); }
  if (muscle_group      !== undefined) { fields.push('muscle_group = ?');      vals.push(muscle_group); }
  if (equipment         !== undefined) { fields.push('equipment = ?');         vals.push(equipment); }
  if (default_increment !== undefined) { fields.push('default_increment = ?'); vals.push(default_increment); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  db.prepare(`UPDATE exercises SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
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
