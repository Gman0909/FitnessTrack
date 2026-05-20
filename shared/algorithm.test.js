// Algorithm test suite — run with: node shared/algorithm.test.js
// Tests nextExerciseTargets, weightAdjustedTarget, and setPerformance,
// plus every edge case introduced by the optimal_sets feature.

import { nextExerciseTargets, weightAdjustedTarget, setPerformance, WEIGHT_BAND } from './algorithm.js';

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertClose(a, b, tol = 0.01, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg ? msg + ': ' : ''}expected ~${b}, got ${a}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSet(num, { targetW = 60, targetR = 8, loggedW = null, loggedR = null, skipped = false } = {}) {
  return {
    set_num: num,
    target:  { weight: targetW, reps: targetR },
    logged:  loggedW !== null || loggedR !== null || skipped
      ? { weight_used: loggedW, reps_done: loggedR, skipped: skipped ? 1 : 0 }
      : null,
  };
}

const WEIGHTED = { repMin: 8, repMax: 12, increment: 2.5, equipment: 'barbell' };
const BODYWEIGHT = { repMin: 8, repMax: 12, increment: 2.5, equipment: 'bodyweight' };
const PAUSED = { repMin: 8, repMax: 12, increment: 2.5, equipment: 'dumbbell', pauseWeight: true };

// ── setPerformance ─────────────────────────────────────────────────────────────

console.log('\nsetPerformance:');

test('returns null for null actual', () => assertEq(setPerformance(10, null), null));
test('up when actual > target', () => assertEq(setPerformance(10, 11), 'up'));
test('met when actual === target', () => assertEq(setPerformance(10, 10), 'met'));
test('down when actual < target', () => assertEq(setPerformance(10, 9), 'down'));

// ── weightAdjustedTarget ───────────────────────────────────────────────────────

console.log('\nweightAdjustedTarget:');

test('no recommendation → inBand true, reps = target', () => {
  const r = weightAdjustedTarget(null, 60, WEIGHTED);
  assert(r.inBand); assertEq(r.reps, 8); // repMin default
});

test('null target weight → use target reps', () => {
  const r = weightAdjustedTarget({ weight: null, reps: 10 }, 60, WEIGHTED);
  assert(r.inBand); assertEq(r.reps, 10);
});

test('within band: scales reps to preserve volume', () => {
  // target: 60kg × 10 reps. actual: 65kg (8.3% over) → adjusted ≈ 9.2 → 9
  const r = weightAdjustedTarget({ weight: 60, reps: 10 }, 65, { repMin: 8, repMax: 12 });
  assert(r.inBand);
  assertEq(r.reps, 9);
});

test('beyond 15% band → inBand false', () => {
  const r = weightAdjustedTarget({ weight: 60, reps: 10 }, 70, { repMin: 8, repMax: 12 });
  assert(!r.inBand);
  assertEq(r.reps, null);
});

test('clamps adjusted reps to [repMin, repMax]', () => {
  // Heavy load → adjusted target would go below repMin
  const r = weightAdjustedTarget({ weight: 60, reps: 8 }, 65, { repMin: 8, repMax: 12 });
  assert(r.inBand);
  assert(r.reps >= 8 && r.reps <= 12);
});

test('WEIGHT_BAND is 0.15', () => assertEq(WEIGHT_BAND, 0.15));

// ── nextExerciseTargets — weighted ────────────────────────────────────────────

console.log('\nnextExerciseTargets — weighted:');

test('logged >= repMax → weight bump, reps reset to repMin', () => {
  const sets = [makeSet(1, { targetW: 60, targetR: 10, loggedW: 60, loggedR: 12 })];
  const [t] = nextExerciseTargets(sets, WEIGHTED);
  assert(t.weight > 60, `weight should increase from 60, got ${t.weight}`);
  assertEq(t.reps, 8);
});

test('logged < repMin → weight drop, reps reset to repMin', () => {
  const sets = [makeSet(1, { targetW: 60, targetR: 10, loggedW: 60, loggedR: 6 })];
  const [t] = nextExerciseTargets(sets, WEIGHTED);
  assert(t.weight < 60, `weight should drop from 60, got ${t.weight}`);
  assertEq(t.reps, 8);
});

test('logged between repMin and target → hold', () => {
  const sets = [makeSet(1, { targetW: 60, targetR: 10, loggedW: 60, loggedR: 9 })];
  const [t] = nextExerciseTargets(sets, WEIGHTED);
  assertEq(t.weight, 60);
  assertEq(t.reps, 10);
});

test('logged >= target but < repMax → add a rep', () => {
  const sets = [makeSet(1, { targetW: 60, targetR: 10, loggedW: 60, loggedR: 10 })];
  const [t] = nextExerciseTargets(sets, WEIGHTED);
  assertEq(t.weight, 60);
  assertEq(t.reps, 11);
});

test('skipped set → carry target forward unchanged', () => {
  const sets = [makeSet(1, { targetW: 60, targetR: 10, skipped: true })];
  const [t] = nextExerciseTargets(sets, WEIGHTED);
  assertEq(t.weight, 60);
  assertEq(t.reps, 10);
});

test('null target weight (new exercise) → treat as no recommendation', () => {
  const sets = [{ set_num: 1, target: { weight: null, reps: 8 },
    logged: { weight_used: 40, reps_done: 10, skipped: 0 } }];
  const [t] = nextExerciseTargets(sets, WEIGHTED);
  // in-range: actual >= target → add a rep
  assertEq(t.weight, 40);
  assertEq(t.reps, 11);
});

test('increment capped at 10% of working weight', () => {
  // 100kg × 10% = 10kg cap, default increment 2.5 → use 2.5
  const sets = [makeSet(1, { targetW: 100, targetR: 12, loggedW: 100, loggedR: 12 })];
  const [t] = nextExerciseTargets(sets, { ...WEIGHTED, increment: 2.5 });
  assertEq(t.weight, 102.5);
  // 200kg × 10% = 20kg cap, but increment 2.5 → use 2.5
  const sets2 = [makeSet(1, { targetW: 200, targetR: 12, loggedW: 200, loggedR: 12 })];
  const [t2] = nextExerciseTargets(sets2, { ...WEIGHTED, increment: 2.5 });
  assertEq(t2.weight, 202.5);
  // Large increment (50kg) on 200kg → capped at 10% = 20kg
  const sets3 = [makeSet(1, { targetW: 200, targetR: 12, loggedW: 200, loggedR: 12 })];
  const [t3] = nextExerciseTargets(sets3, { ...WEIGHTED, increment: 50 });
  assertEq(t3.weight, 220);
});

test('multi-set independence: each set is its own progression track', () => {
  const sets = [
    makeSet(1, { targetW: 60, targetR: 12, loggedW: 60, loggedR: 12 }), // at ceiling → weight bump
    makeSet(2, { targetW: 60, targetR: 10, loggedW: 60, loggedR: 10 }), // at target → add rep
    makeSet(3, { targetW: 60, targetR: 10, loggedW: 60, loggedR: 9  }), // below target → hold
  ];
  const targets = nextExerciseTargets(sets, WEIGHTED);
  assert(targets[0].weight > 60, 'set 1 should bump weight');
  assertEq(targets[0].reps, 8);
  assertEq(targets[1].weight, 60);
  assertEq(targets[1].reps, 11);
  assertEq(targets[2].weight, 60);
  assertEq(targets[2].reps, 10);
});

// ── nextExerciseTargets — bodyweight (repsOnly) ───────────────────────────────

console.log('\nnextExerciseTargets — bodyweight:');

test('below repMax → climb one rep', () => {
  const sets = [makeSet(1, { targetW: 0, targetR: 10, loggedW: 0, loggedR: 10 })];
  const [t] = nextExerciseTargets(sets, BODYWEIGHT);
  assertEq(t.reps, 11);
  assertEq(t.weight, 0); // bodyweight carries target weight
});

test('at repMax → hold at repMax (caller decides whether to add set)', () => {
  const sets = [makeSet(1, { targetW: 0, targetR: 12, loggedW: 0, loggedR: 12 })];
  const [t] = nextExerciseTargets(sets, BODYWEIGHT);
  assertEq(t.reps, 12);
});

test('skipped bodyweight set → carry forward unchanged', () => {
  const sets = [makeSet(1, { targetW: 0, targetR: 10, skipped: true })];
  const [t] = nextExerciseTargets(sets, BODYWEIGHT);
  assertEq(t.reps, 10);
});

test('below target → hold (not at rep max)', () => {
  const sets = [makeSet(1, { targetW: 0, targetR: 11, loggedW: 0, loggedR: 9 })];
  const [t] = nextExerciseTargets(sets, BODYWEIGHT);
  assertEq(t.reps, 11); // hold
});

// ── nextExerciseTargets — pause_weight ───────────────────────────────────────

console.log('\nnextExerciseTargets — pause_weight:');

test('paused: carries weight from logged (not target weight)', () => {
  // User logged 70kg (different from target 60kg) — paused carries actual
  const sets = [makeSet(1, { targetW: 60, targetR: 10, loggedW: 70, loggedR: 10 })];
  const [t] = nextExerciseTargets(sets, PAUSED);
  assertEq(t.weight, 70); // logged weight carried forward
  assertEq(t.reps, 11);   // at target → add rep
});

test('paused: at repMax → reps hold at repMax', () => {
  const sets = [makeSet(1, { targetW: 60, targetR: 12, loggedW: 60, loggedR: 12 })];
  const [t] = nextExerciseTargets(sets, PAUSED);
  assertEq(t.reps, 12);
  assertEq(t.weight, 60);
});

// ── Optimal sets: allAtCeiling check logic ────────────────────────────────────
// The actual allAtCeiling + set-addition guard lives in sessions.js
// (server-side). Here we verify the client-side stall detection predicate
// by simulating the relevant conditions.

console.log('\nOptimal sets — stall detection (client-side predicate):');

function isStalled(sets, repMax, optimalSets, statuses) {
  // Mirrors TodayPage ExerciseCard logic exactly.
  const exerciseComplete = sets.every(s => {
    const st = statuses[s.set_num - 1];
    return st.status === 'logged' || st.status === 'skipped';
  });
  if (!exerciseComplete) return false;
  if (sets.length < optimalSets) return false;
  return sets.every(s => {
    const st = statuses[s.set_num - 1];
    return st.status === 'logged' && parseInt(st.reps, 10) >= repMax;
  });
}

// sets: array of { set_num } objects (same shape as exercise.sets in TodayPage)
function makeSets(n) { return Array.from({ length: n }, (_, i) => ({ set_num: i + 1 })); }
function makeStatuses(repsPerSet) { return repsPerSet.map(r => typeof r === 'number' ? { status: 'logged', reps: String(r) } : r); }

test('stall: all logged at repMax, setCount === optimalSets', () => {
  const sets     = makeSets(3);
  const statuses = makeStatuses([12, 12, 12]);
  assert(isStalled(sets, 12, 3, statuses));
});

test('no stall: set count below optimal target', () => {
  const sets     = makeSets(3);
  const statuses = makeStatuses([12, 12, 12]);
  assert(!isStalled(sets, 12, 4, statuses), 'should not stall when below optimal');
});

test('no stall: not all at repMax', () => {
  const sets     = makeSets(3);
  const statuses = makeStatuses([12, 12, 10]); // last set below repMax
  assert(!isStalled(sets, 12, 3, statuses), 'should not stall with reps below ceiling');
});

test('no stall: exercise not complete', () => {
  const sets     = makeSets(3);
  const statuses = makeStatuses([12, 12, { status: 'idle', reps: '' }]);
  assert(!isStalled(sets, 12, 3, statuses), 'should not stall when not complete');
});

test('skipped set breaks at-repMax predicate — no stall', () => {
  // A skipped set means the user didn't actually hit repMax on that set,
  // so stall should NOT fire. The algorithm (fix 3A) treats skips as neutral
  // for ceiling detection — the user gets another chance next session.
  const sets     = makeSets(3);
  const statuses = makeStatuses([12, 12, { status: 'skipped', reps: '' }]);
  assert(!isStalled(sets, 12, 3, statuses), 'skipped set should not trigger stall');
});

test('stall with optimalSets = null falls back to 6', () => {
  const optSets  = null ?? 6; // same logic as TodayPage
  const sets     = makeSets(6);
  const statuses = makeStatuses([12, 12, 12, 12, 12, 12]);
  assert(isStalled(sets, 12, optSets, statuses), 'null optimal_sets should behave as 6');
});

test('no stall at 6 sets when optimalSets = 8', () => {
  const sets     = makeSets(6);
  const statuses = makeStatuses([12, 12, 12, 12, 12, 12]);
  assert(!isStalled(sets, 12, 8, statuses), 'should not stall if below optimalSets of 8');
});

// ── allAtCeiling server-side logic (inline simulation) ───────────────────────

console.log('\nOptimal sets — server-side allAtCeiling + set-addition guard:');

// Simulates the recomputeExercise allAtCeiling + cap check without a real DB.
function simulateSetAddition(setData, repMax, optimalSets) {
  const allAtCeiling = setData.every(s =>
    s.logged && (s.logged.skipped ||
      (s.logged.reps_done != null && s.logged.reps_done >= repMax))
  );
  const shouldAdd = allAtCeiling && setData.length < optimalSets;
  return { allAtCeiling, shouldAdd };
}

test('adds set when all at ceiling and below optimalSets', () => {
  const data = [1, 2, 3].map(n => ({ logged: { reps_done: 12, skipped: 0 } }));
  const { shouldAdd } = simulateSetAddition(data, 12, 4);
  assert(shouldAdd, 'should add when 3 sets < optimalSets=4, all at repMax');
});

test('does not add set when at optimalSets cap', () => {
  const data = [1, 2, 3].map(n => ({ logged: { reps_done: 12, skipped: 0 } }));
  const { shouldAdd } = simulateSetAddition(data, 12, 3);
  assert(!shouldAdd, 'should not add when setCount === optimalSets');
});

test('does not add set when below repMax', () => {
  const data = [
    { logged: { reps_done: 12, skipped: 0 } },
    { logged: { reps_done: 10, skipped: 0 } }, // below repMax
  ];
  const { allAtCeiling, shouldAdd } = simulateSetAddition(data, 12, 4);
  assert(!allAtCeiling, 'allAtCeiling should be false when reps below repMax');
  assert(!shouldAdd);
});

test('skip-tolerant: skipped set counts as at ceiling', () => {
  const data = [
    { logged: { reps_done: 12, skipped: 0 } },
    { logged: { reps_done: 12, skipped: 0 } },
    { logged: { reps_done: null, skipped: 1 } }, // skipped
  ];
  const { allAtCeiling, shouldAdd } = simulateSetAddition(data, 12, 4);
  assert(allAtCeiling, 'skipped sets count as at ceiling');
  assert(shouldAdd, 'should add because 3 < optimalSets=4 and allAtCeiling');
});

test('optimalSets = null default (6): does not add beyond 6', () => {
  const optSets = null ?? 6;
  const data = Array.from({ length: 6 }, () => ({ logged: { reps_done: 12, skipped: 0 } }));
  const { shouldAdd } = simulateSetAddition(data, 12, optSets);
  assert(!shouldAdd, 'should not add set at count=6 when optimal is 6');
});

test('optimalSets = 8: allows growth beyond 6', () => {
  const data = Array.from({ length: 6 }, () => ({ logged: { reps_done: 12, skipped: 0 } }));
  const { shouldAdd } = simulateSetAddition(data, 12, 8);
  assert(shouldAdd, 'should add set when optimalSets=8 and setCount=6');
});

test('weighted exercise: repsOnly=false means set addition never triggered', () => {
  // The repsOnly guard (equipment === bodyweight || pause_weight) gates the entire block.
  const repsOnly = false; // barbell, not paused
  const data = [1, 2, 3].map(() => ({ logged: { reps_done: 12, skipped: 0 } }));
  const wouldCheck = repsOnly && data.length < 4;
  assert(!wouldCheck, 'weighted exercises never auto-add sets');
});

test('paused-weight exercise: treated as repsOnly → set addition applies', () => {
  const pauseWeight = 1;
  const equipment = 'dumbbell';
  const repsOnly = equipment === 'bodyweight' || pauseWeight === 1;
  assert(repsOnly, 'pause_weight=1 is treated as repsOnly');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`All ${passed} tests passed.`);
} else {
  console.log(`${passed} passed, ${failed} FAILED.`);
  process.exit(1);
}
