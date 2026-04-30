const REP_RANGE_PRESETS = {
  powerlifting: { min: 5,  max: 8  },
  standard:     { min: 8,  max: 12 },
  volume:       { min: 12, max: 15 },
};

const AGGRESSIVENESS_MULTIPLIER = {
  conservative: 0.5,
  moderate:     1.0,
  aggressive:   1.5,
};

// Cap increment at 10% of working weight; floor at 1.25 kg (smallest real plate)
function effectiveIncrement(weight, defaultIncrement) {
  return Math.min(defaultIncrement, Math.max(weight * 0.10, 1.25));
}

function roundToIncrement(value, incr) {
  return Math.round(value / incr) * incr;
}

// Returns a numeric modifier, or null when pain is high (= hold, no progression)
export function computeCheckinModifier({ pain, recovery, pump, intensity }) {
  if (pain === 'high') return null;
  const painScore   = { none: 0, low: -1, medium: -2 }[pain] ?? 0;
  const recovScore  = { still_sore: -1, just_in_time: 0, healed: 0, never_sore: 1 }[recovery] ?? 0;
  const pumpScore   = { poor: 1, ok: 0, great: 0 }[pump] ?? 0;
  const intensScore = { too_easy: 2, just_right: 0, too_much: -2 }[intensity] ?? 0;
  return painScore + recovScore + pumpScore + intensScore;
}

// ── Exercise-level progression ────────────────────────────────────────────────
//
// setData: Array of { set_num, target: { weight, reps, increment, equipment }, logged: { weight_used, reps_done, skipped } }
// Returns: Array of { set_num, weight, reps }
//
// Key behaviours:
//   - Uses weight_used (actual loaded weight) as the base, falling back to target.weight
//   - Heaviest active set drives the weight-bump decision (hit REP_MAX → bump)
//   - Worst-performing set drives the reps/hold decision (most conservative)
//   - Weight changes are applied proportionally across all sets to preserve pyramid/drop structure
//   - Weights rounded to nearest 0.5 kg
//   - Aggressiveness multiplier applied to positive modifier signals only
//
export function nextExerciseTargets(setData, modifier, {
  pauseWeight    = false,
  pain           = 'none',
  repRange       = 'standard',
  aggressiveness = 'moderate',
} = {}) {
  // High pain: hold everything unchanged
  if (modifier === null) {
    return setData.map(s => ({ set_num: s.set_num, weight: s.target.weight, reps: s.target.reps }));
  }

  const equipment        = setData[0]?.target?.equipment ?? 'barbell';
  const defaultIncrement = setData[0]?.target?.increment ?? 2.5;

  // Amplify positive modifier by aggressiveness; negative signals always at full strength
  const mult        = AGGRESSIVENESS_MULTIPLIER[aggressiveness] ?? 1.0;
  const ampModifier = modifier > 0 ? Math.round(modifier * mult) : modifier;

  // Active sets: not skipped, reps logged
  const activeSets = setData.filter(s => !s.logged.skipped && s.logged.reps_done != null);

  // All skipped: hold
  if (activeSets.length === 0) {
    return setData.map(s => ({ set_num: s.set_num, weight: s.target.weight, reps: s.target.reps }));
  }

  // ── Bodyweight: per-set reps only, no weight axis ─────────────────────────
  if (equipment === 'bodyweight') {
    if (modifier <= -3) {
      return setData.map(s => ({
        set_num: s.set_num, weight: s.target.weight,
        reps: Math.max(1, s.target.reps - 3),
      }));
    }
    return setData.map(s => {
      if (s.logged.skipped || s.logged.reps_done == null)
        return { set_num: s.set_num, weight: s.target.weight, reps: s.target.reps };
      const next = s.logged.reps_done < s.target.reps - 1 ? s.target.reps : s.target.reps + 1;
      return { set_num: s.set_num, weight: s.target.weight, reps: Math.max(1, Math.round(next + ampModifier)) };
    });
  }

  const { min: REP_MIN, max: REP_MAX } = REP_RANGE_PRESETS[repRange] ?? REP_RANGE_PRESETS.standard;

  // Reference set: heaviest weight actually loaded
  const refSet    = activeSets.reduce((best, s) => {
    const w = s.logged.weight_used ?? s.target.weight;
    return w > (best.logged.weight_used ?? best.target.weight) ? s : best;
  }, activeSets[0]);
  const refWeight = refSet.logged.weight_used ?? refSet.target.weight;
  const incr      = effectiveIncrement(refWeight, defaultIncrement);

  // Deload: raw (unscaled) fatigue signals overwhelming
  if (modifier <= -3) {
    return setData.map(s => {
      if (pauseWeight) return { set_num: s.set_num, weight: s.target.weight, reps: REP_MIN };
      const base = s.logged.weight_used ?? s.target.weight;
      return { set_num: s.set_num, weight: Math.max(roundToIncrement(base * 0.90, 0.5), 0.5), reps: REP_MIN };
    });
  }

  const weightBlocked = pauseWeight || pain === 'medium';

  // Worst-performing set: most negative margin (reps_done − target_reps)
  const worstSet = activeSets.reduce((worst, s) => {
    const margin = s.logged.reps_done - s.target.reps;
    return margin < (worst.logged.reps_done - worst.target.reps) ? s : worst;
  }, activeSets[0]);

  const significantMiss = worstSet.logged.reps_done < worstSet.target.reps - 1;
  const hitCeiling      = refSet.logged.reps_done >= REP_MAX;

  // Base decision
  let weightRatio = 1.0;
  let repsChange  = 0;

  if (!weightBlocked && hitCeiling) {
    // Working set hit the ceiling: bump weight, recalculate reps to preserve volume
    const newRef    = refWeight + incr;
    weightRatio     = newRef / refWeight;
    repsChange      = Math.ceil((refWeight * refSet.target.reps) / newRef) - refSet.target.reps;
  } else if (significantMiss) {
    repsChange = 0; // hold
  } else {
    repsChange = 1; // standard +1 rep
  }

  // Apply amplified modifier
  let totalRepsChange = Math.round(repsChange + ampModifier);

  // Cascade: if modifier pushed reps over ceiling without a weight bump, trigger one
  if (!weightBlocked && weightRatio === 1.0 && !significantMiss) {
    const projectedReps = refSet.target.reps + totalRepsChange;
    if (projectedReps > REP_MAX) {
      const vol       = refWeight * projectedReps;
      const newRef    = refWeight + incr;
      weightRatio     = newRef / refWeight;
      totalRepsChange = Math.ceil(vol / newRef) - refSet.target.reps;
    }
  }

  // Apply proportionally to all sets
  return setData.map(s => {
    // Base weight: actual weight used, or current target for skipped sets
    const baseW = (s.logged.skipped || s.logged.weight_used == null)
      ? s.target.weight
      : s.logged.weight_used;

    const newWeight = (weightBlocked || weightRatio === 1.0)
      ? baseW
      : Math.max(roundToIncrement(baseW * weightRatio, 0.5), 0.5);

    const newReps = Math.max(REP_MIN, Math.min(REP_MAX, s.target.reps + totalRepsChange));

    return { set_num: s.set_num, weight: newWeight, reps: newReps };
  });
}

// ── Legacy single-set target (kept for reference / tests) ────────────────────
export function nextSetTarget(currentTarget, loggedSet, modifier = 0, {
  pauseWeight    = false,
  pain           = 'none',
  repRange       = 'standard',
  aggressiveness = 'moderate',
} = {}) {
  return nextExerciseTargets(
    [{ set_num: currentTarget.set_num ?? 1, target: currentTarget, logged: loggedSet }],
    modifier,
    { pauseWeight, pain, repRange, aggressiveness },
  )[0] ?? { weight: currentTarget.weight, reps: currentTarget.reps };
}
