import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, outbox, localDateStr } from '../api/index.js';
import { useUnit } from '../units.js';
import { ExerciseEditModal } from '../components/ExerciseEditModal.jsx';
import { WorkoutRecap } from '../components/WorkoutRecap.jsx';
import { weightAdjustedTarget } from '../../../shared/algorithm.js';
import { DAY_LABELS, fmtDate } from '../components/today/helpers.js';
import { WeekShrinkWarningModal, EndOfPlanModal, SkipSessionModal, FinishConfirmModal, ResumeWeightModal } from '../components/today/modals.jsx';
import { DayPickerPanel } from '../components/today/DayPickerPanel.jsx';
import { ExerciseCard } from '../components/today/ExerciseCard.jsx';

// ── Today page ─────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const { unit, toKg, display } = useUnit();
  const navigate = useNavigate();

  // Plan & navigation
  const [activePlan, setActivePlan]   = useState(null);
  const [calendarData, setCalendarData] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null); // { weekNum, dow }
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Slot state
  const [isLocked, setIsLocked]   = useState(false);
  const [isCurrent, setIsCurrent] = useState(false);

  // Week count (mirrors activePlan.week_count, updated optimistically)
  const [weekCount, setWeekCount]           = useState(null);
  const [weekShrinkWarning, setWeekShrinkWarning] = useState(null);
  const [endOfPlanModal, setEndOfPlanModal] = useState(false);
  const [recap, setRecap]                   = useState(null);
  const [pendingEndOfPlan, setPendingEndOfPlan] = useState(false);

  // Session & exercises
  const [session, setSession]       = useState(null);
  const [exercises, setExercises]   = useState([]);

  // Per-set status, weight, reps. Single source of truth — replaces the old
  // doneSet (Set) + initials (Map) + liveValues (ref) + SetRow local state.
  // Key: `${exerciseId}-${setNum}`. Value: { status, weight, reps }.
  // - status: 'idle' | 'logged' | 'skipped'
  // - weight: string in display unit (kg or lbs)
  // - reps: string (raw input)
  const [setStatuses, setSetStatuses] = useState(new Map());

  // Finish workout
  const [reloadKey, setReloadKey]       = useState(0);
  const [finishModal, setFinishModal]   = useState(null);
  const [skipConfirm, setSkipConfirm]   = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);
  const [unpausing, setUnpausing] = useState(null);
  // Guards the one-shot "workout just completed" side effects (calendar
  // refresh, end-of-plan modal) so they don't re-fire every render.
  const completionHandledRef = useRef(false);
  const draftSaveEnabledRef  = useRef(false);
  // Per-set auto-fill defaults (the target weight/reps from the schedule API)
  // captured at slot load. The draft system only persists values that differ
  // from these — otherwise an unchanged target gets saved as a "draft" and
  // later restores stale values when the target advances. Keyed by `${exId}-${setNum}`.
  const slotDefaultsRef = useRef(new Map());

  // Per-exercise bodyweight input (propagates forward to subsequent BW exercises)
  const [bodyweightValues, setBodyweightValues] = useState(new Map());

  // Drag state
  const [dragExerciseId, setDragExId] = useState(null);
  const [dragOverId, setDragOverId]   = useState(null);

  const [loading, setLoading]       = useState(true);
  const [sessLoading, setSessLoading] = useState(false);
  const [error, setError]           = useState(null);
  // A queued set the server refused for good (validation) — shown as a banner.
  const [syncError, setSyncError]   = useState(null);
  // Deload suggestion for the active plan (server: GET /stats/deload).
  const [deload, setDeload]         = useState(null);
  const [deloadDismissed, setDeloadDismissed] = useState(false);

  // ── Step 1: load plan + calendar, pick default slot ──────────────────────────

  useEffect(() => {
    async function init() {
      const plan = await api.getActivePlan();
      if (!plan) { setLoading(false); return; }
      setActivePlan(plan);

      const calData = await api.getPlanCalendar(plan.id);
      setCalendarData(calData);
      api.getDeload().then(setDeload).catch(() => {});

      // Flatten all slots with weekNum embedded; pick the current slot (▶) first
      const allSlots = calData.weeks.flatMap(w =>
        w.days.map(d => ({ weekNum: w.week_num, dow: d.day_of_week, is_current: d.is_current }))
      );
      const def = allSlots.find(s => s.is_current) ?? allSlots[allSlots.length - 1];

      if (def) setSelectedSlot({ weekNum: def.weekNum, dow: def.dow });
      else setLoading(false);
    }
    init().catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (activePlan) setWeekCount(activePlan.week_count ?? 4);
  }, [activePlan?.id]); // eslint-disable-line

  // ── Step 2: load session + exercises when selected slot changes ──────────────

  useEffect(() => {
    if (!selectedSlot || !activePlan) return;

    async function loadSlot() {
      draftSaveEnabledRef.current = false;
      setSessLoading(true);
      setSetStatuses(new Map());
      setDragExId(null);
      setDragOverId(null);
      completionHandledRef.current = false;

      const { weekNum, dow } = selectedSlot;
      const [slotData, exs] = await Promise.all([
        api.getSessionForSlot(activePlan.id, weekNum, dow),
        api.getScheduleForDay(dow, weekNum),
      ]);

      const { session: sess, is_locked, is_current } = slotData;
      setSession(sess);
      setIsLocked(is_locked);
      setIsCurrent(is_current);
      setExercises(exs);

      // Build per-set status from schedule defaults + server-side logged_sets.
      // Schedule provides target weight (in kg). Logged sets override status,
      // weight, reps. Weights are stored in the user's display unit.
      const toDisplay = kg => unit === 'lbs'
        ? String(parseFloat((kg * 2.2046).toFixed(1)))
        : String(kg);
      const statuses = new Map();
      slotDefaultsRef.current = new Map();
      for (const ex of exs) {
        for (const s of ex.sets) {
          const dispWeight = (ex.equipment !== 'bodyweight' && s.weight != null && s.weight > 0)
            ? toDisplay(s.weight)
            : '';
          const key = `${ex.exercise_id}-${s.set_num}`;
          statuses.set(key, { status: 'idle', weight: dispWeight, reps: '' });
          slotDefaultsRef.current.set(key, { weight: dispWeight, reps: '' });
        }
      }

      if (sess) {
        // Overlay ops still waiting in the outbox (e.g. logged while offline).
        const loggedSets = outbox.overlay(sess.id, await api.getSessionSets(sess.id));
        for (const ls of loggedSets) {
          const key = `${ls.exercise_id}-${ls.set_num}`;
          const cur = statuses.get(key) ?? { status: 'idle', weight: '', reps: '' };
          if (ls.skipped) {
            statuses.set(key, { ...cur, status: 'skipped' });
          } else if (ls.reps_done != null) {
            const dispWeight = (ls.weight_used != null && ls.weight_used > 0)
              ? toDisplay(ls.weight_used)
              : cur.weight;
            statuses.set(key, { status: 'logged', weight: dispWeight, reps: String(ls.reps_done) });
          }
        }
      }

      // Overlay draft: restore unsaved weight/reps entered before last reload.
      // Only applies to idle sets — logged/skipped entries come from the server.
      // v2 key — old v1 drafts persisted the auto-filled target weight as if
      // it were a user edit, causing stale values to override fresh targets
      // when the algorithm advanced between visits. Old keys are abandoned.
      const draftKey  = `ft_draft_v2_${activePlan.id}_${weekNum}_${dow}`;
      const savedDraft = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
      if (savedDraft) {
        for (const [key, { weight, reps }] of Object.entries(savedDraft)) {
          const cur = statuses.get(key);
          const def = slotDefaultsRef.current.get(key);
          if (cur?.status === 'idle' && def) {
            // Only restore values that diverge from the current auto-fill —
            // an exact match means it was either the saved auto-fill itself
            // or a user edit that the target has since caught up to. Either
            // way, the auto-fill is already correct.
            if (weight !== '' && weight !== def.weight) cur.weight = weight;
            if (reps   !== '' && reps   !== def.reps)   cur.reps   = reps;
          }
        }
      }
      // Drop the legacy v1 draft so it doesn't keep haunting future visits.
      localStorage.removeItem(`ft_draft_${activePlan.id}_${weekNum}_${dow}`);

      const bwKey    = `ft_bodyweight_${weekNum}_${dow}`;
      const sessionBW = localStorage.getItem(bwKey); // slot-specific only; no global fallback
      const bwMap    = new Map();
      for (const ex of exs) {
        if (ex.equipment !== 'bodyweight') continue;
        if (sessionBW != null) {
          bwMap.set(ex.exercise_id, sessionBW);
        } else {
          // Forward propagation: seed from last logged bodyweight stored in set_targets
          const lastBW = ex.sets[0]?.weight;
          bwMap.set(ex.exercise_id, (lastBW != null && lastBW > 0) ? toDisplay(lastBW) : '');
        }
      }

      setSetStatuses(statuses);
      draftSaveEnabledRef.current = true;
      setBodyweightValues(bwMap);
      setSessLoading(false);
      setLoading(false);
    }

    loadSlot().catch(e => { setError(e.message); setSessLoading(false); setLoading(false); });
  }, [selectedSlot?.weekNum, selectedSlot?.dow, activePlan?.id, reloadKey]); // eslint-disable-line

  // ── Derived state ─────────────────────────────────────────────────────────────

  // Per-set status helpers — read from the lifted setStatuses Map.
  const getStatus = useCallback((exId, setNum) => {
    return setStatuses.get(`${exId}-${setNum}`) ?? { status: 'idle', weight: '', reps: '' };
  }, [setStatuses]);

  function patchStatus(exId, setNum, patch) {
    setSetStatuses(prev => {
      const key = `${exId}-${setNum}`;
      const n = new Map(prev);
      n.set(key, { ...(n.get(key) ?? { status: 'idle', weight: '', reps: '' }), ...patch });
      return n;
    });
  }


  // Week / Day label from the selected slot position
  const weekDayLabel = (() => {
    if (!selectedSlot || !calendarData?.weeks?.length) return null;
    const week = calendarData.weeks.find(w => w.week_num === selectedSlot.weekNum);
    if (!week) return null;
    const idx = week.days.findIndex(d => d.day_of_week === selectedSlot.dow);
    if (idx < 0) return null;
    return { weekNum: selectedSlot.weekNum, dayNum: idx + 1 };
  })();

  const isReadOnly = !isCurrent;

  // The slot immediately before the current slot — the only one eligible for unlock.
  // Server's slotDone now requires checked_in === 1, so this matches.
  const isUnlockable = (() => {
    if (!calendarData?.weeks || !selectedSlot || isCurrent || isLocked) return false;
    if (session?.unlocked) return false;
    if (session?.checked_in !== 1) return false;
    const flat = calendarData.weeks.flatMap(w => w.days.map(d => ({ weekNum: w.week_num, dow: d.day_of_week, is_current: d.is_current })));
    const curIdx = flat.findIndex(s => s.is_current);
    if (curIdx <= 0) return false;
    const prev = flat[curIdx - 1];
    return prev.weekNum === selectedSlot.weekNum && prev.dow === selectedSlot.dow;
  })();

  // A session is "all done" once every scheduled set is logged or skipped.
  // The server marks checked_in automatically as sets are logged; the client
  // derives the same condition so the done state shows without a reload.
  const allDone = exercises.length > 0 && exercises.every(ex =>
    ex.sets.every(s => {
      const st = getStatus(ex.exercise_id, s.set_num);
      return st.status === 'logged' || st.status === 'skipped';
    })
  );

  // "Not now" on the deload banner hides it for the rest of that plan week.
  const deloadKey = activePlan && selectedSlot ? `ft_deload_dismissed_${activePlan.id}_${selectedSlot.weekNum}` : null;
  useEffect(() => {
    if (!deloadKey) return;
    try { setDeloadDismissed(localStorage.getItem(deloadKey) === '1'); } catch { setDeloadDismissed(false); }
  }, [deloadKey]);
  function dismissDeload() {
    setDeloadDismissed(true);
    try { localStorage.setItem(deloadKey, '1'); } catch { /* storage blocked */ }
  }
  const showDeload = deload?.suggest && !deloadDismissed && isCurrent && !allDone;

  // ── Workout-completion side effects ───────────────────────────────────────────
  // When the last set is logged the algorithm has already run server-side
  // (per-exercise, on every set change). Here we just refresh the calendar so
  // the slot advances, and surface the end-of-plan modal — once per session.

  useEffect(() => {
    if (sessLoading || isReadOnly || !allDone || completionHandledRef.current) return;
    completionHandledRef.current = true;
    // Wait until every queued set has reached the server — the calendar and
    // recap must reflect the final set, which may still be in flight (or
    // waiting for the connection to come back).
    const sessId = session?.id;
    outbox.whenIdle().then(() => {
      if (activePlan) api.getPlanCalendar(activePlan.id).then(setCalendarData).catch(() => {});
      // Show the week-on-week recap; if this was the plan's last session, queue the
      // end-of-plan prompt to follow once the recap is dismissed.
      if (sessId) api.getRecap(sessId).then(setRecap).catch(() => {});
    });
    const lastWeek = calendarData?.weeks?.[calendarData.weeks.length - 1];
    const lastDay  = lastWeek?.days?.[lastWeek.days.length - 1];
    if (lastWeek?.week_num === selectedSlot?.weekNum && lastDay?.day_of_week === selectedSlot?.dow)
      setPendingEndOfPlan(true);
  }, [allDone, sessLoading, isReadOnly]); // eslint-disable-line

  // The server permanently refused a queued set (e.g. it failed validation):
  // put the set back the way the server has it and tell the user.
  useEffect(() => outbox.onRejected(op => {
    if (op.sessionId === session?.id) {
      patchStatus(op.exerciseId, op.setNum, { status: op.kind === 'log' ? 'idle' : 'logged' });
      completionHandledRef.current = false;
    }
    setSyncError(op.serverError ?? 'A set could not be saved.');
  }), [session?.id]); // eslint-disable-line

  // Persist unsaved weight/reps so they survive a reload or slot switch.
  // Fired on every setStatuses change; only idle sets with values that DIFFER
  // from the auto-fill default are stored — saving an unchanged target is
  // what produced the stale-draft bug.
  useEffect(() => {
    if (!draftSaveEnabledRef.current || !selectedSlot || !activePlan) return;
    const draft = {};
    for (const [key, val] of setStatuses) {
      if (val.status !== 'idle') continue;
      const def = slotDefaultsRef.current.get(key);
      if (!def) continue;
      const wDiff = val.weight !== '' && val.weight !== def.weight;
      const rDiff = val.reps   !== '' && val.reps   !== def.reps;
      if (wDiff || rDiff) {
        draft[key] = {
          weight: wDiff ? val.weight : '',
          reps:   rDiff ? val.reps   : '',
        };
      }
    }
    const draftKey = `ft_draft_v2_${activePlan.id}_${selectedSlot.weekNum}_${selectedSlot.dow}`;
    if (Object.keys(draft).length > 0) localStorage.setItem(draftKey, JSON.stringify(draft));
    else localStorage.removeItem(draftKey);
  }, [setStatuses]); // eslint-disable-line

  // ── Per-set actions ───────────────────────────────────────────────────────────

  async function handleLog(exId, setNum) {
    if (!session?.id || isReadOnly) return;
    const ex  = exercises.find(e => e.exercise_id === exId);
    if (!ex) return;
    const set = ex.sets.find(s => s.set_num === setNum);
    const cur = getStatus(exId, setNum);
    const isBW = ex.equipment === 'bodyweight';
    const bwStr = bodyweightValues.get(exId);

    // Reps: the typed value, or — when left blank — the recommendation shown in
    // the placeholder (the weight-adjusted target within band, else the plain
    // target). An out-of-band weight has no comparable target, so blank reps
    // can't be logged (the tick is disabled in that case too).
    let repsDone = parseInt(cur.reps, 10);
    let usedRec = false;
    if (!repsDone || repsDone < 1) {
      const repMin = ex.rep_min, repMax = ex.rep_max;
      let rec = null;
      if (!isBW && set?.weight != null && cur.weight !== '') {
        const adj = weightAdjustedTarget({ weight: set.weight, reps: set.reps }, toKg(parseFloat(cur.weight)), { repMin, repMax });
        rec = adj.inBand ? adj.reps : null;
      } else if (set) {
        rec = Math.max(repMin, Math.min(repMax, set.reps ?? repMin));
      }
      if (!rec || rec < 1) return;
      repsDone = rec;
      usedRec = true;
    }

    const weightKg = isBW
      ? (bwStr !== '' && bwStr != null ? toKg(parseFloat(bwStr)) : 0)
      : (cur.weight !== '' ? toKg(parseFloat(cur.weight)) : (set?.weight ?? 0));
    // Optimistic flip. When reps fell back to the recommendation, write it into
    // the input so the logged set shows what was recorded. The server re-derives
    // next-session targets the moment this lands — no check-in step.
    patchStatus(exId, setNum, usedRec ? { status: 'logged', reps: String(repsDone) } : { status: 'logged' });
    setSyncError(null);
    api.queueLogSet(session.id, { exercise_id: exId, set_num: setNum, reps_done: repsDone, skipped: 0, weight_used: weightKg });
  }

  async function handleClear(exId, setNum) {
    if (!session?.id || isReadOnly) return;
    patchStatus(exId, setNum, { status: 'idle' });
    api.queueUnlogSet(session.id, exId, setNum);
  }

  async function handleClickTick(exId, setNum) {
    const cur = getStatus(exId, setNum);
    if (cur.status === 'logged') return handleClear(exId, setNum);
    return handleLog(exId, setNum);
  }

  async function handleClickUndo(exId, setNum) {
    return handleClear(exId, setNum);
  }

  function handleWeightChange(exId, setNum, val) {
    patchStatus(exId, setNum, { weight: val });
    const cur = getStatus(exId, setNum);
    if (cur.status === 'logged') handleClear(exId, setNum);
  }

  function handleRepsChange(exId, setNum, val) {
    patchStatus(exId, setNum, { reps: val });
    const cur = getStatus(exId, setNum);
    if (cur.status === 'logged') handleClear(exId, setNum);
  }

  // ── Drag reorder ──────────────────────────────────────────────────────────────

  async function handleExerciseDrop(targetId) {
    const fromId = dragExerciseId;
    setDragExId(null); setDragOverId(null);
    if (!fromId || fromId === targetId) return;
    const newList = [...exercises];
    const fi = newList.findIndex(e => e.exercise_id === fromId);
    const ti = newList.findIndex(e => e.exercise_id === targetId);
    newList.splice(ti, 0, newList.splice(fi, 1)[0]);
    setExercises(newList);
    const planId = newList[0]?.plan_id;
    if (!planId) return;
    await Promise.all(newList.map((ex, i) => api.updatePlanSlot(planId, ex.schedule_id, { position: i })));
  }

  // ── Add / remove sets ─────────────────────────────────────────────────────────

  async function onAddSet(exerciseId) {
    const ex = exercises.find(e => e.exercise_id === exerciseId);
    if (!ex) return;
    const last   = ex.sets[ex.sets.length - 1];
    const newNum = ex.sets.length + 1;
    const newSet = { set_num: newNum, weight: last.weight, reps: last.reps };
    const prevSt = getStatus(exerciseId, last.set_num);
    setSetStatuses(prev => {
      const n = new Map(prev);
      n.set(`${exerciseId}-${newNum}`, { status: 'idle', weight: prevSt.weight, reps: '' });
      return n;
    });
    setExercises(prev => prev.map(e => e.exercise_id !== exerciseId ? e : { ...e, set_count: e.set_count + 1, sets: [...e.sets, newSet] }));
    await api.updatePlanSlot(ex.plan_id, ex.schedule_id, { set_count: ex.set_count + 1 });
  }

  async function onRemoveSet(exerciseId) {
    const ex = exercises.find(e => e.exercise_id === exerciseId);
    if (!ex || ex.sets.length <= 1) return;
    const lastSt = getStatus(exerciseId, ex.sets.length);
    if (lastSt.status === 'logged' || lastSt.status === 'skipped') return;
    setExercises(prev => prev.map(e => e.exercise_id !== exerciseId ? e : { ...e, set_count: e.set_count - 1, sets: e.sets.slice(0, -1) }));
    setSetStatuses(prev => { const n = new Map(prev); n.delete(`${exerciseId}-${ex.sets.length}`); return n; });
    await api.updatePlanSlot(ex.plan_id, ex.schedule_id, { set_count: ex.set_count - 1 });
  }

  // ── Week count controls ───────────────────────────────────────────────────────

  async function applyWeekCountChange(n) {
    setWeekCount(n);
    await api.updatePlan(activePlan.id, { week_count: n });
    const calData = await api.getPlanCalendar(activePlan.id);
    setCalendarData(calData);
  }

  function handleDecreaseWeek() {
    const n = (weekCount ?? 4) - 1;
    if (n < 1) return;
    const lastWeek = calendarData?.weeks?.[calendarData.weeks.length - 1];
    if (lastWeek?.days.some(d => d.session?.checked_in === 1)) {
      setWeekShrinkWarning({ newCount: n, weekNum: lastWeek.week_num });
      return;
    }
    applyWeekCountChange(n);
  }

  function handleIncreaseWeek() {
    applyWeekCountChange((weekCount ?? 4) + 1);
  }

  // ── End-of-plan clone ─────────────────────────────────────────────────────────

  async function handleEndOfPlanClone(body) {
    const { id: newId } = await api.clonePlan(activePlan.id, body);
    navigate(`/schedule/${newId}`);
  }

  // ── Bodyweight propagation ────────────────────────────────────────────────────

  function handleBodyweightChange(exerciseId, value) {
    if (selectedSlot) localStorage.setItem(`ft_bodyweight_${selectedSlot.weekNum}_${selectedSlot.dow}`, value);
    setBodyweightValues(prev => {
      const next = new Map(prev);
      let found = false;
      for (const ex of exercises) {
        if (ex.exercise_id === exerciseId) found = true;
        if (found && ex.equipment === 'bodyweight') next.set(ex.exercise_id, value);
      }
      return next;
    });
  }

  // ── Unlock previous session ───────────────────────────────────────────────────

  async function handleUnlockSession() {
    if (!session?.id) return;
    await api.unlockSession(session.id);
    const calData = await api.getPlanCalendar(activePlan.id);
    setCalendarData(calData);
    setReloadKey(k => k + 1);
  }

  // ── Skip helpers ──────────────────────────────────────────────────────────────

  async function handleSkipSession() {
    if (!session || isReadOnly) return;
    await api.skipSession(session.id);
    setSession(s => ({ ...s, checked_in: 1 }));
    // Mark every set as skipped locally so the UI updates immediately;
    // the slot reload below will refetch authoritative state.
    setSetStatuses(prev => {
      const n = new Map(prev);
      for (const ex of exercises) {
        for (const s of ex.sets) {
          const k = `${ex.exercise_id}-${s.set_num}`;
          n.set(k, { ...(n.get(k) ?? { weight: '', reps: '' }), status: 'skipped' });
        }
      }
      return n;
    });
    if (activePlan) api.getPlanCalendar(activePlan.id).then(setCalendarData);
    setReloadKey(k => k + 1);
  }

  // ── Finish workout ────────────────────────────────────────────────────────────
  // Bulk-commits every still-unlogged set: those with a weight + reps entered
  // are logged, the rest are skipped. The server re-derives targets per
  // exercise as each set lands.

  function handleFinishWorkout() {
    const toLog = [], toSkip = [];
    for (const ex of exercises) {
      for (const set of ex.sets) {
        const cur = getStatus(ex.exercise_id, set.set_num);
        if (cur.status === 'logged' || cur.status === 'skipped') continue;
        const isBW      = ex.equipment === 'bodyweight';
        const hasWeight = isBW || (cur.weight !== '' && cur.weight != null);
        const hasReps   = cur.reps !== '' && cur.reps != null && parseInt(cur.reps, 10) >= 1;
        if (hasWeight && hasReps) {
          const bwStr   = bodyweightValues.get(ex.exercise_id);
          const weightKg = isBW
            ? (bwStr ? toKg(parseFloat(bwStr)) : 0)
            : toKg(parseFloat(cur.weight));
          toLog.push({ exerciseName: ex.name, exerciseId: ex.exercise_id, setNum: set.set_num,
            weightKg, reps: parseInt(cur.reps, 10) });
        } else {
          toSkip.push({ exerciseName: ex.name, exerciseId: ex.exercise_id, setNum: set.set_num });
        }
      }
    }
    if (toLog.length === 0 && toSkip.length === 0) return; // nothing left to do
    setFinishModal({ toLog, toSkip });
  }

  async function handleConfirmFinish() {
    const { toLog, toSkip } = finishModal;
    // Queue every set (works offline), mark them locally, then reload the slot
    // from the server once the outbox has delivered them.
    for (const item of toLog)
      api.queueLogSet(session.id, { exercise_id: item.exerciseId, set_num: item.setNum, reps_done: item.reps, skipped: 0, weight_used: item.weightKg });
    for (const item of toSkip)
      api.queueLogSet(session.id, { exercise_id: item.exerciseId, set_num: item.setNum, reps_done: null, skipped: 1, weight_used: null });
    setSetStatuses(prev => {
      const n = new Map(prev);
      for (const item of toLog)  n.set(`${item.exerciseId}-${item.setNum}`, { ...n.get(`${item.exerciseId}-${item.setNum}`), status: 'logged', reps: String(item.reps) });
      for (const item of toSkip) n.set(`${item.exerciseId}-${item.setNum}`, { ...n.get(`${item.exerciseId}-${item.setNum}`), status: 'skipped' });
      return n;
    });
    setFinishModal(null);
    outbox.whenIdle().then(() => setReloadKey(k => k + 1));
  }

  // Max weight (kg) across all sets currently shown on the card being edited.
  // Covers both idle (entered but unlogged) and logged weights, in display unit.
  const editingMaxWeightKg = (() => {
    if (!editingExercise || editingExercise.equipment === 'bodyweight') return null;
    let max = 0;
    for (const s of editingExercise.sets) {
      const st  = getStatus(editingExercise.exercise_id, s.set_num);
      const wKg = st.weight !== '' && st.weight != null
        ? toKg(parseFloat(st.weight))
        : (s.weight > 0 ? s.weight : 0);
      if (wKg > max) max = wKg;
    }
    return max > 0 ? max : null;
  })();

  // ── Render ─────────────────────────────────────────────────────────────────────

  if (loading) return <p style={{ color:'var(--muted)', padding:'1rem' }}>Loading…</p>;
  if (error)   return <p style={{ color:'var(--danger)', padding:'1rem' }}>Error: {error}</p>;

  if (!activePlan) return (
    <div>
      <h2 style={{ marginTop:0, color:'var(--text)' }}>Today</h2>
      <p style={{ color:'var(--muted)' }}>No active plan. Go to Schedule to create and activate one.</p>
    </div>
  );

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.85rem' }}>
        <div>
          {weekDayLabel && (
            <div style={{ fontSize:'0.7rem', fontWeight:'700', letterSpacing:'0.14em', color:'var(--dim)', textTransform:'uppercase', marginBottom:'2px' }}>
              Week {weekDayLabel.weekNum}
            </div>
          )}
          <h2 style={{ margin:0, fontSize:'1.75rem', fontWeight:'800', color:'var(--text)', letterSpacing:'-0.02em', lineHeight:1.1 }}>
            {weekDayLabel?.dayNum ? `Day ${weekDayLabel.dayNum}` : (selectedSlot ? DAY_LABELS[selectedSlot.dow] : 'Today')}
          </h2>
          <div style={{ fontSize:'0.8rem', color:'var(--muted)', marginTop:'4px' }}>
            {/* Blank session has session.date = null → show today. First log
                stamps it; once finalized it's locked even after unlock. */}
            {fmtDate(session?.date ?? localDateStr())}
            {activePlan && <span style={{ color:'var(--dim)' }}> · {activePlan.name}</span>}
            {isLocked && <span style={{ marginLeft:'0.5rem', fontSize:'0.72rem', color:'var(--dim)', letterSpacing:'0.05em' }}>· locked</span>}
          </div>
        </div>
        <button type="button" onClick={() => setCalendarOpen(o => !o)}
          style={{ marginTop:'4px', padding:'0.45rem 0.6rem', background: calendarOpen ? 'var(--surface3)' : 'var(--surface)', border:`1px solid ${calendarOpen ? 'var(--muted)' : 'var(--border)'}`, borderRadius:'8px', color:'var(--text)', fontSize:'1.1rem', cursor:'pointer', lineHeight:1 }}
          title="Switch workout day">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <rect x="7" y="14" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      {/* ── Calendar panel ── */}
      {calendarOpen && (
        <DayPickerPanel
          calendarData={calendarData}
          selectedSlot={selectedSlot}
          onSelect={slot => { setSelectedSlot(slot); setCalendarOpen(false); }}
          weekCount={weekCount}
          onDecreaseWeek={handleDecreaseWeek}
          onIncreaseWeek={handleIncreaseWeek}
        />
      )}

      {/* ── Exercises ── */}
      {sessLoading ? (
        <p style={{ color:'var(--muted)' }}>Loading…</p>
      ) : exercises.length === 0 ? (
        <p style={{ color:'var(--muted)' }}>No exercises scheduled for this day.</p>
      ) : (
        <>
          {syncError && (
            <div role="alert" style={{ marginBottom:'1rem', padding:'0.55rem 0.85rem', background:'#2a1010', border:'1px solid #4a1a1a', borderRadius:'8px', fontSize:'0.82rem', color:'var(--danger)', display:'flex', justifyContent:'space-between', gap:'0.75rem' }}>
              <span>Not saved: {syncError}</span>
              <button type="button" onClick={() => setSyncError(null)} aria-label="Dismiss"
                style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', padding:0, fontSize:'0.85rem' }}>Dismiss</button>
            </div>
          )}

          {showDeload && (
            <div role="note" style={{ marginBottom:'1rem', padding:'0.75rem 0.9rem', background:'var(--surface)', border:'1px solid var(--mc-shoulders)', borderRadius:'10px', fontSize:'0.84rem', color:'var(--muted)', lineHeight:1.5 }}>
              <div style={{ color:'var(--text)', fontWeight:'700', marginBottom:'0.25rem' }}>Time for a lighter week?</div>
              {deload.slow} of {deload.judged} lifts have come in under target two sessions in a row
              {deload.slow_lifts?.length > 0 && <> ({deload.slow_lifts.slice(0, 3).join(', ')}{deload.slow_lifts.length > 3 ? `, +${deload.slow_lifts.length - 3} more` : ''})</>}.
              {' '}When most lifts stall together it's usually fatigue, not strength. Try about 10% less weight with the same reps this week —
              your targets will pick up from whatever you actually lift.
              <div style={{ marginTop:'0.5rem' }}>
                <button type="button" onClick={dismissDeload}
                  style={{ background:'none', border:'1px solid var(--border)', borderRadius:'7px', color:'var(--text)', fontSize:'0.8rem', padding:'0.4rem 0.8rem', minHeight:'34px', cursor:'pointer' }}>
                  Not now
                </button>
              </div>
            </div>
          )}

          {isReadOnly && (
            <div style={{ marginBottom:'1rem', padding:'0.55rem 0.85rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', fontSize:'0.8rem', color:'var(--dim)' }}>
              {isLocked ? '🔒 This session is locked — complete the current session first.' : 'Read-only view of a completed session.'}
            </div>
          )}

          {exercises.map(ex => (
            <ExerciseCard
              key={`${session?.id ?? `${selectedSlot?.weekNum}-${selectedSlot?.dow}`}-${ex.exercise_id}`}
              exercise={ex}
              onAddSet={() => onAddSet(ex.exercise_id)}
              onRemoveSet={() => onRemoveSet(ex.exercise_id)}
              onEdit={() => setEditingExercise(ex)}
              onResumeWeight={() => setUnpausing(ex)}
              isDragOver={dragOverId === ex.exercise_id}
              onDragStart={() => setDragExId(ex.exercise_id)}
              onDragOver={() => { if (dragExerciseId && dragExerciseId !== ex.exercise_id) setDragOverId(ex.exercise_id); }}
              onDrop={() => handleExerciseDrop(ex.exercise_id)}
              onDragEnd={() => { setDragExId(null); setDragOverId(null); }}
              getStatus={getStatus}
              onWeightChange={handleWeightChange}
              onRepsChange={handleRepsChange}
              onClickTick={handleClickTick}
              onClickUndo={handleClickUndo}
              isBodyweight={ex.equipment === 'bodyweight'}
              bodyweightStr={bodyweightValues.get(ex.exercise_id) ?? ''}
              onBodyweightChange={val => handleBodyweightChange(ex.exercise_id, val)}
              isReadOnly={isReadOnly}
            />
          ))}

          {allDone ? (
            <div style={{ marginTop:'1rem' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.75rem', padding:'0.85rem 1rem', background:'#152015', border:'1px solid #2d4a2d', borderRadius:'10px', color:'var(--success)', fontWeight:'600' }}>
                <span>✓ All done<span className="ft-banner-short">.</span><span className="ft-banner-full"> — next session targets updated.</span></span>
                {session?.id && (
                  <button type="button" onClick={() => api.getRecap(session.id).then(setRecap).catch(() => {})}
                    style={{ background:'none', border:'none', color:'var(--success)', fontSize:'0.85rem', fontWeight:'600', cursor:'pointer', textDecoration:'underline', padding:0, whiteSpace:'nowrap' }}>
                    Recap
                  </button>
                )}
              </div>
              {isUnlockable && (
                <button type="button" onClick={handleUnlockSession}
                  style={{ marginTop:'0.5rem', background:'none', border:'none', color:'var(--dim)', fontSize:'0.8rem', cursor:'pointer', textDecoration:'underline', padding:'0.25rem 0' }}>
                  Unlock session for editing →
                </button>
              )}
            </div>
          ) : !isReadOnly ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'stretch', gap:'0.5rem', marginTop:'1rem' }}>
              <button type="button" onClick={handleFinishWorkout}
                style={{ padding:'0.75rem 1rem', background:'var(--btn)', color:'var(--btn-text)', border:'none', borderRadius:'10px', fontWeight:'700', fontSize:'1rem', cursor:'pointer' }}>
                Finish Workout
              </button>
              <button type="button" onClick={() => setSkipConfirm(true)}
                style={{ background:'none', border:'none', color:'var(--dim)', fontSize:'0.8rem', cursor:'pointer', textDecoration:'underline', padding:'0.25rem 0' }}>
                Skip entire session →
              </button>
            </div>
          ) : null}
        </>
      )}

      {skipConfirm && (
        <SkipSessionModal
          onConfirm={async () => { await handleSkipSession(); setSkipConfirm(false); }}
          onCancel={() => setSkipConfirm(false)}
        />
      )}

      {editingExercise && (
        <ExerciseEditModal
          exercise={{
            id: editingExercise.exercise_id,
            name: editingExercise.name,
            muscle_group: editingExercise.muscle_group,
            equipment: editingExercise.equipment,
            default_increment: editingExercise.default_increment,
            rep_min: editingExercise.rep_min,
            rep_max: editingExercise.rep_max,
            pause_weight: editingExercise.pause_weight,
            optimal_sets: editingExercise.optimal_sets,
            can_edit: editingExercise.can_edit,
          }}
          slot={{ planId: editingExercise.plan_id, scheduleId: editingExercise.schedule_id, setCount: editingExercise.set_count }}
          maxWeightKg={editingMaxWeightKg}
          onSaved={() => { setEditingExercise(null); setReloadKey(k => k + 1); }}
          onClose={() => setEditingExercise(null)}
        />
      )}

      {unpausing && (
        <ResumeWeightModal
          exerciseName={unpausing.name}
          onConfirm={async () => {
            await api.updateExercise(unpausing.exercise_id, { pause_weight: 0 });
            setUnpausing(null);
            setReloadKey(k => k + 1);
          }}
          onCancel={() => setUnpausing(null)}
        />
      )}

      {finishModal && (
        <FinishConfirmModal
          toLog={finishModal.toLog}
          toSkip={finishModal.toSkip}
          onConfirm={handleConfirmFinish}
          onCancel={() => setFinishModal(null)}
        />
      )}

      {weekShrinkWarning && (
        <WeekShrinkWarningModal
          weekNum={weekShrinkWarning.weekNum}
          onConfirm={() => { applyWeekCountChange(weekShrinkWarning.newCount); setWeekShrinkWarning(null); }}
          onCancel={() => setWeekShrinkWarning(null)}
        />
      )}

      {recap && (
        <WorkoutRecap
          data={recap}
          onClose={() => {
            setRecap(null);
            if (pendingEndOfPlan) { setPendingEndOfPlan(false); setEndOfPlanModal(true); }
          }}
        />
      )}

      {endOfPlanModal && activePlan && (
        <EndOfPlanModal
          plan={activePlan}
          calendarData={calendarData}
          onClone={handleEndOfPlanClone}
          onClose={() => setEndOfPlanModal(false)}
        />
      )}
    </div>
  );
}
