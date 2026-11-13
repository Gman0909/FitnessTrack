// Durable outbox for set logging.
//
// Gym connectivity is patchy. Logging or clearing a set is applied to the UI
// immediately and recorded here; the queue persists to localStorage and
// replays the requests in order until the server accepts them, surviving
// offline stretches, flaky responses and page reloads.
//
//   - Network failure / 5xx / 408 / 429 → keep the op, retry with backoff.
//   - 401 → pause until flush() is called again (after re-login).
//   - Any other 4xx → the server rejected it for good: drop the op and notify
//     `rejected` listeners so the UI can revert that set and say why.
//
// Ops for the same set coalesce (last write wins), except the one currently in
// flight — it is never replaced mid-request, so its completion can't delete a
// newer op.

export const STORAGE_KEY = 'ft_sync_queue_v1';
const BACKOFF_MS = [1000, 3000, 8000, 15000, 30000];

export function createSyncQueue({ storage, send, schedule = (fn, ms) => setTimeout(fn, ms) }) {
  let queue = load();
  let inFlightId = null;
  let paused = false;
  let attempt = 0;
  let retryTimer = null;
  let nextId = queue.reduce((m, o) => Math.max(m, o.id), 0) + 1;
  const listeners = new Set();
  const rejectListeners = new Set();
  let idleWaiters = [];

  function load() {
    try { const q = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]'); return Array.isArray(q) ? q : []; }
    catch { return []; }
  }
  function save() {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(queue)); } catch { /* storage full/blocked — keep in memory */ }
  }
  function state() {
    return { pending: queue.length, syncing: inFlightId != null, waiting: queue.length > 0 && inFlightId == null };
  }
  function emit() {
    const s = state();
    for (const fn of listeners) fn(s);
    if (queue.length === 0) { const w = idleWaiters; idleWaiters = []; w.forEach(r => r()); }
  }

  // op: { kind: 'log' | 'unlog', sessionId, exerciseId, setNum, body?, localDate }
  function enqueue(op) {
    const key = `${op.sessionId}:${op.exerciseId}:${op.setNum}`;
    const entry = { ...op, key, id: nextId++ };
    const i = queue.findIndex(o => o.key === key && o.id !== inFlightId);
    if (i >= 0) queue[i] = entry; else queue.push(entry);
    save();
    emit();
    flush();
  }

  async function flush() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    paused = false;
    while (queue.length && inFlightId == null && !paused) {
      const op = queue[0];
      inFlightId = op.id;
      emit();
      let outcome;
      try {
        const status = await send(op);
        outcome = status >= 200 && status < 300 ? 'ok'
                : status === 401 ? 'pause'
                : status >= 500 || status === 408 || status === 429 ? 'retry'
                : 'reject';
        if (outcome === 'reject') op.status = status;
      } catch (e) {
        outcome = 'retry';
        op.error = e?.message;
      }
      inFlightId = null;
      if (outcome === 'ok' || outcome === 'reject') {
        queue = queue.filter(o => o.id !== op.id);
        save();
        attempt = 0;
        if (outcome === 'reject') for (const fn of rejectListeners) fn(op);
      } else if (outcome === 'pause') {
        paused = true;
      } else {
        const delay = BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)];
        retryTimer = schedule(() => { retryTimer = null; flush(); }, delay);
        emit();
        return;
      }
      emit();
    }
  }

  // Merge still-pending ops into a server `logged_sets` list for one session,
  // so a reload while offline shows what the user already logged.
  function overlay(sessionId, rows) {
    const byKey = new Map(rows.map(r => [`${r.exercise_id}:${r.set_num}`, r]));
    for (const op of queue) {
      if (op.sessionId !== sessionId) continue;
      const k = `${op.exerciseId}:${op.setNum}`;
      if (op.kind === 'unlog') byKey.delete(k);
      else byKey.set(k, { ...byKey.get(k), session_id: sessionId, exercise_id: op.exerciseId, set_num: op.setNum, ...op.body });
    }
    return [...byKey.values()];
  }

  return {
    enqueue, flush, overlay, state,
    subscribe(fn) { listeners.add(fn); fn(state()); return () => listeners.delete(fn); },
    onRejected(fn) { rejectListeners.add(fn); return () => rejectListeners.delete(fn); },
    // Resolves once every queued op has been accepted or rejected.
    whenIdle() { return queue.length === 0 ? Promise.resolve() : new Promise(r => idleWaiters.push(r)); },
  };
}
