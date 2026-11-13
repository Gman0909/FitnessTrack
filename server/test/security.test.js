import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makePlan, exId } from './harness.js';

let srv, admin, bob;
before(async () => {
  srv = await startServer({ openRegistration: false });
  admin = srv.client(); await admin.register('admin');
});
after(async () => { await srv.close(); });

test('first account is admin; registration then closes until the admin opens it', async () => {
  const me = await admin.get('/auth/me');
  assert.equal(me.body.is_admin, true);
  assert.deepEqual((await admin.get('/auth/registration')).body, { open: false });

  const stranger = srv.client();
  const denied = await stranger.post('/auth/register', { username: 'mallory', name: 'm', password: 'password123' });
  assert.equal(denied.status, 403);

  assert.equal((await admin.patch('/admin/settings', { registration_open: true })).status, 200);
  bob = srv.client(); await bob.register('bob');
  assert.equal((await bob.get('/auth/me')).body.is_admin, false);
  await admin.patch('/admin/settings', { registration_open: false });
});

test('non-admins cannot trigger the updater or change settings', async () => {
  assert.equal((await bob.post('/admin/update')).status, 403);
  assert.equal((await bob.get('/admin/update-status')).status, 403);
  assert.equal((await bob.patch('/admin/settings', { registration_open: true })).status, 403);
  assert.equal((await srv.client().post('/admin/update')).status, 401);
});

test('custom exercises are private to their owner', async () => {
  const r = await bob.post('/exercises', { name: 'Bob Curl', muscle_group: 'biceps', equipment: 'dumbbell' });
  assert.equal(r.status, 201);
  const id = r.body.id;
  const adminList = (await admin.get('/exercises')).body;
  assert.ok(!adminList.some(e => e.id === id), 'admin does not see bob\'s custom exercise');
  assert.equal((await admin.patch(`/exercises/${id}`, { name: 'Hijacked' })).status, 404);
  assert.equal((await admin.del(`/exercises/${id}`)).status, 404);
  const mine = (await bob.get('/exercises?custom_only=true')).body;
  assert.equal(mine.find(e => e.id === id)?.can_edit, 1);
  assert.equal((await bob.patch(`/exercises/${id}`, { name: 'Bob Hammer Curl' })).status, 200);
});

test('only the admin can rename shared library exercises; personal settings stay open', async () => {
  const bench = exId(srv.db, 'Bench Press');
  const ex = (await bob.get('/exercises')).body.find(e => e.id === bench);
  assert.equal(ex.can_edit, 0);
  assert.equal((await bob.patch(`/exercises/${bench}`, { name: 'Bench!' })).status, 403);
  // The editor resends unchanged identity fields with personal settings — allowed.
  const ok = await bob.patch(`/exercises/${bench}`, { name: 'Bench Press', muscle_group: ex.muscle_group, equipment: ex.equipment, rep_min: 5, rep_max: 9 });
  assert.equal(ok.status, 200);
  assert.equal(srv.db.prepare('SELECT name, rep_min FROM exercises WHERE id = ?').get(bench).rep_min, 6, 'shared default untouched');
  assert.equal(srv.db.prepare('SELECT rep_min FROM user_exercise_settings WHERE user_id = ? AND exercise_id = ?').get(2, bench).rep_min, 5);
  assert.equal((await admin.patch(`/exercises/${bench}`, { muscle_group: 'chest' })).status, 200);
});

test('a custom exercise with logged history cannot be deleted', async () => {
  const r = await admin.post('/exercises', { name: 'Admin Press', muscle_group: 'chest', equipment: 'machine' });
  const id = r.body.id;
  const { body: { id: planId } } = await admin.post('/plans', { name: 'p', days: [0] });
  await admin.post(`/plans/${planId}/schedule`, { day_of_week: 0, exercise_id: id, set_count: 1 });
  await admin.post(`/plans/${planId}/activate`);
  const sid = (await admin.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  await admin.post(`/sessions/${sid}/sets`, { exercise_id: id, set_num: 1, reps_done: 10, weight_used: 40 });
  const del = await admin.del(`/exercises/${id}`);
  assert.equal(del.status, 409);
  assert.equal(srv.db.prepare('SELECT COUNT(*) n FROM logged_sets WHERE exercise_id = ?').get(id).n, 1, 'history intact');
});

test('equipment is per user', async () => {
  await bob.del('/exercises/equipment/barbell');
  assert.ok(!(await bob.get('/exercises/equipment')).body.includes('barbell'));
  assert.ok((await admin.get('/exercises/equipment')).body.includes('barbell'));
  const bobList = (await bob.get('/exercises?user_equipment=true')).body;
  assert.ok(!bobList.some(e => e.equipment === 'barbell'));
});

test('set logging rejects malformed or out-of-schedule input', async () => {
  const { planId } = await makePlan(bob, srv.db, { days: [0], exercises: [{ name: 'Bench Press', day: 0, sets: 2 }] });
  const sid = (await bob.get(`/sessions/slot?plan_id=${planId}&week=1&dow=0`)).body.session.id;
  const bench = exId(srv.db, 'Bench Press'), squat = exId(srv.db, 'Squat');
  for (const body of [
    { exercise_id: bench, set_num: 0, reps_done: 5, weight_used: 50 },
    { exercise_id: bench, set_num: 999, reps_done: 5, weight_used: 50 },
    { exercise_id: bench, set_num: 1, reps_done: -3, weight_used: 50 },
    { exercise_id: bench, set_num: 1, reps_done: 5, weight_used: -50 },
    { exercise_id: bench, set_num: 1, reps_done: '5', weight_used: 50 },
    { exercise_id: squat, set_num: 1, reps_done: 5, weight_used: 50 },
  ]) assert.equal((await bob.post(`/sessions/${sid}/sets`, body)).status, 400, JSON.stringify(body));
  assert.equal(srv.db.prepare('SELECT COUNT(*) n FROM logged_sets WHERE session_id = ?').get(sid).n, 0);
  assert.equal((await bob.post(`/sessions/${sid}/sets`, { exercise_id: bench, set_num: 1, reps_done: null, skipped: 1, weight_used: null })).status, 201);
});

test('plan and schedule writes are validated', async () => {
  assert.equal((await bob.post('/plans', { name: '', days: [0] })).status, 400);
  assert.equal((await bob.post('/plans', { name: 'x', days: [7] })).status, 400);
  const { body: { id } } = await bob.post('/plans', { name: 'ok', days: [0, 2] });
  assert.equal((await bob.patch(`/plans/${id}`, { week_count: 0 })).status, 400);
  assert.equal((await bob.patch(`/plans/${id}`, { week_count: 6 })).status, 200);
  assert.equal((await bob.post(`/plans/${id}/schedule`, { day_of_week: 0, exercise_id: exId(srv.db, 'Squat'), set_count: 0 })).status, 400);
  const adminCustom = (await admin.post('/exercises', { name: 'Secret Lift', muscle_group: 'legs', equipment: 'machine' })).body.id;
  assert.equal((await bob.post(`/plans/${id}/schedule`, { day_of_week: 0, exercise_id: adminCustom, set_count: 2 })).status, 404, 'cannot schedule another user\'s custom exercise');
});

test('malformed JSON gets a 400, not an HTML 500', async () => {
  const res = await fetch(srv.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Malformed JSON' });
});
