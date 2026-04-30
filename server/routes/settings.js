import { Router } from 'express';
import db from '../db.js';

const router = Router();

const MUSCLE_GROUPS    = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'];
const REP_RANGES       = ['powerlifting', 'standard', 'volume'];
const AGGRESSIVENESS   = ['conservative', 'moderate', 'aggressive'];

router.get('/muscle-groups', (req, res) => {
  const rows = db.prepare(
    'SELECT muscle_group, rep_range, aggressiveness FROM muscle_group_settings WHERE user_id = ?'
  ).all(req.user.id);

  const map = Object.fromEntries(rows.map(r => [r.muscle_group, r]));
  res.json(MUSCLE_GROUPS.map(mg => ({
    muscle_group:   mg,
    rep_range:      map[mg]?.rep_range      ?? 'standard',
    aggressiveness: map[mg]?.aggressiveness ?? 'moderate',
  })));
});

router.put('/muscle-groups/:group', (req, res) => {
  const { group } = req.params;
  if (!MUSCLE_GROUPS.includes(group)) return res.status(400).json({ error: 'Unknown muscle group' });

  const existing = db.prepare(
    'SELECT rep_range, aggressiveness FROM muscle_group_settings WHERE user_id = ? AND muscle_group = ?'
  ).get(req.user.id, group) ?? { rep_range: 'standard', aggressiveness: 'moderate' };

  const rep_range     = req.body.rep_range     ?? existing.rep_range;
  const aggressiveness = req.body.aggressiveness ?? existing.aggressiveness;

  if (!REP_RANGES.includes(rep_range))     return res.status(400).json({ error: 'Invalid rep_range' });
  if (!AGGRESSIVENESS.includes(aggressiveness)) return res.status(400).json({ error: 'Invalid aggressiveness' });

  db.prepare(`
    INSERT INTO muscle_group_settings (user_id, muscle_group, rep_range, aggressiveness)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, muscle_group) DO UPDATE SET
      rep_range      = excluded.rep_range,
      aggressiveness = excluded.aggressiveness
  `).run(req.user.id, group, rep_range, aggressiveness);

  res.json({ ok: true });
});

export default router;
