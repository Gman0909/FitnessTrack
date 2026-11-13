// Estimated one-rep max (Epley): weight × (1 + reps / 30); a single is its own
// 1RM. Puts sets in different rep ranges on one strength scale, so progress
// shows even when a weight bump resets reps. Least reliable past ~12 reps.
// The SQL in GET /sessions/history mirrors this formula — keep them in sync.
export function estimateOneRepMax(weight, reps) {
  if (!(weight > 0) || !Number.isInteger(reps) || reps < 1) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}
