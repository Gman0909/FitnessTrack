// Deload suggestion — purely objective, built on the adaptive tempo signal.
//
// A lift is "slow" when its last two sessions both fell short of their target
// volume (see exerciseTempo in server/routes/sessions.js). One stalled lift is
// normal; when at least half of the lifts that have enough history are slow at
// the same time, accumulated fatigue is the likelier cause, and a lighter week
// usually restarts progress. The app only suggests it — nothing is changed.

export const DELOAD_MIN_LIFTS = 3;   // need this many judgeable lifts
export const DELOAD_SLOW_SHARE = 0.5;

// lifts: [{ name, tempo: 'fast'|'normal'|'slow', known: boolean }]
export function deloadAdvice(lifts) {
  const judged = lifts.filter(l => l.known);
  const slow   = judged.filter(l => l.tempo === 'slow');
  const suggest = judged.length >= DELOAD_MIN_LIFTS && slow.length / judged.length >= DELOAD_SLOW_SHARE;
  return { suggest, slow: slow.length, judged: judged.length, slow_lifts: slow.map(l => l.name) };
}
