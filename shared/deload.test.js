// deloadAdvice test suite — run with: node shared/deload.test.js
import { deloadAdvice } from './deload.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const L = (name, tempo, known = true) => ({ name, tempo, known });

console.log('\ndeloadAdvice:');
test('half or more of the judged lifts slow → suggest', () => {
  const r = deloadAdvice([L('Bench', 'slow'), L('Squat', 'slow'), L('Row', 'normal'), L('Curl', 'fast')]);
  assertEq([r.suggest, r.slow, r.judged, r.slow_lifts], [true, 2, 4, ['Bench', 'Squat']]);
});
test('a minority of slow lifts → no suggestion', () => {
  assertEq(deloadAdvice([L('a', 'slow'), L('b', 'normal'), L('c', 'normal')]).suggest, false);
});
test('too few judgeable lifts → no suggestion, however slow', () => {
  assertEq(deloadAdvice([L('a', 'slow'), L('b', 'slow')]).suggest, false);
});
test('lifts without enough history are ignored', () => {
  const r = deloadAdvice([L('a', 'slow'), L('b', 'slow'), L('c', 'normal', false), L('d', 'normal', false), L('e', 'normal')]);
  assertEq([r.suggest, r.judged], [true, 3]);
});
test('no lifts → no suggestion', () => assertEq(deloadAdvice([]).suggest, false));

if (failed === 0) {
  console.log(`All ${passed} tests passed.`);
} else {
  console.log(`${passed} passed, ${failed} FAILED.`);
  process.exit(1);
}
