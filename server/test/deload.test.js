import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makePlan, exId, logAll } from './harness.js';
import { addDays, utcToday } from '../localDate.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const LIFTS = ['Dumbbell Fly', 'Meadows Row', 'Dumbbell Row'];  // all 8–12 reps

// Run one week of the plan on a given past date, logging `reps` for every set.
async function week(c, planId, w, date, reps) {
  const sid = (await c.get(`/sessions/slot?plan_id=${planId}&week=${w}&dow=0`)).body.session.id;
  srv.db.prepare('UPDATE sessions SET date = ? WHERE id = ?').run(date, sid);
  for (const name of LIFTS) await logAll(c, sid, exId(srv.db, name), [{ reps, weight: 50 }, { reps, weight: 50 }]);
}

test('no suggestion without enough history', async () => {
  const c = srv.client(); await c.register('fresh');
  await makePlan(c, srv.db, { days: [0], exercises: LIFTS.map(name => ({ name, day: 0, sets: 2 })) });
  const r = await c.get('/stats/deload');
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.suggest, r.body.judged], [false, 0]);
});

test('two straight shortfalls on most lifts → suggest a deload', async () => {
  const c = srv.client(); await c.register('stalled');
  const { planId } = await makePlan(c, srv.db, { days: [0], exercises: LIFTS.map(name => ({ name, day: 0, sets: 2 })) });
  const t = utcToday();
  await week(c, planId, 1, addDays(t, -6), 10);  // targets → 50×11
  await week(c, planId, 2, addDays(t, -4), 9);   // short of 11 → hold at 9
  let r = await c.get('/stats/deload');
  assert.equal(r.body.suggest, false, 'one shortfall is not a trend');
  await week(c, planId, 3, addDays(t, -2), 8);   // short of 9 again
  r = await c.get('/stats/deload');
  assert.deepEqual([r.body.suggest, r.body.slow, r.body.judged], [true, 3, 3]);
  assert.deepEqual([...r.body.slow_lifts].sort(), [...LIFTS].sort());
});

test('beating targets → no suggestion', async () => {
  const c = srv.client(); await c.register('climbing');
  const { planId } = await makePlan(c, srv.db, { days: [0], exercises: LIFTS.map(name => ({ name, day: 0, sets: 2 })) });
  const t = utcToday();
  await week(c, planId, 1, addDays(t, -6), 9);
  await week(c, planId, 2, addDays(t, -4), 10);
  await week(c, planId, 3, addDays(t, -2), 11);
  const r = await c.get('/stats/deload');
  assert.equal(r.body.suggest, false);
  assert.equal(r.body.judged, 3);
});
