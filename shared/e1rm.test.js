// estimateOneRepMax test suite — run with: node shared/e1rm.test.js
import { estimateOneRepMax } from './e1rm.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

console.log('\nestimateOneRepMax:');
test('a single is its own 1RM', () => assertEq(estimateOneRepMax(100, 1), 100));
test('Epley: 100 kg × 10 → 133.3', () => assertEq(estimateOneRepMax(100, 10), 133.3));
test('Epley: 60 kg × 8 → 76', () => assertEq(estimateOneRepMax(60, 8), 76));
test('ranks sets across rep ranges on one scale', () => {
  // 70×8 (88.7) is a stronger set than 60×12 (84) despite fewer reps.
  assertEq(estimateOneRepMax(70, 8), 88.7);
  assertEq(estimateOneRepMax(60, 12), 84);
});
test('no weight or no reps → null', () => {
  assertEq(estimateOneRepMax(0, 8), null);
  assertEq(estimateOneRepMax(null, 8), null);
  assertEq(estimateOneRepMax(80, 0), null);
  assertEq(estimateOneRepMax(80, null), null);
});

if (failed === 0) {
  console.log(`All ${passed} tests passed.`);
} else {
  console.log(`${passed} passed, ${failed} FAILED.`);
  process.exit(1);
}
