import { createSyncQueue } from '../syncQueue.js';

// The device's local calendar date — the server stamps session dates with it
// so a workout lands on the right day regardless of the server's timezone.
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function req(method, path, body) {
  const headers = { 'X-Local-Date': localDateStr() };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('Session expired');
  }
  if (!res.ok) {
    // Keep the status in the message (callers match on it) and expose the
    // server's own explanation, when it sent one, as err.serverError.
    const err = new Error(`${method} /api${path} → ${res.status}`);
    err.status = res.status;
    try { err.serverError = (await res.json()).error ?? null; } catch { err.serverError = null; }
    throw err;
  }
  return res.json();
}

// ── Outbox for set logging (see syncQueue.js) ────────────────────────────────

const safeStorage = {
  getItem: k => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } },
};

export const outbox = createSyncQueue({
  storage: safeStorage,
  // Replays one queued op; resolves with the HTTP status, rejects on network failure.
  async send(op) {
    const log  = op.kind === 'log';
    const path = log ? `/sessions/${op.sessionId}/sets` : `/sessions/${op.sessionId}/sets/${op.exerciseId}/${op.setNum}`;
    const headers = { 'X-Local-Date': op.localDate ?? localDateStr() };
    if (log) headers['Content-Type'] = 'application/json';
    const res = await fetch(`/api${path}`, {
      method: log ? 'POST' : 'DELETE',
      credentials: 'include',
      headers,
      body: log ? JSON.stringify({ exercise_id: op.exerciseId, set_num: op.setNum, ...op.body }) : undefined,
    });
    if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:expired'));
    if (res.status >= 400 && res.status < 500) {
      try { op.serverError = (await res.json()).error ?? null; } catch { op.serverError = null; }
    }
    return res.status;
  },
});
window.addEventListener('online', () => outbox.flush());
outbox.flush();

export const api = {
  // Sessions
  getSessionForSlot:  (planId, week, dow)  => req('GET', `/sessions/slot?plan_id=${planId}&week=${week}&dow=${dow}`),
  skipSession:       (id)       => req('POST',   `/sessions/${id}/skip`),
  unlockSession:     (id)       => req('POST',   `/sessions/${id}/unlock`),
  getSessionSets:    (id)       => req('GET',    `/sessions/${id}/sets`),
  // Set logging goes through the outbox: applied optimistically, retried until accepted.
  queueLogSet:       (id, { exercise_id, set_num, ...body }) =>
    outbox.enqueue({ kind: 'log', sessionId: id, exerciseId: exercise_id, setNum: set_num, body, localDate: localDateStr() }),
  queueUnlogSet:     (id, exerciseId, setNum) =>
    outbox.enqueue({ kind: 'unlog', sessionId: id, exerciseId, setNum, localDate: localDateStr() }),
  getRecap:          (id)       => req('GET',    `/sessions/${id}/recap`),

  // Schedule
  getScheduleForDay:  (dow, week)     => req('GET', `/schedule/today?dow=${dow}${week != null ? `&week=${week}` : ''}`),

  // History
  getLoggedExercises: ()   => req('GET', '/sessions/history'),
  getExerciseHistory: (id) => req('GET', `/sessions/history?exercise_id=${id}`),

  // Plans
  getActivePlan:     ()              => req('GET',    '/plans/active'),
  getPlans:          ()              => req('GET',    '/plans'),
  createPlan:        (body)          => req('POST',   '/plans', body),
  getPlan:           (id)            => req('GET',    `/plans/${id}`),
  updatePlan:        (id, body)      => req('PATCH',  `/plans/${id}`, body),
  deletePlan:        (id)            => req('DELETE', `/plans/${id}`),
  activatePlan:      (id)            => req('POST',   `/plans/${id}/activate`),
  clonePlan:         (id, body)      => req('POST',   `/plans/${id}/clone`, body),
  updatePlanDays:    (id, days)      => req('PATCH',  `/plans/${id}/days`, { days }),
  getPlanCalendar:   (id)            => req('GET',    `/plans/${id}/calendar`),
  addToPlanSchedule: (id, body)      => req('POST',   `/plans/${id}/schedule`, body),
  updatePlanSlot:    (id, sid, body) => req('PATCH',  `/plans/${id}/schedule/${sid}`, body),
  removePlanSlot:    (id, sid)       => req('DELETE', `/plans/${id}/schedule/${sid}`),

  // Stats
  getStats:   (scope = 'all') => req('GET',  `/stats?scope=${scope}`),
  getDeload:  ()              => req('GET',  '/stats/deload'),
  resetStats: ()              => req('POST', '/stats/reset'),
  importData: (data)          => req('POST', '/stats/import', { data, replace: true }),

  // Admin
  triggerUpdate:    () => req('POST', '/admin/update'),
  getUpdateStatus:  () => req('GET',  '/admin/update-status'),
  getAdminSettings: () => req('GET',  '/admin/settings'),
  updateAdminSettings: (body) => req('PATCH', '/admin/settings', body),

  // Auth
  getMe:         ()       => req('GET',   '/auth/me'),
  getRegistration: ()     => req('GET',   '/auth/registration'),
  login:         (body)   => req('POST',  '/auth/login',    body),
  register:      (body)   => req('POST',  '/auth/register', body),
  logout:        ()       => req('POST',  '/auth/logout'),
  updateProfile: (body)   => req('PATCH', '/auth/me',       body),

  // Exercises
  getExercises:    (params = {}) => req('GET', `/exercises${params.user_equipment ? '?user_equipment=true' : ''}`),
  getCustomExercises: ()         => req('GET',    '/exercises?custom_only=true'),
  createExercise:  (body)        => req('POST',   '/exercises', body),
  updateExercise:  (id, body)    => req('PATCH',  `/exercises/${id}`, body),
  deleteExercise:  (id)          => req('DELETE', `/exercises/${id}`),
  getEquipment:    ()            => req('GET',    '/exercises/equipment'),
  addEquipment:    (equipment)   => req('POST',   '/exercises/equipment', { equipment }),
  removeEquipment: (name)        => req('DELETE', `/exercises/equipment/${encodeURIComponent(name)}`),
};
