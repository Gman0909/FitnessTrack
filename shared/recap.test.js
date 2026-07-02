// Recap verdict tests — run with: node shared/recap.test.js
import { liftVerdict, summarizeVerdicts, capVerdictToTargets } from './recap.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

console.log('\nliftVerdict:');

test('no prior → new', () => assertEq(liftVerdict({ topW: 20, vol: 200, reps: 10 }, null), 'new'));

test('heavier top set → up (even with reset reps)', () =>
  assertEq(liftVerdict({ topW: 22.5, vol: 180, reps: 8 }, { topW: 20, vol: 240, reps: 12 }), 'up'));

test('lighter top set → eased (deload)', () =>
  assertEq(liftVerdict({ topW: 19, vol: 190, reps: 10 }, { topW: 20, vol: 200, reps: 10 }), 'eased'));

test('same weight, more volume → up', () =>
  assertEq(liftVerdict({ topW: 20, vol: 220, reps: 11 }, { topW: 20, vol: 200, reps: 10 }), 'up'));

test('same weight, less volume → down', () =>
  assertEq(liftVerdict({ topW: 20, vol: 180, reps: 9 }, { topW: 20, vol: 200, reps: 10 }), 'down'));

test('same weight, equal volume → held', () =>
  assertEq(liftVerdict({ topW: 20, vol: 200, reps: 10 }, { topW: 20, vol: 200, reps: 10 }), 'held'));

test('bodyweight: more reps → up', () =>
  assertEq(liftVerdict({ topW: 0, vol: 0, reps: 26 }, { topW: 0, vol: 0, reps: 24 }, { isBodyweight: true }), 'up'));

test('bodyweight: fewer reps → down', () =>
  assertEq(liftVerdict({ topW: 0, vol: 0, reps: 22 }, { topW: 0, vol: 0, reps: 24 }, { isBodyweight: true }), 'down'));

console.log('\ncapVerdictToTargets:');

test('up + missed every target → held', () =>
  assertEq(capVerdictToTargets('up', true), 'held'));

test('up + met a target → up (unchanged)', () =>
  assertEq(capVerdictToTargets('up', false), 'up'));

test('non-up verdicts pass through even when every target missed', () => {
  assertEq(capVerdictToTargets('down', true), 'down');
  assertEq(capVerdictToTargets('eased', true), 'eased');
  assertEq(capVerdictToTargets('held', true), 'held');
  assertEq(capVerdictToTargets('new', true), 'new');
});

console.log('\nsummarizeVerdicts:');

test('counts and comparable total exclude new', () => {
  const s = summarizeVerdicts(['up', 'up', 'held', 'eased', 'down', 'new']);
  assertEq(s.up, 2); assertEq(s.comparable, 5); assertEq(s.total, 6);
});

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) console.log(`All ${passed} tests passed.`);
else { console.log(`${passed} passed, ${failed} FAILED.`); process.exit(1); }
