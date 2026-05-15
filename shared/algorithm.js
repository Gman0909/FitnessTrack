// ── Dynamic double progression ────────────────────────────────────────────────
//
// Each set is its own progression track: a (weight, reps) target bounded by the
// exercise's rep range [repMin, repMax]. The next target is derived purely from
// how the user's *actual* logged performance compared to the target they were
// given — no subjective check-ins.
//
//   actual_reps >= repMax              → weight bump: weight + increment, reps → repMin
//   target_reps <= actual_reps < repMax → rep progress: reps → min(repMax, actual + 1)
//   repMin <= actual_reps < target_reps → hold: same weight & target reps
//   actual_reps < repMin                → ease off: weight − increment, reps → repMin
//   skipped / not logged                → unchanged
//
// Per-set independence gives the "dynamic" pattern from double-progression
// training: the freshest set climbs fastest and bumps weight first, while later
// sets settle at their own weight/rep levels.
//
// Bodyweight exercises have no weight axis — reps simply climb toward repMax and
// hold there; the caller adds a set when every set has reached the ceiling.

// Cap the increment at 10% of the working weight; floor at 1.25 kg (smallest
// real plate) so light isolation lifts still progress.
function effectiveIncrement(weight, defaultIncrement) {
  return Math.min(defaultIncrement, Math.max(weight * 0.10, 1.25));
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

// setData: Array of {
//   set_num,
//   target: { weight, reps },                       // expected (the target shown this session)
//   logged: { weight_used, reps_done, skipped },     // actual
// }
// opts: { repMin, repMax, increment, equipment }
// Returns: Array of { set_num, weight, reps } — the next session's per-set target.
export function nextExerciseTargets(setData, opts = {}) {
  const repMin    = opts.repMin ?? 8;
  const repMax    = opts.repMax ?? 12;
  const equipment = opts.equipment ?? 'barbell';
  const defaultIncrement = opts.increment ?? 2.5;

  return setData.map(s => {
    const t  = s.target;
    const lg = s.logged;

    // Skipped or never logged → carry the current target forward unchanged.
    if (!lg || lg.skipped || lg.reps_done == null) {
      return { set_num: s.set_num, weight: t.weight, reps: t.reps };
    }

    const actualReps = lg.reps_done;

    // ── Bodyweight: reps-only axis ──────────────────────────────────────────
    if (equipment === 'bodyweight') {
      let reps;
      if (actualReps >= repMax)           reps = repMax;                       // ceiling — caller may add a set
      else if (actualReps >= t.reps)      reps = Math.min(repMax, actualReps + 1);
      else                                 reps = t.reps;                       // hold
      return { set_num: s.set_num, weight: t.weight, reps };
    }

    // ── Weighted: double progression ────────────────────────────────────────
    const baseW = lg.weight_used ?? t.weight ?? 0;
    const incr  = effectiveIncrement(baseW, defaultIncrement);

    // Reached/passed the ceiling → bump weight, reset reps to the floor.
    if (actualReps >= repMax) {
      return { set_num: s.set_num, weight: Math.max(roundToHalf(baseW + incr), 0.5), reps: repMin };
    }
    // Couldn't reach the floor → weight is too heavy, ease off.
    if (actualReps < repMin) {
      return { set_num: s.set_num, weight: Math.max(roundToHalf(baseW - incr), 0.5), reps: repMin };
    }
    // Hit (or beat) the target with room below the ceiling → add a rep.
    if (actualReps >= t.reps) {
      return { set_num: s.set_num, weight: baseW, reps: Math.min(repMax, actualReps + 1) };
    }
    // Fell short of the target but stayed in range → hold and try again.
    return { set_num: s.set_num, weight: baseW, reps: t.reps };
  });
}

// Per-set comparison of actual vs target, for the UI feedback glyph.
// Returns 'up' (beat target / ceiling), 'met' (hit target), or 'down' (short).
export function setPerformance(targetReps, actualReps) {
  if (actualReps == null) return null;
  if (actualReps > targetReps)  return 'up';
  if (actualReps === targetReps) return 'met';
  return 'down';
}
