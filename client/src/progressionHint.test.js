// Progression-hint test suite — run with: node client/src/progressionHint.test.js
import { computeProgressionHint } from './progressionHint.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const base = { repMin: 8, repMax: 12, exerciseComplete: false, isBodyweight: false, unit: 'kg' };

console.log('\ncomputeProgressionHint:');

test('deload on one set is surfaced (the reported bug)', () => {
  // Y Raises W4D2: sets 1-2 flat, set 3 deloaded 15x7 -> 14x8. Range 8-15.
  const hint = computeProgressionHint({
    ...base, repMin: 8, repMax: 15,
    sets: [
      { weight: 15, reps: 10, prev_weight: 15, prev_reps: 10 },
      { weight: 15, reps: 12, prev_weight: 15, prev_reps: 12 },
      { weight: 14, reps: 8,  prev_weight: 15, prev_reps: 7  },
    ],
  });
  assertEq(hint.text, '▼ (+2%) −1 kg +1 rep');
  assertEq(hint.color, '#f0a030'); // deload reads as caution (amber), not green
});

test('uniform weight bump: hides %, shows weight + reps (unchanged behavior)', () => {
  const hint = computeProgressionHint({
    ...base,
    sets: [
      { weight: 62.5, reps: 8, prev_weight: 60, prev_reps: 12 },
      { weight: 62.5, reps: 8, prev_weight: 60, prev_reps: 12 },
      { weight: 62.5, reps: 8, prev_weight: 60, prev_reps: 12 },
    ],
  });
  assertEq(hint.text, '▲ +2.5 kg −12 reps');
  assertEq(hint.color, 'var(--success)');
});

test('flat weight, reps up: shows % and reps, no weight', () => {
  const hint = computeProgressionHint({
    ...base, sets: [{ weight: 60, reps: 11, prev_weight: 60, prev_reps: 10 }],
  });
  assertEq(hint.text, '▲ (+10%) +1 rep');
  assertEq(hint.color, 'var(--success)');
});

test('deload (amber) shows %, weight — caution regardless of volume sign', () => {
  const hint = computeProgressionHint({
    ...base, sets: [{ weight: 18, reps: 10, prev_weight: 20, prev_reps: 10 }],
  });
  assertEq(hint.text, '▼ (−10%) −2 kg');
  assertEq(hint.color, '#f0a030');
});

test('no change → null', () => {
  const hint = computeProgressionHint({
    ...base, sets: [{ weight: 60, reps: 10, prev_weight: 60, prev_reps: 10 }],
  });
  assertEq(hint, null);
});

test('exercise complete → null', () => {
  const hint = computeProgressionHint({
    ...base, exerciseComplete: true,
    sets: [{ weight: 60, reps: 11, prev_weight: 60, prev_reps: 10 }],
  });
  assertEq(hint, null);
});

test('no prior log → null', () => {
  const hint = computeProgressionHint({
    ...base, sets: [{ weight: 60, reps: 10, prev_weight: null, prev_reps: null }],
  });
  assertEq(hint, null);
});

test('bodyweight: reps-only delta', () => {
  const hint = computeProgressionHint({
    ...base, isBodyweight: true,
    sets: [{ weight: 0, reps: 12, prev_weight: 0, prev_reps: 10 }],
  });
  assertEq(hint.text, '▲ +2 reps');
  assertEq(hint.color, 'var(--success)');
});

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) console.log(`All ${passed} tests passed.`);
else { console.log(`${passed} passed, ${failed} FAILED.`); process.exit(1); }
