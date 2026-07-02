// Week-on-week per-lift verdict for the post-workout recap. Pure.
//
// Aggregates are { topW, vol, reps } — heaviest set weight, total volume
// (Σ weight × reps), and total reps — for this week's session and the prior
// comparable one (`prev` is null when there's no comparable history yet).
//
//   weight went up                     → 'up'    (heavier — progress even if reps reset)
//   weight went down                   → 'eased' (a deload; the algorithm easing off)
//   same weight, more volume           → 'up'    (more reps)
//   same weight, less volume           → 'down'  (an off day on this lift)
//   same weight, ~equal volume         → 'held'
//   no comparable prior session        → 'new'
//
// Bodyweight has no weight axis, so it compares reps only (up / down / held).
export function liftVerdict(thisAgg, prev, { isBodyweight = false } = {}) {
  if (!prev) return 'new';

  if (isBodyweight) {
    if (thisAgg.reps > prev.reps) return 'up';
    if (thisAgg.reps < prev.reps) return 'down';
    return 'held';
  }

  const dW = thisAgg.topW - prev.topW;
  if (dW >  0.05) return 'up';
  if (dW < -0.05) return 'eased';
  if (thisAgg.vol > prev.vol * 1.01) return 'up';
  if (thisAgg.vol < prev.vol * 0.99) return 'down';
  return 'held';
}

// A week-on-week 'up' can still mask a session where every set fell short of
// the target the algorithm prescribed — targets climbed faster than the lifter,
// yet this week still edged out last week's actuals. When that happens, cap the
// verdict at 'held' so the recap doesn't read as a clean win over a lift the
// workout card marked red (▼ vs target) on every set. Only 'up' is affected;
// 'eased'/'down'/'held'/'new' already reflect a non-winning or non-comparable
// state, so they pass through unchanged.
export function capVerdictToTargets(verdict, missedEveryTarget) {
  return verdict === 'up' && missedEveryTarget ? 'held' : verdict;
}

// Roll a list of verdicts into headline counts. `comparable` excludes 'new'
// lifts (nothing to compare), which is what "N of M up on last week" counts.
export function summarizeVerdicts(verdicts) {
  const c = { up: 0, held: 0, down: 0, eased: 0, new: 0 };
  for (const v of verdicts) c[v] = (c[v] ?? 0) + 1;
  const comparable = c.up + c.held + c.down + c.eased;
  return { ...c, comparable, total: comparable + c.new };
}
