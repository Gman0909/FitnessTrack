import db from './db.js';

// Date-versioned set counts. The effective count for an exercise in a session
// is the most recent set_counts row valid as of that session's date; a blank
// (undated) session uses the latest row. schedule.set_count is kept as a live
// mirror of the latest value for callers that only need the current count.

const latestAsOf = db.prepare(`
  SELECT set_count FROM set_counts
  WHERE plan_id IS ? AND day_of_week = ? AND exercise_id = ? AND valid_from <= ?
  ORDER BY valid_from DESC, id DESC LIMIT 1
`);
const latestAny = db.prepare(`
  SELECT set_count FROM set_counts
  WHERE plan_id IS ? AND day_of_week = ? AND exercise_id = ?
  ORDER BY valid_from DESC, id DESC LIMIT 1
`);

// Effective set count for (plan, day, exercise) as of `date` (YYYY-MM-DD).
// When `date` is null the latest row is used. `fallback` (the caller's live
// schedule.set_count) covers a schedule row that has no set_counts row yet.
export function effectiveSetCount(planId, dow, exerciseId, date, fallback) {
  const row = date != null
    ? latestAsOf.get(planId ?? null, dow, exerciseId, date)
    : latestAny.get(planId ?? null, dow, exerciseId);
  return row?.set_count ?? fallback;
}

const insertCount = db.prepare(`
  INSERT INTO set_counts (plan_id, day_of_week, exercise_id, set_count, valid_from)
  VALUES (?, ?, ?, ?, ?)
`);
const deleteCountAt = db.prepare(`
  DELETE FROM set_counts
  WHERE plan_id IS ? AND day_of_week = ? AND exercise_id = ? AND valid_from = ?
`);

// Record a set-count change effective from `validFrom`, then resync the live
// mirror. A second change on the same valid_from replaces the first.
export function recordSetCount(planId, dow, exerciseId, count, validFrom) {
  deleteCountAt.run(planId ?? null, dow, exerciseId, validFrom);
  insertCount.run(planId ?? null, dow, exerciseId, count, validFrom);
  resyncScheduleSetCount(planId, dow, exerciseId);
}

// Drop a recorded change at `validFrom` (used to keep re-logging idempotent),
// then resync the live mirror.
export function clearSetCountAt(planId, dow, exerciseId, validFrom) {
  deleteCountAt.run(planId ?? null, dow, exerciseId, validFrom);
  resyncScheduleSetCount(planId, dow, exerciseId);
}

// Point schedule.set_count at the most recent set_counts value.
export function resyncScheduleSetCount(planId, dow, exerciseId) {
  const row = latestAny.get(planId ?? null, dow, exerciseId);
  if (row) {
    db.prepare(
      'UPDATE schedule SET set_count = ? WHERE plan_id IS ? AND day_of_week = ? AND exercise_id = ?'
    ).run(row.set_count, planId ?? null, dow, exerciseId);
  }
}
