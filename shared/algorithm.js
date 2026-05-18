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
// When the weight actually used differs from the target's, the comparison
// target is first re-scaled to preserve volume (see weightAdjustedTarget).
// Beyond a ±15% weight deviation there is no comparable target, so the set
// simply climbs from the logged performance.
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

// Weight-deviation rep re-targeting. Real equipment can't always hit the
// recommended weight; when the user trains within ±15% of the target weight,
// the rep target re-derives to roughly preserve volume (weight × reps).
// Beyond that band the deviation is too large to map onto the same target
// ({ inBand: false }) — callers then drop the rep target / glyph and let
// progression run target-free. `target.weight` and `actualWeight` must share
// a unit; the ratio is unit-agnostic.
export const WEIGHT_BAND = 0.15;

export function weightAdjustedTarget(target, actualWeight, opts = {}) {
  const repMin = opts.repMin ?? 8;
  const repMax = opts.repMax ?? 12;
  // No recommendation yet, or no weight to compare → use the target unchanged.
  if (!target || target.weight == null || target.weight <= 0
      || actualWeight == null || !(actualWeight > 0))
    return { inBand: true, reps: target?.reps ?? repMin };
  const deviation = Math.abs(actualWeight - target.weight) / target.weight;
  if (deviation > WEIGHT_BAND) return { inBand: false, reps: null };
  const adjusted = Math.round(target.reps * target.weight / actualWeight);
  return { inBand: true, reps: Math.max(repMin, Math.min(repMax, adjusted)) };
}

// setData: Array of {
//   set_num,
//   target: { weight, reps },                       // expected (the target shown this session)
//   logged: { weight_used, reps_done, skipped },     // actual
// }
// opts: { repMin, repMax, increment, equipment, pauseWeight }
// Returns: Array of { set_num, weight, reps } — the next session's per-set target.
export function nextExerciseTargets(setData, opts = {}) {
  const repMin    = opts.repMin ?? 8;
  const repMax    = opts.repMax ?? 12;
  const equipment = opts.equipment ?? 'barbell';
  const defaultIncrement = opts.increment ?? 2.5;
  // Reps-only mode: bodyweight has no weight axis; pauseWeight deliberately
  // freezes a weighted exercise's load (limited plates / injury recovery) —
  // progression then comes from reps and, at the ceiling, added sets.
  const repsOnly  = equipment === 'bodyweight' || !!opts.pauseWeight;

  return setData.map(s => {
    const t  = s.target;
    const lg = s.logged;

    // Skipped or never logged → carry the current target forward unchanged.
    if (!lg || lg.skipped || lg.reps_done == null) {
      return { set_num: s.set_num, weight: t.weight, reps: t.reps };
    }

    const actualReps = lg.reps_done;

    // ── Reps-only axis (bodyweight or weight-paused) ────────────────────────
    if (repsOnly) {
      // Weight is frozen — bodyweight carries its target weight; a paused
      // weighted exercise stays at whatever load was actually used.
      const weight = equipment === 'bodyweight'
        ? t.weight
        : (lg.weight_used ?? t.weight ?? 0);
      let reps;
      if (actualReps >= repMax)           reps = repMax;                       // ceiling — caller may add a set
      else if (actualReps >= t.reps)      reps = Math.min(repMax, actualReps + 1);
      else                                 reps = t.reps;                       // hold
      return { set_num: s.set_num, weight, reps };
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
    // In range: compare against the target re-scaled for the weight actually
    // used. Hit/beat it → add a rep. Beyond the ±15% band there is no
    // comparable target, so climb from the logged performance regardless.
    const cmp = weightAdjustedTarget(t, lg.weight_used, { repMin, repMax });
    if (!cmp.inBand || actualReps >= cmp.reps) {
      return { set_num: s.set_num, weight: baseW, reps: Math.min(repMax, actualReps + 1) };
    }
    // Fell short of the (weight-adjusted) target but stayed in range → hold.
    return { set_num: s.set_num, weight: baseW, reps: cmp.reps };
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
