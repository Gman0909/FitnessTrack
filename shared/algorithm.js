// ── Dynamic double progression ────────────────────────────────────────────────
//
// Each set is its own progression track: a (weight, reps) target bounded by the
// exercise's rep range [repMin, repMax]. The next target is derived purely from
// how the user's *actual* logged performance compared to the target they were
// given — no subjective check-ins.
//
//   actual_reps >= repMax              → weight bump: weight + increment, reps → repMin
//   target_reps <= actual_reps < repMax → rep progress: reps → min(repMax, actual + step)
//   repMin <= actual_reps < target_reps → hold: same weight, reps → logged reps (beat it to advance)
//   actual_reps < repMin                → ease off — but only on the 2nd straight
//                                          sub-floor session (priorFloorMiss); a
//                                          single bad day holds and re-attempts.
//   skipped / not logged                → unchanged
//
// When the weight actually used differs from the target's, the comparison
// target is first re-scaled to preserve volume (see weightAdjustedTarget).
// Beyond a ±15% weight deviation there is no comparable target, so the set
// simply climbs from the logged performance.
//
// Per-set independence gives the "dynamic" pattern from double-progression
// training, but a descending-weight clamp keeps the profile coherent: no set is
// ever prescribed heavier than the set before it (the limiting set gates load).
//
// Adaptive tempo (opts.tempo, derived objectively from recent sessions): `fast`
// climbs +2 reps and bumps with a larger increment; `slow` micro-steps the
// weight; `normal` is standard +1 / standard increment.
//
// Bodyweight exercises have no weight axis — reps climb toward repMax and hold
// there; a set short of its target holds at the logged reps (beat it to advance),
// mirroring the weighted path. The caller adds a set when every set hits ceiling.

// Increment = the exercise's default, scaled by the adaptive-tempo factor
// (fast > 1, slow < 1), then capped at 10% of the working weight (safety) and
// at the largest of 10%/1.25 kg so light isolation lifts still progress.
function effectiveIncrement(weight, defaultIncrement, factor = 1) {
  return Math.min(defaultIncrement * factor, Math.max(weight * 0.10, 1.25));
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
// opts: { repMin, repMax, increment, equipment, pauseWeight, weightCapKg, tempo }
//   weightCapKg: optional kg ceiling — weighted progression climbs up to but never
//   past it (a paused exercise's cap). A set pinned at the cap holds at repMax
//   rather than resetting reps. null/undefined = no cap.
//   tempo: 'fast' | 'normal' | 'slow' (default 'normal') — see header.
// Each setData element may also carry priorFloorMiss: true when the set's
// previous logged session was already below repMin (drives the 2-strike deload).
// Returns: Array of { set_num, weight, reps } — the next session's per-set target.
export function nextExerciseTargets(setData, opts = {}) {
  const repMin    = opts.repMin ?? 8;
  const repMax    = opts.repMax ?? 12;
  const equipment = opts.equipment ?? 'barbell';
  const defaultIncrement = opts.increment ?? 2.5;
  // Optional weight ceiling (kg): weighted progression climbs up to it, never past.
  const weightCap = opts.weightCapKg ?? null;
  // Reps-only mode: bodyweight has no weight axis; pauseWeight deliberately
  // freezes a weighted exercise's load (limited plates / injury recovery) —
  // progression then comes from reps and, at the ceiling, added sets.
  const repsOnly  = equipment === 'bodyweight' || !!opts.pauseWeight;

  // Adaptive tempo → how big a rep step on a climb, and how the bump/deload
  // increment is scaled (then re-capped at 10% inside effectiveIncrement).
  const tempo     = opts.tempo ?? 'normal';
  const repStep   = tempo === 'fast' ? 2 : 1;
  const incFactor = tempo === 'fast' ? 1.5 : tempo === 'slow' ? 0.5 : 1;

  // Reps logged above repMax on one set spill into the next (repsOnly only).
  // Skipped sets carry the overflow forward without consuming it.
  let overflow = 0;
  const out = setData.map(s => {
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
      const effActual = actualReps + overflow;
      overflow = Math.max(0, effActual - repMax);
      let reps;
      if (effActual >= repMax)           reps = repMax;                       // ceiling — caller may add a set
      else if (effActual >= t.reps)      reps = Math.min(repMax, effActual + repStep);
      else                               reps = Math.max(repMin, effActual);  // short → hold at logged reps (beat it to advance)
      return { set_num: s.set_num, weight, reps };
    }

    // ── Weighted: double progression ────────────────────────────────────────
    const baseW = lg.weight_used ?? t.weight ?? 0;
    const incr  = effectiveIncrement(baseW, defaultIncrement, incFactor);

    // Reached/passed the ceiling → bump weight, reset reps to the floor. With a
    // weight cap, the bump is clamped: if it produces a real increase (toward the
    // cap) reps reset as usual; once pinned at the cap there's nowhere to go, so
    // hold at repMax instead of pointlessly resetting reps.
    if (actualReps >= repMax) {
      const bumped = Math.max(roundToHalf(baseW + incr), 0.5);
      const w = weightCap == null ? bumped : Math.min(bumped, weightCap);
      if (w > baseW + 0.001) return { set_num: s.set_num, weight: w, reps: repMin };
      return { set_num: s.set_num, weight: baseW, reps: repMax };
    }
    // Couldn't reach the floor → ease off, but only on the SECOND straight
    // sub-floor session; a single bad day holds the weight and re-attempts.
    if (actualReps < repMin) {
      if (s.priorFloorMiss)
        return { set_num: s.set_num, weight: Math.max(roundToHalf(baseW - incr), 0.5), reps: repMin };
      return { set_num: s.set_num, weight: baseW, reps: repMin };
    }
    // In range: use volume (kg×reps) to decide progress vs hold so that weight
    // deviations are correctly accounted for — logging heavier for same reps
    // is a beat, logging lighter for same reps is a miss, regardless of how
    // the adjusted rep count rounds. Beyond ±15% there is no comparable target;
    // climb from the logged performance regardless.
    const cmp = weightAdjustedTarget(t, lg.weight_used, { repMin, repMax });
    if (!cmp.inBand) {
      return { set_num: s.set_num, weight: baseW, reps: Math.min(repMax, actualReps + repStep) };
    }
    if (t.weight != null && t.weight > 0 && baseW > 0) {
      const targetVol = t.weight * t.reps;
      const actualVol = baseW * actualReps;
      if (actualVol >= targetVol - 0.01) {
        return { set_num: s.set_num, weight: baseW, reps: Math.min(repMax, actualReps + repStep) };
      }
      // Short of the volume goal → hold exactly what was logged: same weight
      // (already baseW = what was used), reps → logged reps. The set must be
      // beaten before its target moves, so a missed target is never re-issued
      // as the next ask (which would prescribe a jump up from a worse result).
      return { set_num: s.set_num, weight: baseW, reps: Math.max(repMin, Math.min(repMax, actualReps)) };
    }
    // No target weight (bootstrap) → compare against the rep target directly;
    // short of it, hold at the logged reps (consistent with the weighted path).
    if (actualReps >= cmp.reps) {
      return { set_num: s.set_num, weight: baseW, reps: Math.min(repMax, actualReps + repStep) };
    }
    return { set_num: s.set_num, weight: baseW, reps: Math.max(repMin, Math.min(repMax, actualReps)) };
  });

  // Descending-weight clamp (weighted only): no set may be prescribed heavier
  // than the set before it. A set that earned a bump it can't take yet (an
  // earlier set is still lighter) parks at the ceiling of the capped weight and
  // waits for that limiting set to catch up — then they bump together.
  if (!repsOnly) {
    for (let i = 1; i < out.length; i++) {
      const prevW = out[i - 1].weight, curW = out[i].weight;
      if (prevW != null && curW != null && curW > prevW + 0.001)
        out[i] = { set_num: out[i].set_num, weight: prevW, reps: repMax };
    }
  }
  return out;
}

// Per-set comparison of actual vs target, for the UI feedback glyph.
// Returns 'up' (beat target / ceiling), 'met' (hit target), or 'down' (short).
export function setPerformance(targetReps, actualReps) {
  if (actualReps == null) return null;
  if (actualReps > targetReps)  return 'up';
  if (actualReps === targetReps) return 'met';
  return 'down';
}
