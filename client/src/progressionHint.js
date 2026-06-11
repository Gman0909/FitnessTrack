// Progressive-overload hint for an in-progress exercise card: compares this
// session's per-set target against the user's last logged performance and
// returns { text, color } (or null when there's nothing meaningful to show).
//
// Pure — no React — so the (fiddly) logic can be unit-tested directly.
//
// Inputs:
//   sets:  [{ weight, reps, prev_weight, prev_reps }]  current target + last logged
//   repMin, repMax:  effective rep range (for clamping the target reps)
//   exerciseComplete: hint is hidden once every set is logged/skipped
//   isBodyweight: reps-only comparison (no weight axis)
//   unit: 'kg' | 'lbs' — display unit for the weight delta
export function computeProgressionHint({ sets, repMin, repMax, exerciseComplete, isBodyweight, unit }) {
  if (exerciseComplete) return null;

  const matched = isBodyweight
    ? sets.filter(s => s.prev_reps != null)
    : sets.filter(s => s.prev_weight != null && s.prev_reps != null);
  if (matched.length === 0) return null;

  const fmtR = r => `${r > 0 ? '+' : '−'}${Math.abs(r)} rep${Math.abs(r) !== 1 ? 's' : ''}`;

  // Reps-only hint — bodyweight fluctuates so a volume comparison is misleading.
  if (isBodyweight) {
    let curReps = 0, prevReps = 0;
    for (const s of matched) {
      curReps  += Math.max(repMin, Math.min(repMax, s.reps));
      prevReps += s.prev_reps;
    }
    // Algorithm-appended sets have no prior — they're pure added reps. Count
    // their target toward this session so the extra set surfaces in the hint.
    for (const s of sets) {
      if (s.prev_reps != null) continue;
      curReps += Math.max(repMin, Math.min(repMax, s.reps));
    }
    const repsDelta = curReps - prevReps;
    if (repsDelta === 0) return null;
    const arrow = repsDelta > 0 ? '▲' : '▼';
    const color = repsDelta > 0 ? 'var(--success)' : 'var(--danger)';
    return { text: `${arrow} ${fmtR(repsDelta)}`, color };
  }

  const toDisp = kg => unit === 'lbs' ? kg * 2.2046 : kg;
  let curVol = 0, prevVol = 0, curReps = 0, prevReps = 0;
  // The set with the largest absolute weight change drives the displayed weight
  // delta, so a deload (or bump) on ANY set is surfaced — not just the heaviest
  // previous set (which silently hid a deload on a lighter set).
  let mainSet = matched[0];
  let maxAbsWChange = Math.abs(toDisp(matched[0].weight) - toDisp(matched[0].prev_weight));
  for (const s of matched) {
    const tgtReps = Math.max(repMin, Math.min(repMax, s.reps));
    curVol   += toDisp(s.weight) * tgtReps;
    prevVol  += toDisp(s.prev_weight) * s.prev_reps;
    curReps  += tgtReps;
    prevReps += s.prev_reps;
    const change = Math.abs(toDisp(s.weight) - toDisp(s.prev_weight));
    if (change > maxAbsWChange) { maxAbsWChange = change; mainSet = s; }
  }
  // Algorithm-appended sets (no prior, e.g. a paused-weight exercise that
  // earned an extra set) are pure added volume — count their target toward
  // "current" only. They aren't a per-set weight change, so they don't drive
  // the weight delta; the positive volume/reps delta surfaces the added work.
  for (const s of sets) {
    if (s.prev_weight != null && s.prev_reps != null) continue;
    if (!(s.weight > 0)) continue;
    const tgtReps = Math.max(repMin, Math.min(repMax, s.reps));
    curVol  += toDisp(s.weight) * tgtReps;
    curReps += tgtReps;
  }
  const volDelta  = curVol - prevVol;
  const pct       = prevVol > 0 ? (volDelta / prevVol) * 100 : 0;
  const repsDelta = curReps - prevReps;
  const wDelta    = toDisp(mainSet.weight) - toDisp(mainSet.prev_weight);

  const hasW    = Math.abs(wDelta) >= 0.05;
  const hasReps = repsDelta !== 0;
  if (Math.abs(volDelta) <= 0.01 && !hasW && !hasReps) return null;

  const fmtW = w => {
    const abs = Math.abs(w);
    const num = abs < 1 ? abs.toFixed(1) : (abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1));
    return `${w > 0 ? '+' : '−'}${num} ${unit}`;
  };

  // A weight *increase* resets reps to repMin, which drags volume negative even
  // though it's progression — so the volume % is hidden only in that case. A
  // deload (weight down) or unchanged weight keeps the %; it reflects the real
  // net change, and the weight delta below makes the deload explicit.
  const weightUp   = hasW && wDelta > 0;
  // A deload reads as caution (amber ▼), never green — even if the +1 rep nudges
  // net volume positive, the load eased off and shouldn't look like progress.
  const weightDown = hasW && wDelta < 0;
  const arrow = weightUp ? '▲' : weightDown ? '▼'
              : volDelta > 0.01 ? '▲' : volDelta < -0.01 ? '▼' : '→';
  const color = weightUp ? 'var(--success)'
              : weightDown ? '#f0a030'
              : volDelta > 0.01 ? 'var(--success)'
              : volDelta < -0.01 ? 'var(--danger)'
              : 'var(--muted)';

  const parts = [];
  if (!weightUp) parts.push(`(${volDelta > 0 ? '+' : volDelta < 0 ? '−' : ''}${Math.abs(Math.round(pct))}%)`);
  if (hasW)      parts.push(fmtW(wDelta));
  if (hasReps)   parts.push(fmtR(repsDelta));

  return { text: `${arrow} ${parts.join(' ')}`, color };
}
