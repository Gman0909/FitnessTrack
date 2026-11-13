import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makePlan, exId, logAll } from './harness.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

// Normalise an export for comparison: drop per-account / per-run identifiers.
function normalise(x) {
  const refMap = new Map(x.plans.map((p, i) => [p.ref, i]));
  return {
    exercises: x.exercises, exercise_settings: x.exercise_settings, equipment: x.equipment,
    plans: x.plans.map(({ ref, ...p }) => p),
    sessions: x.sessions.map(s => ({ ...s, plan_ref: s.plan_ref == null ? null : refMap.get(s.plan_ref) })),
  };
}

async function buildHistory(c) {
  const custom = (await c.post('/exercises', { name: `Cable Thing ${c.cookie.slice(-6)}`, muscle_group: 'back', equipment: 'cable' })).body;
  const { planId } = await makePlan(c, srv.db, {
    days: [0, 3],
    exercises: [{ name: 'Bench Press', day: 0, sets: 2 }, { name: 'Pull-up', day: 3, sets: 2 }],
  });
  await c.post(`/plans/${planId}/schedule`, { day_of_week: 3, exercise_id: custom.id, set_count: 1, position: 5 });
  await c.patch(`/exercises/${exId(srv.db, 'Bench Press')}`, { rep_min: 5, rep_max: 7, default_increment: 2 });
  await c.del('/exercises/equipment/machine');
  const bench = exId(srv.db, 'Bench Press'), pull = exId(srv.db, 'Pull-up');
  const s1 = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  await logAll(c, s1, bench, [{ reps: 7, weight: 60 }, { reps: 6, weight: 60 }]);
  const s2 = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=3`)).body.session.id;
  await logAll(c, s2, pull, [{ reps: 8, weight: 0 }, { reps: 7, weight: 0 }]);
  await c.post(`/sessions/${s2}/sets`, { exercise_id: custom.id, set_num: 1, reps_done: null, skipped: 1, weight_used: null });
  return { planId, custom };
}

test('export → restore into another account reproduces the data exactly', async () => {
  const a = srv.client(); await a.register('exporter');
  await buildHistory(a);
  const exp = (await a.get('/stats/export?type=full_json')).body;
  assert.equal(exp.format, 'fitnesstrack-export');
  assert.equal(exp.sessions.length, 2);
  assert.equal(exp.sessions.flatMap(s => s.sets).length, 5);

  const b = srv.client(); await b.register('restorer');
  const r = await b.post('/stats/import', { data: exp });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.sets, 5);
  // The exporter's custom exercise is private, so the restorer gets its own copy.
  assert.equal(r.body.created_exercises, 1);

  const back = (await b.get('/stats/export?type=full_json')).body;
  const na = normalise(exp), nb = normalise(back);
  nb.exercises = nb.exercises.map(e => ({ ...e, name: e.name.replace(/ \(imported\)$/, '') }));
  const unsuffix = o => JSON.parse(JSON.stringify(o).replace(/ \(imported\)/g, ''));
  assert.deepEqual(unsuffix(nb), na);

  // The restored account works: week 1 is done, week 2 Monday is current.
  const plan = (await b.get('/plans/active')).body;
  const cal = (await b.get(`/plans/${plan.id}/calendar`)).body;
  assert.equal(cal.weeks[1].days[0].is_current, true);
  // And the exporter's data is untouched.
  assert.equal((await a.get('/stats/export?type=full_json')).body.sessions.length, 2);
});

test('restoring over existing data requires replace: true', async () => {
  const a = srv.client(); await a.register('rep1');
  await buildHistory(a);
  const exp = (await a.get('/stats/export?type=full_json')).body;
  const r = await a.post('/stats/import', { data: exp });
  assert.equal(r.status, 409);
  const ok = await a.post('/stats/import', { data: exp, replace: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.created_exercises, 0, 'own custom exercise is reused');
  const again = (await a.get('/stats/export?type=full_json')).body;
  assert.deepEqual(normalise(again), normalise(exp));
});

test('malformed exports are rejected without touching data', async () => {
  const a = srv.client(); await a.register('bad');
  await buildHistory(a);
  const before = (await a.get('/stats/export?type=full_json')).body;
  for (const data of [null, { format: 'nope' }, { ...before, version: 99 },
    { ...before, sessions: [{ plan_ref: null, sets: [{ exercise: 'No Such Lift', set_num: 1 }] }] }]) {
    assert.equal((await a.post('/stats/import', { data, replace: true })).status, 400);
  }
  assert.deepEqual(normalise((await a.get('/stats/export?type=full_json')).body), normalise(before));
});
