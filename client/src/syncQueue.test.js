// syncQueue test suite — run with: node client/src/syncQueue.test.js
import { createSyncQueue, STORAGE_KEY } from './syncQueue.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const tick = () => new Promise(r => setTimeout(r, 0));
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), map: m };
}
// A controllable transport: each send() returns a promise the test resolves.
function fakeSend() {
  const calls = [];
  const send = op => new Promise((resolve, reject) => calls.push({ op, resolve, reject }));
  return { send, calls };
}
const logOp = (set, reps, sid = 1) => ({ kind: 'log', sessionId: sid, exerciseId: 7, setNum: set, body: { reps_done: reps, weight_used: 50, skipped: 0 } });

console.log('\nsyncQueue:');

await test('sends ops in order and empties the queue', async () => {
  const t = fakeSend(); const st = memStorage();
  const q = createSyncQueue({ storage: st, send: t.send, schedule: () => 0 });
  q.enqueue(logOp(1, 8)); q.enqueue(logOp(2, 7));
  await tick();
  assertEq(t.calls.length, 1, 'one in flight at a time');
  t.calls[0].resolve(201); await tick();
  assertEq(t.calls[1].op.setNum, 2);
  t.calls[1].resolve(201); await tick();
  assertEq(q.state().pending, 0);
  assertEq(JSON.parse(st.map.get(STORAGE_KEY)), []);
});

await test('network failure keeps the op and retries; persists across reload', async () => {
  const t = fakeSend(); const st = memStorage(); const timers = [];
  const q = createSyncQueue({ storage: st, send: t.send, schedule: (fn) => timers.push(fn) });
  q.enqueue(logOp(1, 8)); await tick();
  t.calls[0].reject(new TypeError('Failed to fetch')); await tick();
  assertEq(q.state().pending, 1, 'still queued');
  assertEq(timers.length, 1, 'retry scheduled');
  // Simulate a reload: a new queue over the same storage still holds the op.
  const t2 = fakeSend();
  const q2 = createSyncQueue({ storage: st, send: t2.send, schedule: () => 0 });
  assertEq(q2.state().pending, 1);
  q2.flush(); await tick();
  t2.calls[0].resolve(201); await tick();
  assertEq(q2.state().pending, 0);
});

await test('5xx retries; 4xx is dropped and reported', async () => {
  const t = fakeSend(); const timers = []; const rejected = [];
  const q = createSyncQueue({ storage: memStorage(), send: t.send, schedule: fn => timers.push(fn) });
  q.onRejected(op => rejected.push(op));
  q.enqueue(logOp(1, 8)); await tick();
  t.calls[0].resolve(503); await tick();
  assertEq(q.state().pending, 1);
  timers.shift()(); await tick();
  t.calls[1].resolve(400); await tick();
  assertEq(q.state().pending, 0);
  assertEq(rejected.map(o => [o.setNum, o.status]), [[1, 400]]);
});

await test('ops for the same set coalesce, but never replace the in-flight op', async () => {
  const t = fakeSend();
  const q = createSyncQueue({ storage: memStorage(), send: t.send, schedule: () => 0 });
  q.enqueue(logOp(1, 8)); await tick();            // in flight
  q.enqueue({ kind: 'unlog', sessionId: 1, exerciseId: 7, setNum: 1 });
  q.enqueue(logOp(1, 9));                           // replaces the queued unlog
  assertEq(q.state().pending, 2);
  t.calls[0].resolve(201); await tick();
  assertEq(t.calls[1].op.kind, 'log');
  assertEq(t.calls[1].op.body.reps_done, 9);
  t.calls[1].resolve(201); await tick();
  assertEq(q.state().pending, 0);
});

await test('401 pauses until flush() is called again', async () => {
  const t = fakeSend();
  const q = createSyncQueue({ storage: memStorage(), send: t.send, schedule: () => 0 });
  q.enqueue(logOp(1, 8)); await tick();
  t.calls[0].resolve(401); await tick();
  assertEq(q.state().pending, 1);
  assertEq(t.calls.length, 1, 'no automatic retry');
  q.flush(); await tick();
  t.calls[1].resolve(201); await tick();
  assertEq(q.state().pending, 0);
});

await test('overlay merges pending logs/unlogs into server rows', async () => {
  const t = fakeSend();
  const q = createSyncQueue({ storage: memStorage(), send: t.send, schedule: () => 0 });
  q.enqueue(logOp(1, 8)); await tick();   // in flight (still pending)
  q.enqueue(logOp(2, 6));
  q.enqueue({ kind: 'unlog', sessionId: 1, exerciseId: 7, setNum: 3 });
  q.enqueue(logOp(1, 5, 99));             // other session — ignored
  const rows = q.overlay(1, [
    { exercise_id: 7, set_num: 3, reps_done: 4, skipped: 0, weight_used: 50 },
    { exercise_id: 8, set_num: 1, reps_done: 10, skipped: 0, weight_used: 20 },
  ]);
  const by = Object.fromEntries(rows.map(r => [`${r.exercise_id}:${r.set_num}`, r.reps_done]));
  assertEq(by, { '8:1': 10, '7:1': 8, '7:2': 6 });
});

await test('whenIdle resolves after the last op lands', async () => {
  const t = fakeSend();
  const q = createSyncQueue({ storage: memStorage(), send: t.send, schedule: () => 0 });
  let idle = false;
  q.enqueue(logOp(1, 8));
  q.whenIdle().then(() => { idle = true; });
  await tick();
  assertEq(idle, false);
  t.calls[0].resolve(201); await tick(); await tick();
  assertEq(idle, true);
});

if (failed === 0) {
  console.log(`All ${passed} tests passed.`);
} else {
  console.log(`${passed} passed, ${failed} FAILED.`);
  process.exit(1);
}
