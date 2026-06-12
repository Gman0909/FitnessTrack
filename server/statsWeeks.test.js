// selectProgressWeeks test suite — run with: node server/statsWeeks.test.js
import { selectProgressWeeks } from './statsWeeks.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const sess = pairs => new Map(pairs.map(([w, total, done]) => [w, { total, done }]));

console.log('\nselectProgressWeeks:');

// G Mac's reported case: weeks of May 25, Jun 1, Jun 8. Today is Fri Jun 12 so
// cur = Jun 8 (still in progress by the calendar) but its 3 sessions are all
// checked_in and the last elapsed week also had 3 → it must count as latest.
test('fully-trained current week counts as the latest completed week', () => {
  const weeks = ['2026-05-25', '2026-06-01', '2026-06-08'];
  const r = selectProgressWeeks(weeks, '2026-06-08',
    sess([['2026-05-25', 3, 3], ['2026-06-01', 3, 3], ['2026-06-08', 3, 3]]));
  assertEq(r.firstWeek, '2026-05-25');
  assertEq(r.lastWeek,  '2026-06-08');
});

test('part-done current week stays excluded (fewer sessions than last week)', () => {
  const weeks = ['2026-05-25', '2026-06-01', '2026-06-08'];
  const r = selectProgressWeeks(weeks, '2026-06-08',
    sess([['2026-05-25', 3, 3], ['2026-06-01', 3, 3], ['2026-06-08', 2, 2]]));
  assertEq(r.lastWeek, '2026-06-01'); // not yet Jun 8
});

test('current week with an in-progress (not checked_in) session is excluded', () => {
  const weeks = ['2026-06-01', '2026-06-08'];
  const r = selectProgressWeeks(weeks, '2026-06-08',
    sess([['2026-06-01', 3, 3], ['2026-06-08', 3, 2]])); // one still open
  assertEq(r.lastWeek, null); // only Jun 1 completed → nothing to compare
});

test('all weeks fully elapsed → latest elapsed is the last week (unchanged)', () => {
  const weeks = ['2026-06-01', '2026-06-08'];
  const r = selectProgressWeeks(weeks, '2026-06-15',
    sess([['2026-06-01', 3, 3], ['2026-06-08', 3, 3]]));
  assertEq(r.firstWeek, '2026-06-01');
  assertEq(r.lastWeek,  '2026-06-08');
});

test('only the current week trained → no comparison (lastWeek null)', () => {
  const weeks = ['2026-06-08'];
  const r = selectProgressWeeks(weeks, '2026-06-08', sess([['2026-06-08', 3, 3]]));
  assertEq(r.firstWeek, '2026-06-08');
  assertEq(r.lastWeek,  null);
});

test('current week has more sessions than last → still admitted', () => {
  const weeks = ['2026-06-01', '2026-06-08'];
  const r = selectProgressWeeks(weeks, '2026-06-08',
    sess([['2026-06-01', 2, 2], ['2026-06-08', 4, 4]]));
  assertEq(r.lastWeek, '2026-06-08');
});

test('current week with no logged volume is not admitted even if sessions exist', () => {
  // weeks (volume) excludes Jun 8; a stray session row alone must not add it.
  const weeks = ['2026-06-01'];
  const r = selectProgressWeeks(weeks, '2026-06-08',
    sess([['2026-06-01', 3, 3], ['2026-06-08', 3, 3]]));
  assertEq(r.lastWeek, null);
});

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) console.log(`All ${passed} tests passed.`);
else { console.log(`${passed} passed, ${failed} FAILED.`); process.exit(1); }
