// Full per-account export / restore (JSON).
//
// The export is self-contained and portable between installs: rows reference
// exercises by *name* (ids differ across databases) and plans by a local
// `ref`. Restore replaces the account's training data with the file's
// contents; the route takes a database snapshot first.

export const FORMAT = 'fitnesstrack-export';
export const FORMAT_VERSION = 1;

export function exportUser(db, userId, appVersion = null) {
  const user = db.prepare('SELECT username, name, glyph FROM users WHERE id = ?').get(userId);
  const plans = db.prepare('SELECT * FROM workout_plans WHERE user_id = ? ORDER BY id').all(userId);
  const exNames = new Map(); // id → name, for every exercise referenced
  const nameOf = id => {
    if (!exNames.has(id)) exNames.set(id, db.prepare('SELECT name FROM exercises WHERE id = ?').get(id)?.name ?? null);
    return exNames.get(id);
  };

  const outPlans = plans.map(p => ({
    ref: p.id, name: p.name, is_active: p.is_active, started_at: p.started_at,
    created_at: p.created_at, week_count: p.week_count,
    days: db.prepare('SELECT day_of_week FROM plan_days WHERE plan_id = ? ORDER BY day_of_week').all(p.id).map(r => r.day_of_week),
    schedule: db.prepare('SELECT exercise_id, day_of_week, set_count, position FROM schedule WHERE plan_id = ? ORDER BY day_of_week, position, id').all(p.id)
      .map(r => ({ exercise: nameOf(r.exercise_id), day_of_week: r.day_of_week, set_count: r.set_count, position: r.position })),
    set_counts: db.prepare('SELECT exercise_id, day_of_week, set_count, valid_from FROM set_counts WHERE plan_id = ? ORDER BY id').all(p.id)
      .map(r => ({ exercise: nameOf(r.exercise_id), day_of_week: r.day_of_week, set_count: r.set_count, valid_from: r.valid_from })),
    set_targets: db.prepare('SELECT exercise_id, set_num, weight, reps, valid_from, is_suggestion FROM set_targets WHERE plan_id = ? ORDER BY id').all(p.id)
      .map(r => ({ exercise: nameOf(r.exercise_id), set_num: r.set_num, weight: r.weight, reps: r.reps, valid_from: r.valid_from, is_suggestion: r.is_suggestion })),
  }));

  const planIds = new Set(plans.map(p => p.id));
  const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY id').all(userId).map(s => ({
    plan_ref: planIds.has(s.plan_id) ? s.plan_id : null,
    date: s.date, week_num: s.week_num, session_dow: s.session_dow,
    checked_in: s.checked_in, unlocked: s.unlocked,
    sets: db.prepare('SELECT exercise_id, set_num, reps_done, skipped, weight_used FROM logged_sets WHERE session_id = ? ORDER BY id').all(s.id)
      .map(l => ({ exercise: nameOf(l.exercise_id), set_num: l.set_num, reps_done: l.reps_done, skipped: l.skipped, weight_used: l.weight_used })),
  }));

  const settings = db.prepare('SELECT * FROM user_exercise_settings WHERE user_id = ?').all(userId).map(s => ({
    exercise: nameOf(s.exercise_id), rep_min: s.rep_min, rep_max: s.rep_max, default_increment: s.default_increment,
    pause_weight: s.pause_weight, pause_cap_kg: s.pause_cap_kg, optimal_sets: s.optimal_sets,
  }));

  // Exercise definitions for everything referenced, so a restore on another
  // install can recreate custom exercises.
  const exercises = [...exNames.keys()].map(id => db.prepare(
    'SELECT name, muscle_group, equipment, default_increment, rep_min, rep_max, is_custom FROM exercises WHERE id = ?'
  ).get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));

  return {
    format: FORMAT, version: FORMAT_VERSION, app_version: appVersion,
    exported_at: new Date().toISOString(),
    user, exercises, exercise_settings: settings,
    equipment: db.prepare('SELECT equipment FROM user_equipment WHERE user_id = ? ORDER BY equipment').all(userId).map(r => r.equipment),
    plans: outPlans, sessions,
  };
}

export function accountHasData(db, userId) {
  return !!(db.prepare('SELECT 1 FROM sessions WHERE user_id = ? LIMIT 1').get(userId)
         || db.prepare('SELECT 1 FROM workout_plans WHERE user_id = ? LIMIT 1').get(userId));
}

// Throws an Error with a user-facing message if the file isn't a usable export.
export function validateExport(data) {
  const fail = m => { throw Object.assign(new Error(m), { status: 400 }); };
  if (!data || data.format !== FORMAT) fail('Not a FitnessTrack export file');
  if (data.version !== FORMAT_VERSION) fail(`Unsupported export version ${data.version}`);
  for (const k of ['exercises', 'plans', 'sessions', 'exercise_settings', 'equipment'])
    if (!Array.isArray(data[k])) fail(`Export is missing "${k}"`);
  const known = new Set(data.exercises.map(e => e?.name));
  const refs = new Set(data.plans.map(p => p?.ref));
  const needEx = n => { if (!known.has(n)) fail(`Export references unknown exercise "${n}"`); };
  for (const p of data.plans) {
    if (typeof p.name !== 'string' || !Array.isArray(p.days) || !Array.isArray(p.schedule)
        || !Array.isArray(p.set_counts) || !Array.isArray(p.set_targets)) fail('Malformed plan in export');
    for (const r of [...p.schedule, ...p.set_counts, ...p.set_targets]) needEx(r.exercise);
  }
  for (const s of data.sessions) {
    if (!Array.isArray(s.sets)) fail('Malformed session in export');
    if (s.plan_ref != null && !refs.has(s.plan_ref)) fail('Session references an unknown plan');
    for (const l of s.sets) needEx(l.exercise);
  }
  for (const s of data.exercise_settings) needEx(s.exercise);
}

// Replace the account's training data with `data`. Caller wraps nothing —
// this runs in its own transaction. Returns row counts.
export function importUser(db, userId, data) {
  validateExport(data);
  return db.transaction(() => {
    // ── Wipe the account's current training data ─────────────────────────
    const planIds = db.prepare('SELECT id FROM workout_plans WHERE user_id = ?').all(userId).map(r => r.id);
    for (const id of planIds) db.prepare('DELETE FROM set_targets WHERE plan_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);           // logged_sets cascade
    db.prepare('UPDATE sessions SET plan_id = NULL WHERE plan_id IN (SELECT id FROM workout_plans WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM workout_plans WHERE user_id = ?').run(userId);      // days, schedule, set_counts cascade
    db.prepare('DELETE FROM user_exercise_settings WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_equipment WHERE user_id = ?').run(userId);

    // ── Resolve exercises by name ────────────────────────────────────────
    // An existing exercise the account can see is reused. A missing one is
    // created as this account's custom exercise; if the name is taken by
    // another account's private exercise, the copy gets an "(imported)" suffix.
    const exId = new Map();
    const findVisible = db.prepare('SELECT id FROM exercises WHERE name = ? AND (owner_user_id IS NULL OR owner_user_id = ?)');
    const nameTaken   = db.prepare('SELECT 1 FROM exercises WHERE name = ?');
    const insEx = db.prepare(`INSERT INTO exercises (name, muscle_group, equipment, default_increment, rep_min, rep_max, is_custom, owner_user_id)
                              VALUES (?, ?, ?, ?, ?, ?, 1, ?)`);
    let createdExercises = 0;
    for (const e of data.exercises) {
      const hit = findVisible.get(e.name, userId);
      if (hit) { exId.set(e.name, hit.id); continue; }
      let name = e.name;
      for (let i = 1; nameTaken.get(name); i++) name = `${e.name} (imported${i > 1 ? ' ' + i : ''})`;
      const id = insEx.run(name, e.muscle_group, e.equipment, e.default_increment ?? 2.5, e.rep_min ?? 8, e.rep_max ?? 12, userId).lastInsertRowid;
      exId.set(e.name, id);
      createdExercises++;
    }

    // ── Plans ────────────────────────────────────────────────────────────
    const planId = new Map();
    const insPlan  = db.prepare('INSERT INTO workout_plans (name, is_active, started_at, created_at, week_count, user_id) VALUES (?, ?, ?, ?, ?, ?)');
    const insDay   = db.prepare('INSERT INTO plan_days (plan_id, day_of_week) VALUES (?, ?)');
    const insSlot  = db.prepare('INSERT INTO schedule (plan_id, day_of_week, exercise_id, set_count, position) VALUES (?, ?, ?, ?, ?)');
    const insCount = db.prepare('INSERT INTO set_counts (plan_id, day_of_week, exercise_id, set_count, valid_from) VALUES (?, ?, ?, ?, ?)');
    const insTgt   = db.prepare('INSERT INTO set_targets (exercise_id, set_num, weight, reps, valid_from, plan_id, is_suggestion) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let activeSeen = false;
    for (const p of data.plans) {
      const active = p.is_active && !activeSeen ? 1 : 0;
      if (active) activeSeen = true;
      const id = insPlan.run(p.name, active, p.started_at ?? null, p.created_at ?? new Date().toISOString().slice(0, 10), p.week_count ?? 4, userId).lastInsertRowid;
      planId.set(p.ref, id);
      for (const d of new Set(p.days)) insDay.run(id, d);
      for (const s of p.schedule) insSlot.run(id, s.day_of_week, exId.get(s.exercise), s.set_count, s.position ?? 0);
      for (const c of p.set_counts) insCount.run(id, c.day_of_week, exId.get(c.exercise), c.set_count, c.valid_from);
      for (const t of p.set_targets) insTgt.run(exId.get(t.exercise), t.set_num, t.weight, t.reps, t.valid_from, id, t.is_suggestion ?? 0);
    }

    // ── Sessions + logged sets ───────────────────────────────────────────
    const insSess = db.prepare('INSERT INTO sessions (date, week_num, session_dow, checked_in, unlocked, plan_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insSet  = db.prepare('INSERT INTO logged_sets (session_id, exercise_id, set_num, reps_done, skipped, weight_used) VALUES (?, ?, ?, ?, ?, ?)');
    let setCount = 0;
    for (const s of data.sessions) {
      const sid = insSess.run(s.date ?? null, s.week_num, s.session_dow, s.checked_in ?? 0, s.unlocked ?? 0,
        s.plan_ref != null ? planId.get(s.plan_ref) : null, userId).lastInsertRowid;
      for (const l of s.sets) { insSet.run(sid, exId.get(l.exercise), l.set_num, l.reps_done, l.skipped ?? 0, l.weight_used); setCount++; }
    }

    // ── Personal settings + equipment ────────────────────────────────────
    const insSet2 = db.prepare(`INSERT OR REPLACE INTO user_exercise_settings
      (user_id, exercise_id, rep_min, rep_max, default_increment, pause_weight, pause_cap_kg, optimal_sets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const s of data.exercise_settings)
      insSet2.run(userId, exId.get(s.exercise), s.rep_min, s.rep_max, s.default_increment, s.pause_weight ?? 0, s.pause_cap_kg ?? null, s.optimal_sets ?? null);
    const insEq = db.prepare('INSERT OR IGNORE INTO user_equipment (user_id, equipment) VALUES (?, ?)');
    for (const e of data.equipment) if (typeof e === 'string') insEq.run(userId, e);

    return { plans: data.plans.length, sessions: data.sessions.length, sets: setCount, created_exercises: createdExercises };
  })();
}
