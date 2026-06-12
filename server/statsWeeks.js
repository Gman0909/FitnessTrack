// Comparison-week selection for the muscle-group progression stat.
//
// The stat compares each muscle group's volume in the FIRST recorded week
// against the latest COMPLETED week. Weeks are Monday-anchored on the session
// date (same anchoring as the weekly-volume chart).
//
// "Completed" = either fully elapsed (its Monday is before the current calendar
// week's Monday), OR — for the current calendar week — fully TRAINED: every
// session in it is checked_in AND it has at least as many completed sessions as
// the most recent fully-elapsed week. That admits a week the user finished
// early (e.g. a Mon–Fri plan done on Friday) without waiting for the calendar
// week to end, while still excluding a week that's only part-done (fewer
// completed sessions than a normal week → the unlogged sessions are still due).
//
// Pure — no DB — so the (fiddly) boundary logic can be unit-tested directly.
//
//   weeks:       ascending array of week_start strings that have logged volume
//   cur:         current calendar week's Monday (week_start string)
//   sessByWeek:  Map<week_start, { total, done }> — session counts per week,
//                where `done` is the count of checked_in sessions
// Returns { firstWeek, lastWeek }; lastWeek is null when fewer than two
// completed weeks exist (nothing to compare).
export function selectProgressWeeks(weeks, cur, sessByWeek) {
  const elapsed     = weeks.filter(w => w < cur);
  const lastElapsed = elapsed.length ? elapsed[elapsed.length - 1] : null;

  const curSess      = sessByWeek.get(cur);
  const fullyTrained = !!curSess && curSess.total > 0 && curSess.done === curSess.total;
  const lastDone     = lastElapsed ? (sessByWeek.get(lastElapsed)?.done ?? 0) : 0;
  const includeCur   = weeks.includes(cur) && fullyTrained && curSess.done >= lastDone;

  const completed = includeCur ? [...elapsed, cur] : elapsed;
  return {
    firstWeek: completed[0] ?? null,
    lastWeek:  completed.length > 1 ? completed[completed.length - 1] : null,
  };
}
