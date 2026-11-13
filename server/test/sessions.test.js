import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makePlan, exId, logAll } from './harness.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const utcToday = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

test('core loop: logging every set completes the session and writes next targets', async () => {
  const c = srv.client(); await c.register('core');
  const { planId } = await makePlan(c, srv.db, { days: [0], exercises: [{ name: 'Bench Press', day: 0, sets: 2 }] });
  const bench = exId(srv.db, 'Bench Press');

  const slot = await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`);
  assert.equal(slot.status, 200);
  assert.equal(slot.body.is_current, true);
  const sid = slot.body.session.id;

  await c.post(`/sessions/${sid}/sets`, { exercise_id: bench, set_num: 1, reps_done: 8, weight_used: 60 });
  let sess = srv.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
  assert.equal(sess.checked_in, 0, 'not complete after 1 of 2 sets');
  assert.ok(sess.date, 'date stamped on first log');

  await c.post(`/sessions/${sid}/sets`, { exercise_id: bench, set_num: 2, reps_done: 8, weight_used: 60 });
  sess = srv.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
  assert.equal(sess.checked_in, 1);

  const next = srv.db.prepare('SELECT set_num, weight, reps, valid_from FROM set_targets WHERE plan_id = ? AND exercise_id = ? ORDER BY set_num').all(planId, bench);
  assert.equal(next.length, 2);
  // Bench range 6–8: logged 8 = repMax → weight bump, reps reset to floor.
  assert.equal(next[0].weight, 62.5);
  assert.equal(next[0].reps, 6);
  assert.equal(next[0].valid_from, addDays(sess.date, 1));

  // Week 1 done → week 2 is current.
  const cal = await c.get(`/plans/${planId}/calendar`);
  assert.equal(cal.body.weeks[0].days[0].is_current, false);
  assert.equal(cal.body.weeks[1].days[0].is_current, true);
});

test('un-logging a set reopens the session and removes next targets', async () => {
  const c = srv.client(); await c.register('unlog');
  const { planId } = await makePlan(c, srv.db, { days: [0], exercises: [{ name: 'Squat', day: 0, sets: 1 }] });
  const sq = exId(srv.db, 'Squat');
  const sid = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  await logAll(c, sid, sq, [{ reps: 5, weight: 100 }]);
  assert.equal(srv.db.prepare('SELECT checked_in FROM sessions WHERE id = ?').get(sid).checked_in, 1);

  await c.del(`/sessions/${sid}/sets/${sq}/1`);
  const s = srv.db.prepare('SELECT checked_in, date FROM sessions WHERE id = ?').get(sid);
  assert.equal(s.checked_in, 0);
  assert.ok(s.date, 'a once-finalized session keeps its date even when emptied');
  assert.equal(srv.db.prepare('SELECT COUNT(*) n FROM set_targets WHERE plan_id = ?').get(planId).n, 0);
});

test('unlocking one session leaves another same-day session\'s targets intact', async () => {
  const c = srv.client(); await c.register('unlock');
  const { planId } = await makePlan(c, srv.db, {
    days: [0, 1],
    exercises: [{ name: 'Bench Press', day: 0, sets: 1 }, { name: 'Barbell Curl', day: 1, sets: 1 }],
  });
  const bench = exId(srv.db, 'Bench Press'), curl = exId(srv.db, 'Barbell Curl');

  const s0 = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  await logAll(c, s0, bench, [{ reps: 7, weight: 60 }]);
  const s1 = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=1`)).body.session.id;
  await logAll(c, s1, curl, [{ reps: 10, weight: 30 }]);

  const curlTargetsBefore = srv.db.prepare('SELECT COUNT(*) n FROM set_targets WHERE plan_id = ? AND exercise_id = ?').get(planId, curl).n;
  assert.equal(curlTargetsBefore, 1);

  const r = await c.post(`/sessions/${s0}/unlock`);
  assert.equal(r.status, 200);
  assert.equal(srv.db.prepare('SELECT COUNT(*) n FROM set_targets WHERE plan_id = ? AND exercise_id = ?').get(planId, bench).n, 0, 'unlocked session\'s own targets are removed');
  assert.equal(srv.db.prepare('SELECT COUNT(*) n FROM set_targets WHERE plan_id = ? AND exercise_id = ?').get(planId, curl).n, 1, 'other session\'s targets survive');
});

test('plan list completed_days agrees with the calendar for an unlocked session', async () => {
  const c = srv.client(); await c.register('plist');
  const { planId } = await makePlan(c, srv.db, { days: [0], exercises: [{ name: 'Deadlift', day: 0, sets: 1 }] });
  const dl = exId(srv.db, 'Deadlift');
  const sid = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  await logAll(c, sid, dl, [{ reps: 5, weight: 120 }]);
  await c.post(`/sessions/${sid}/unlock`);

  const cal  = await c.get(`/plans/${planId}/calendar`);
  assert.equal(cal.body.weeks[0].days[0].is_current, true, 'calendar: unlocked slot is current again');
  const list = await c.get('/plans');
  const p = list.body.find(x => x.id === planId);
  assert.equal(p.completed_days, 0, 'plan list must not count the unlocked session as done');
});

test('skip marks the whole day done', async () => {
  const c = srv.client(); await c.register('skip');
  const { planId } = await makePlan(c, srv.db, { days: [0], exercises: [{ name: 'Bench Press', day: 0, sets: 3 }] });
  const sid = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  await c.post(`/sessions/${sid}/skip`);
  const s = srv.db.prepare('SELECT checked_in FROM sessions WHERE id = ?').get(sid);
  assert.equal(s.checked_in, 1);
  assert.equal(srv.db.prepare('SELECT COUNT(*) n FROM logged_sets WHERE session_id = ? AND skipped = 1').get(sid).n, 3);
});

test('recap and history endpoints respond for a completed session', async () => {
  const c = srv.client(); await c.register('recap');
  const { planId } = await makePlan(c, srv.db, { days: [0], exercises: [{ name: 'Bench Press', day: 0, sets: 1 }] });
  const bench = exId(srv.db, 'Bench Press');
  const sid = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  await logAll(c, sid, bench, [{ reps: 7, weight: 60 }]);
  const recap = await c.get(`/sessions/${sid}/recap`);
  assert.equal(recap.status, 200);
  assert.equal(recap.body.exercises.length, 1);
  const hist = await c.get(`/sessions/history?exercise_id=${bench}`);
  assert.equal(hist.status, 200);
  assert.equal(hist.body.length, 1);
  assert.equal(hist.body[0].max_weight, 60);
  // SQL e1RM mirrors shared/e1rm.js: 60 × (1 + 7/30) = 74.
  const { estimateOneRepMax } = await import('../../shared/e1rm.js');
  assert.equal(hist.body[0].e1rm, estimateOneRepMax(60, 7));
  assert.equal(hist.body[0].e1rm, 74);
});

test('users cannot see or touch each other\'s sessions', async () => {
  const a = srv.client(); await a.register('alice');
  const b = srv.client(); await b.register('bob');
  const { planId } = await makePlan(a, srv.db, { days: [0], exercises: [{ name: 'Bench Press', day: 0, sets: 1 }] });
  const sid = (await a.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  assert.equal((await b.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).status, 404);
  assert.equal((await b.post(`/sessions/${sid}/sets`, { exercise_id: exId(srv.db, 'Bench Press'), set_num: 1, reps_done: 5, weight_used: 50 })).status, 404);
  assert.equal((await b.get(`/plans/${planId}`)).status, 404);
});

export { utcToday, addDays };
