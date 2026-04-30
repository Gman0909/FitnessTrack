async function req(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} /api${path} → ${res.status}`);
  return res.json();
}

export const api = {
  // Sessions
  getToday:          ()         => req('GET',    '/sessions/today'),
  getSessionForDate: (date)     => req('GET',    `/sessions/date/${date}`),
  skipSession:       (id)       => req('POST',   `/sessions/${id}/skip`),
  getSessionSets:    (id)       => req('GET',    `/sessions/${id}/sets`),
  logSet:            (id, body) => req('POST',   `/sessions/${id}/sets`, body),
  checkin:           (id, body) => req('POST',   `/sessions/${id}/checkin`, body),
  getCheckins:       (id)       => req('GET',    `/sessions/${id}/checkins`),
  resetCheckin:      (id, mg)   => req('DELETE', `/sessions/${id}/checkins/${encodeURIComponent(mg)}`),

  // Schedule
  getScheduleToday:   ()         => req('GET',    '/schedule/today'),
  getScheduleForDay:  (dow)      => req('GET',    `/schedule/today?dow=${dow}`),
  getSchedule:        ()         => req('GET',    '/schedule'),
  addToSchedule:      (body)     => req('POST',   '/schedule', body),
  updateScheduleSlot: (id, body) => req('PATCH',  `/schedule/${id}`, body),
  removeFromSchedule: (id)       => req('DELETE', `/schedule/${id}`),
  setTarget:          (body)     => req('POST',   '/schedule/targets', body),

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
  resetStats: ()              => req('POST', '/stats/reset'),

  // Admin
  triggerUpdate: ()       => req('POST',  '/admin/update'),

  // Auth
  getMe:         ()       => req('GET',   '/auth/me'),
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
