// Integration-test harness: boots the real Express app against a throwaway
// SQLite database (in-memory by default) on an ephemeral port.
//
// Each `node --test` file runs in its own process, so every test file gets a
// fresh database. DATABASE_PATH must be set before db.js is first imported,
// hence the dynamic imports.
import { once } from 'node:events';

// Registration is opened by default so tests can create several accounts;
// pass { openRegistration: false } to exercise the closed-by-default gate.
export async function startServer({ dbPath = ':memory:', openRegistration = true } = {}) {
  process.env.DATABASE_PATH = dbPath;
  const { default: app } = await import('../app.js');
  const { seed }         = await import('../seed.js');
  const { default: db }  = await import('../db.js');
  seed();
  if (openRegistration)
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('registration_open', '1')").run();
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    db, base,
    client: () => new Client(base),
    close:  () => new Promise(r => server.close(r)),
  };
}

export class Client {
  constructor(base) { this.base = base; this.cookie = null; this.headers = {}; }

  async req(method, path, body) {
    const headers = { ...this.headers };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(this.base + '/api' + path, {
      method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = setCookie.match(/token=([^;]*)/);
      if (m) this.cookie = m[1] ? `token=${m[1]}` : null;
    }
    const text = await res.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* CSV or empty */ }
    return { status: res.status, body: data };
  }
  get(p)        { return this.req('GET', p); }
  post(p, b={}) { return this.req('POST', p, b); }
  patch(p, b)   { return this.req('PATCH', p, b); }
  del(p)        { return this.req('DELETE', p); }

  async register(username, password = 'password123') {
    const r = await this.post('/auth/register', { username, name: username, password });
    if (r.status !== 201) throw new Error(`register ${username} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }
}

// Build a plan for `client` with the given days and exercises. Returns
// { planId, slots: [{ id, exercise_id, day_of_week }] }.
export async function makePlan(client, db, { days = [0], exercises = [{ name: 'Bench Press', day: 0, sets: 2 }], activate = true } = {}) {
  const { body: { id: planId } } = await client.post('/plans', { name: 'Test plan', days });
  for (const [i, ex] of exercises.entries()) {
    const exId = db.prepare('SELECT id FROM exercises WHERE name = ?').get(ex.name).id;
    await client.post(`/plans/${planId}/schedule`, { day_of_week: ex.day, exercise_id: exId, set_count: ex.sets, position: i });
  }
  if (activate) await client.post(`/plans/${planId}/activate`);
  const slots = db.prepare('SELECT id, exercise_id, day_of_week FROM schedule WHERE plan_id = ? ORDER BY position').all(planId);
  return { planId, slots };
}

export const exId = (db, name) => db.prepare('SELECT id FROM exercises WHERE name = ?').get(name).id;

// Log every set of one exercise in a session.
export async function logAll(client, sessionId, exerciseId, sets) {
  for (const [i, s] of sets.entries())
    await client.post(`/sessions/${sessionId}/sets`, { exercise_id: exerciseId, set_num: i + 1, reps_done: s.reps, weight_used: s.weight, skipped: 0 });
}
