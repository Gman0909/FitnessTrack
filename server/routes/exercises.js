import { Router } from 'express';
import db from '../db.js';
import { check, isInt, isNum, isText, LIMITS } from '../validate.js';

const router = Router();

// Visibility & ownership:
//   - library exercises (is_custom = 0) and legacy shared customs have
//     owner_user_id NULL: visible to everyone, identity (name / muscle group /
//     equipment) editable by the admin only.
//   - a custom exercise with an owner is visible to, and editable by, that
//     account only.
// Training parameters (rep range, increment, pause, optimal sets) are always
// personal (user_exercise_settings), so anyone who can see an exercise can tune them.
const VISIBLE = '(e.owner_user_id IS NULL OR e.owner_user_id = @uid)';

const isAdmin = uid => db.prepare('SELECT is_admin FROM users WHERE id = ?').get(uid)?.is_admin === 1;
const canEditIdentity = (ex, uid) => ex.owner_user_id === uid || (ex.owner_user_id == null && isAdmin(uid));
const visibleExercise = (id, uid) =>
  db.prepare(`SELECT * FROM exercises e WHERE e.id = @id AND ${VISIBLE}`).get({ id, uid });

router.get('/', (req, res) => {
  const conditions = [VISIBLE];
  const params = { uid: req.user.id, admin: isAdmin(req.user.id) ? 1 : 0 };

  if (req.query.user_equipment === 'true') {
    conditions.push('e.equipment IN (SELECT equipment FROM user_equipment WHERE user_id = @uid)');
  }
  if (req.query.muscle_group) {
    conditions.push('e.muscle_group = @mg');
    params.mg = req.query.muscle_group;
  }
  if (req.query.custom_only === 'true') {
    conditions.push('e.is_custom = 1');
  }

  // rep_min/rep_max/default_increment are returned as effective values —
  // the caller's personal override if set, otherwise the shared default.
  res.json(db.prepare(`
    SELECT e.id, e.name, e.muscle_group, e.equipment, e.is_custom,
           COALESCE(ues.rep_min, e.rep_min)                     AS rep_min,
           COALESCE(ues.rep_max, e.rep_max)                     AS rep_max,
           COALESCE(ues.default_increment, e.default_increment) AS default_increment,
           COALESCE(ues.pause_weight, 0)                        AS pause_weight,
           ues.pause_cap_kg                                      AS pause_cap_kg,
           ues.optimal_sets                                      AS optimal_sets,
           CASE WHEN e.owner_user_id = @uid OR (e.owner_user_id IS NULL AND @admin = 1)
                THEN 1 ELSE 0 END                                AS can_edit
    FROM exercises e
    LEFT JOIN user_exercise_settings ues ON ues.exercise_id = e.id AND ues.user_id = @uid
    WHERE ${conditions.join(' AND ')}
    ORDER BY e.muscle_group, e.name
  `).all(params));
});

const identityRules = {
  name: v => isText(v, 80), muscle_group: v => isText(v, 30), equipment: v => isText(v, 30),
};

router.post('/', (req, res) => {
  const { name, muscle_group, equipment, default_increment = 2.5, rep_min = 8, rep_max = 12 } = req.body;
  const err = check(req.body, {
    ...identityRules,
    default_increment: v => isNum(v, ...LIMITS.increment),
    rep_min: v => isInt(v, ...LIMITS.repRange), rep_max: v => isInt(v, ...LIMITS.repRange),
  }, ['name', 'muscle_group', 'equipment']);
  if (err) return res.status(400).json({ error: err });
  if (!(rep_max > rep_min))
    return res.status(400).json({ error: 'rep_max must be greater than rep_min (>= 1)' });
  if (db.prepare('SELECT 1 FROM exercises WHERE name = ?').get(name.trim()))
    return res.status(409).json({ error: 'An exercise with that name already exists' });
  const result = db.prepare(
    'INSERT INTO exercises (name, muscle_group, equipment, default_increment, is_custom, rep_min, rep_max, owner_user_id) VALUES (?, ?, ?, ?, 1, ?, ?, ?)'
  ).run(name.trim(), muscle_group, equipment, default_increment, rep_min, rep_max, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), muscle_group, equipment, default_increment, rep_min, rep_max, is_custom: 1, can_edit: 1 });
});

router.patch('/:id', (req, res) => {
  const { name, muscle_group, equipment, default_increment, rep_min, rep_max, pause_weight, optimal_sets,
          pause_cap_kg, freeze_plan_id } = req.body;
  const exId = Number(req.params.id);
  const ex   = visibleExercise(exId, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });

  const err = check(req.body, {
    ...identityRules,
    default_increment: v => isNum(v, ...LIMITS.increment),
    optimal_sets: v => isInt(v, ...LIMITS.setCount),
    pause_cap_kg: v => v === null || isNum(v, ...LIMITS.weightKg),
  });
  if (err) return res.status(400).json({ error: err });

  // Identity fields are shared — only an actual change needs permission (the
  // editor always sends them, unchanged, alongside personal settings).
  const identity = { name: name?.trim(), muscle_group, equipment };
  const changed  = Object.entries(identity).filter(([k, v]) => v !== undefined && v !== ex[k]);
  if (changed.length && !canEditIdentity(ex, req.user.id))
    return res.status(403).json({ error: 'Only the admin can rename or re-categorise shared exercises' });
  if (identity.name !== undefined && identity.name !== ex.name &&
      db.prepare('SELECT 1 FROM exercises WHERE name = ? AND id <> ?').get(identity.name, exId))
    return res.status(409).json({ error: 'An exercise with that name already exists' });

  // Validate the resulting rep range against this user's effective values.
  if (rep_min !== undefined || rep_max !== undefined) {
    const ues = db.prepare(
      'SELECT rep_min, rep_max FROM user_exercise_settings WHERE user_id = ? AND exercise_id = ?'
    ).get(req.user.id, exId);
    const newMin = rep_min ?? ues?.rep_min ?? ex.rep_min;
    const newMax = rep_max ?? ues?.rep_max ?? ex.rep_max;
    if (!(Number.isInteger(newMin) && Number.isInteger(newMax) && newMin >= 1 && newMax > newMin && newMax <= LIMITS.repRange[1]))
      return res.status(400).json({ error: 'rep_max must be a whole number greater than rep_min (>= 1)' });
  }

  db.transaction(() => {
    // Intrinsic properties — shared across all users.
    if (changed.length) {
      db.prepare(`UPDATE exercises SET ${changed.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...changed.map(([, v]) => v), exId);
    }
    // Training parameters — personal override (NULL = fall back to default).
    if (rep_min !== undefined || rep_max !== undefined || default_increment !== undefined || pause_weight !== undefined || optimal_sets !== undefined) {
      // pause_cap_kg follows pause_weight: set to the cap when pausing, cleared to
      // NULL when resuming, left untouched when this PATCH doesn't touch pause.
      const capChange = pause_weight === undefined ? 0 : 1;
      const cap = pause_weight ? (pause_cap_kg ?? null) : null;
      db.prepare(`
        INSERT INTO user_exercise_settings (user_id, exercise_id, rep_min, rep_max, default_increment, pause_weight, pause_cap_kg, optimal_sets)
        VALUES (@u, @e, @rmin, @rmax, @inc, COALESCE(@pause, 0), @cap, @optSets)
        ON CONFLICT(user_id, exercise_id) DO UPDATE SET
          rep_min           = COALESCE(@rmin,    rep_min),
          rep_max           = COALESCE(@rmax,    rep_max),
          default_increment = COALESCE(@inc,     default_increment),
          pause_weight      = COALESCE(@pause,   pause_weight),
          pause_cap_kg      = CASE WHEN @capChange = 1 THEN @cap ELSE pause_cap_kg END,
          optimal_sets      = COALESCE(@optSets, optimal_sets)
      `).run({
        u: req.user.id, e: exId,
        rmin: rep_min ?? null, rmax: rep_max ?? null, inc: default_increment ?? null,
        pause: pause_weight === undefined ? null : (pause_weight ? 1 : 0),
        capChange, cap,
        optSets: optimal_sets ?? null,
      });
    }
    // Activating the cap: drop any algorithm-written future-dated targets so the
    // next session is regenerated under the cap. Current/past per-set weights are
    // left untouched (they are all <= cap, since the cap is the heaviest of them).
    if (pause_weight === 1 && freeze_plan_id != null) {
      const plan = db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(freeze_plan_id, req.user.id);
      if (plan) {
        db.prepare('DELETE FROM set_targets WHERE exercise_id = ? AND plan_id = ? AND valid_from > ?')
          .run(exId, freeze_plan_id, req.today);
      }
    }
  })();
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const exId = Number(req.params.id);
  const ex   = visibleExercise(exId, req.user.id);
  if (!ex || ex.is_custom !== 1) return res.status(404).json({ error: 'Not found' });
  if (!canEditIdentity(ex, req.user.id))
    return res.status(403).json({ error: 'Only the admin can delete shared exercises' });
  // Never destroy workout history: an exercise with logged sets stays.
  if (db.prepare('SELECT 1 FROM logged_sets WHERE exercise_id = ? LIMIT 1').get(exId))
    return res.status(409).json({ error: 'This exercise has logged history, so it can\'t be deleted. Remove it from your plans instead.' });
  if (db.prepare(`SELECT 1 FROM schedule s JOIN workout_plans wp ON wp.id = s.plan_id
                  WHERE s.exercise_id = ? AND (wp.user_id IS NULL OR wp.user_id <> ?) LIMIT 1`).get(exId, req.user.id))
    return res.status(409).json({ error: 'This exercise is used in another account\'s plan, so it can\'t be deleted.' });
  db.prepare('DELETE FROM exercises WHERE id = ?').run(exId);
  res.json({ ok: true });
});

router.get('/equipment', (req, res) => {
  res.json(db.prepare('SELECT equipment FROM user_equipment WHERE user_id = ?').all(req.user.id).map(r => r.equipment));
});

router.post('/equipment', (req, res) => {
  const { equipment } = req.body;
  if (!isText(equipment, 30)) return res.status(400).json({ error: 'invalid equipment' });
  db.prepare('INSERT OR IGNORE INTO user_equipment (user_id, equipment) VALUES (?, ?)').run(req.user.id, equipment);
  res.status(201).json({ equipment });
});

router.delete('/equipment/:name', (req, res) => {
  db.prepare('DELETE FROM user_equipment WHERE user_id = ? AND equipment = ?').run(req.user.id, req.params.name);
  res.json({ ok: true });
});

export default router;
