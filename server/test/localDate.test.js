import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveToday, addDays, utcToday } from '../localDate.js';
import { startServer, makePlan, exId, logAll } from './harness.js';

test('resolveToday accepts only dates within ±1 day of UTC', () => {
  const u = '2026-03-10';
  assert.equal(resolveToday('2026-03-10', u), u);
  assert.equal(resolveToday('2026-03-09', u), '2026-03-09');
  assert.equal(resolveToday('2026-03-11', u), '2026-03-11');
  assert.equal(resolveToday('2026-03-12', u), u, 'two days ahead is rejected');
  assert.equal(resolveToday('2026-3-10', u), u, 'malformed is rejected');
  assert.equal(resolveToday(undefined, u), u);
  assert.equal(resolveToday("2026-03-10'; DROP", u), u);
});

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test('a session is stamped with the client\'s local date and next targets follow it', async () => {
  const c = srv.client(); await c.register('tz');
  const local = addDays(utcToday(), 1);           // e.g. a user east of UTC, already tomorrow
  c.headers['X-Local-Date'] = local;
  const { planId } = await makePlan(c, srv.db, { days: [0], exercises: [{ name: 'Bench Press', day: 0, sets: 1 }] });
  const sid = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  await logAll(c, sid, exId(srv.db, 'Bench Press'), [{ reps: 7, weight: 60 }]);
  assert.equal(srv.db.prepare('SELECT date FROM sessions WHERE id = ?').get(sid).date, local);
  assert.equal(srv.db.prepare('SELECT valid_from FROM set_targets WHERE plan_id = ?').get(planId).valid_from, addDays(local, 1));
  assert.equal(srv.db.prepare('SELECT started_at FROM workout_plans WHERE id = ?').get(planId).started_at, local);
});

test('without the header the server falls back to the UTC date', async () => {
  const c = srv.client(); await c.register('tz2');
  const { planId } = await makePlan(c, srv.db, { days: [0], exercises: [{ name: 'Bench Press', day: 0, sets: 1 }] });
  const sid = (await c.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  await logAll(c, sid, exId(srv.db, 'Bench Press'), [{ reps: 7, weight: 60 }]);
  assert.equal(srv.db.prepare('SELECT date FROM sessions WHERE id = ?').get(sid).date, utcToday());
});
