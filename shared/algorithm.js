export function computeCheckinModifier({ pain, recovery, pump }) {
  const painScore    = { none: 0, low: -1, medium: -2, high: -3 }[pain] ?? 0;
  const recovScore   = { still_sore: -1, just_in_time: 0, healed: 1, never_sore: 1 }[recovery] ?? 0;
  const pumpScore    = { poor: 1, ok: 0, great: 0 }[pump] ?? 0;
  return painScore + recovScore + pumpScore;
}

export function nextSetTarget(currentTarget, loggedSet, modifier = 0) {
  const { weight, reps, increment = 2.5, equipment } = currentTarget;

  if (loggedSet.skipped) return { weight, reps };

  const repsDone = loggedSet.reps_done;

  if (equipment === 'bodyweight') {
    // Rep-only progression — no weight changes, no upper cap
    const nextReps = repsDone < reps - 1 ? reps : reps + 1;
    return { weight, reps: Math.max(1, Math.round(nextReps + modifier)) };
  }

  let nextWeight = weight;
  let nextReps;

  if (repsDone >= 12) {
    nextWeight = weight + increment;
    nextReps = Math.ceil((weight * reps) / nextWeight);
  } else if (repsDone < reps - 1) {
    nextReps = reps;
  } else {
    nextReps = reps + 1;
  }

  nextReps = Math.round(nextReps + modifier);

  if (nextReps > 12) {
    const vol = nextWeight * nextReps;
    nextWeight += increment;
    nextReps = Math.ceil(vol / nextWeight);
  }

  nextReps = Math.max(6, Math.min(12, nextReps));

  return { weight: nextWeight, reps: nextReps };
}
