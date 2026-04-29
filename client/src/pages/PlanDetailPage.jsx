import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { useUnit } from '../units.js';

const DAY_LABELS    = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'];
const ALL_EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'];

// ── Inline name editor ────────────────────────────────────────────────────────

function PlanNameEditor({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(name);
  const inputRef              = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    const trimmed = val.trim();
    if (trimmed && trimmed !== name) onSave(trimmed);
    else setVal(name);
    setEditing(false);
  }

  if (editing) return (
    <input
      ref={inputRef}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(name); setEditing(false); } }}
      style={{ fontSize: '1.35rem', fontWeight: '700', background: 'none', border: 'none', borderBottom: '2px solid var(--text)', color: 'var(--text)', outline: 'none', width: '100%', padding: '0 0 2px' }}
    />
  );

  return (
    <h2
      onClick={() => setEditing(true)}
      title="Click to rename"
      style={{ margin: 0, color: 'var(--text)', cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
    >
      {name}
      <span style={{ fontSize: '0.7rem', color: 'var(--dim)' }}>✎</span>
    </h2>
  );
}

// ── Exercise picker modal ─────────────────────────────────────────────────────

function AddExerciseModal({ dayIndex, planId, onAdd, onClose }) {
  const [exercises, setExercises]     = useState([]);
  const [search, setSearch]           = useState('');
  const [muscleFilter, setMuscle]     = useState('');
  const [equipFilter, setEquipFilter] = useState('');
  const [selected, setSelected]       = useState(null);
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState('');
  const [newMuscle, setNewMuscle]     = useState('');
  const [newEquip, setNewEquip]       = useState('');
  const [newIncr, setNewIncr]         = useState('2.5');
  const [setCount, setSetCount]       = useState(3);
  const [startWeight, setStartWeight] = useState('');
  const [startReps, setStartReps]     = useState(8);
  const [saving, setSaving]           = useState(false);
  const { unit, toKg }                = useUnit();

  useEffect(() => { api.getExercises({ user_equipment: true }).then(setExercises); }, []);

  const muscleGroups   = [...new Set(exercises.map(e => e.muscle_group))].sort();
  const equipmentTypes = [...new Set(exercises.map(e => e.equipment))].sort();
  const filtered = exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) &&
    (!muscleFilter || e.muscle_group === muscleFilter) &&
    (!equipFilter  || e.equipment    === equipFilter)
  );

  async function handleCreateExercise() {
    if (!newName.trim() || !newMuscle || !newEquip) return;
    setSaving(true);
    try {
      const ex = await api.createExercise({ name: newName.trim(), muscle_group: newMuscle, equipment: newEquip, default_increment: parseFloat(newIncr) || 2.5 });
      setSelected(ex);
      setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  const isBodyweight = selected?.equipment === 'bodyweight';
  const parsedWeight = startWeight !== '' ? parseFloat(startWeight) : null;
  const weightValid  = isBodyweight || parsedWeight === null || (Number.isFinite(parsedWeight) && parsedWeight > 0);

  async function handleAdd() {
    if (!selected || !weightValid) return;
    setSaving(true);
    try {
      await api.addToPlanSchedule(planId, { day_of_week: dayIndex, exercise_id: selected.id, set_count: setCount, position: 999 });
      const weightKg   = isBodyweight ? 0 : (parsedWeight !== null ? toKg(parsedWeight) : null);
      const targetReps = isBodyweight ? 10 : startReps;
      if (isBodyweight || weightKg !== null) {
        for (let i = 1; i <= setCount; i++) {
          await api.setTarget({ exercise_id: selected.id, set_num: i, weight: weightKg ?? 0, reps: targetReps, plan_id: planId });
        }
      }
      onAdd();
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text)' };
  const overlay    = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 };
  const sheet      = { background: 'var(--surface2)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '640px', padding: '1.25rem', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ color: 'var(--text)' }}>
            {creating ? 'New custom exercise' : selected ? selected.name : `Add to ${DAY_LABELS[dayIndex]}`}
          </strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: 'var(--muted)' }}>✕</button>
        </div>

        {creating ? (
          <>
            <button onClick={() => setCreating(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 0, textAlign: 'left', fontSize: '0.875rem' }}>← Back to search</button>
            <input autoFocus placeholder="Exercise name" value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} />
            <div>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dim)' }}>Muscle group</p>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {MUSCLE_GROUPS.map(mg => (
                  <button key={mg} onClick={() => setNewMuscle(mg)}
                    style={{ padding: '0.35rem 0.65rem', border: '1px solid var(--border)', borderRadius: '6px', background: newMuscle === mg ? 'var(--btn)' : 'var(--surface)', color: newMuscle === mg ? 'var(--btn-text)' : 'var(--muted)', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                    {mg}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dim)' }}>Equipment</p>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {ALL_EQUIPMENT.map(eq => (
                  <button key={eq} onClick={() => setNewEquip(eq)}
                    style={{ padding: '0.35rem 0.65rem', border: '1px solid var(--border)', borderRadius: '6px', background: newEquip === eq ? 'var(--btn)' : 'var(--surface)', color: newEquip === eq ? 'var(--btn-text)' : 'var(--muted)', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                    {eq}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Weight increment (kg)</label>
              <input type="number" min="0" step="0.5" value={newIncr} onChange={e => setNewIncr(e.target.value)} style={{ ...inputStyle, width: '70px' }} />
            </div>
            <button onClick={handleCreateExercise} disabled={saving || !newName.trim() || !newMuscle || !newEquip}
              style={{ padding: '0.65rem', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '8px', fontWeight: '600', opacity: !newName.trim() || !newMuscle || !newEquip ? 0.4 : 1 }}>
              {saving ? 'Creating…' : 'Create exercise'}
            </button>
          </>
        ) : !selected ? (
          <>
            <input autoFocus placeholder="Search exercises…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select value={muscleFilter} onChange={e => setMuscle(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">All muscles</option>
                {muscleGroups.map(g => <option key={g} value={g} style={{ textTransform: 'capitalize' }}>{g}</option>)}
              </select>
              <select value={equipFilter} onChange={e => setEquipFilter(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">All equipment</option>
                {equipmentTypes.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
              </select>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {filtered.map(ex => (
                <button key={ex.id} onClick={() => setSelected(ex)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', textAlign: 'left' }}>
                  <span style={{ fontWeight: '500' }}>{ex.name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{ex.muscle_group}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  <p style={{ color: 'var(--muted)', fontSize: '0.875rem', margin: '0 0 0.75rem' }}>
                    {search.trim() ? `No results for "${search}"` : 'No exercises. Add equipment in Setup first.'}
                  </p>
                  <button onClick={() => { setNewName(search.trim()); setCreating(true); }}
                    style={{ padding: '0.5rem 1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', fontWeight: '500' }}>
                    + Create custom exercise
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 0, textAlign: 'left', fontSize: '0.875rem' }}>← {selected.name}</button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Sets</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setSetCount(n)} style={{ flex: 1, height: '2.25rem', border: '1px solid var(--border)', borderRadius: '6px', background: setCount === n ? 'var(--btn)' : 'var(--surface)', color: setCount === n ? 'var(--btn-text)' : 'var(--text)' }}>{n}</button>
                  ))}
                </div>
              </div>
              {!isBodyweight && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Starting weight <span style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>(optional)</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="text" inputMode="decimal" value={startWeight} onChange={e => setStartWeight(e.target.value)} placeholder=""
                      style={{ ...inputStyle, width: '90px', borderColor: !weightValid ? 'var(--danger)' : 'var(--border)' }} />
                    <span style={{ fontSize: '0.875rem', color: 'var(--dim)' }}>{unit}</span>
                  </div>
                </div>
              )}
              {!isBodyweight && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Starting reps</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {[6,8,10,12].map(n => (
                      <button key={n} onClick={() => setStartReps(n)} style={{ flex: 1, height: '2.25rem', border: '1px solid var(--border)', borderRadius: '6px', background: startReps === n ? 'var(--btn)' : 'var(--surface)', color: startReps === n ? 'var(--btn-text)' : 'var(--text)', fontSize: '0.85rem' }}>{n}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={handleAdd} disabled={saving || (!isBodyweight && !weightValid)}
              style={{ marginTop: '0.25rem', padding: '0.65rem', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '8px', fontWeight: '600', opacity: saving || (!isBodyweight && !weightValid) ? 0.4 : 1 }}>
              {saving ? 'Adding…' : `Add ${setCount} set${setCount !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Day slot card ─────────────────────────────────────────────────────────────

function DayCard({ day, dayIndex, slots, planId, onAddClick, onRefresh }) {
  const { display }         = useUnit();
  const [dragOver, setDragOver] = useState(null);
  const draggingId          = useRef(null);

  const sorted = [...slots].sort((a, b) => a.position - b.position);

  async function handleDelete(slotId) {
    await api.removePlanSlot(planId, slotId);
    onRefresh();
  }

  async function saveOrder(newOrder) {
    await Promise.all(newOrder.map((s, i) =>
      s.position !== i ? api.updatePlanSlot(planId, s.id, { position: i }) : Promise.resolve()
    ));
    onRefresh();
  }

  function handleDragStart(e, slotId) {
    draggingId.current = slotId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  }

  function handleDragOver(e, slotId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (slotId !== draggingId.current) setDragOver(slotId);
  }

  function handleDrop(e, slotId) {
    e.preventDefault();
    const fromId = draggingId.current;
    setDragOver(null);
    draggingId.current = null;
    if (!fromId || fromId === slotId) return;
    const newOrder = [...sorted];
    const fromIdx  = newOrder.findIndex(s => s.id === fromId);
    const toIdx    = newOrder.findIndex(s => s.id === slotId);
    newOrder.splice(toIdx, 0, newOrder.splice(fromIdx, 1)[0]);
    saveOrder(newOrder);
  }

  function handleDragEnd() {
    setDragOver(null);
    draggingId.current = null;
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '0.75rem', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 1rem', borderBottom: sorted.length ? '1px solid var(--border)' : 'none' }}>
        <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{day}</strong>
        <button onClick={() => onAddClick(dayIndex)} style={{ padding: '0.3rem 0.7rem', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '500' }}>+ Add</button>
      </div>
      {sorted.map((slot, idx) => (
        <div
          key={slot.id}
          draggable
          onDragStart={e => handleDragStart(e, slot.id)}
          onDragOver={e => handleDragOver(e, slot.id)}
          onDrop={e => handleDrop(e, slot.id)}
          onDragEnd={handleDragEnd}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', borderBottom: idx < sorted.length - 1 ? '1px solid var(--border)' : 'none', background: dragOver === slot.id ? 'var(--surface2)' : 'transparent', borderTop: dragOver === slot.id ? '2px solid var(--muted)' : undefined, transition: 'background 0.1s' }}
        >
          <span style={{ cursor: 'grab', color: 'var(--dim)', fontSize: '0.9rem', userSelect: 'none', letterSpacing: '-1px', flexShrink: 0 }}>⠿</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: '500', fontSize: '0.875rem', color: 'var(--text)' }}>{slot.name}</span>
            <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{slot.muscle_group}</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{slot.set_count} sets · {slot.weight != null ? display(slot.weight) : '—'}</span>
          <button onClick={() => handleDelete(slot.id)} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '1rem', padding: '0 4px', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Configure tab ─────────────────────────────────────────────────────────────

function ConfigureTab({ plan, slots, onRefresh }) {
  const [modal, setModal] = useState(null);
  const [days, setDays]   = useState(plan.days);

  async function toggleDay(d) {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort((a, b) => a - b);
    setDays(next);
    await api.updatePlanDays(plan.id, next);
  }

  const slotsByDay = d => slots.filter(s => s.day_of_week === d).sort((a, b) => a.position - b.position);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)', margin: '0 0 0.6rem' }}>Workout days</p>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {DAY_SHORT.map((label, i) => (
            <button key={i} onClick={() => toggleDay(i)}
              style={{ padding: '0.4rem 0.7rem', border: '1px solid var(--border)', borderRadius: '6px', background: days.includes(i) ? 'var(--btn)' : 'var(--surface)', color: days.includes(i) ? 'var(--btn-text)' : 'var(--muted)', fontWeight: days.includes(i) ? '600' : 'normal', fontSize: '0.875rem' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {days.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Select workout days above to configure exercises.</p>
      ) : (
        days.map(d => (
          <DayCard key={d} day={DAY_LABELS[d]} dayIndex={d} slots={slotsByDay(d)} planId={plan.id} onAddClick={d => setModal(d)} onRefresh={onRefresh} />
        ))
      )}

      {modal !== null && (
        <AddExerciseModal
          dayIndex={modal} planId={plan.id}
          onAdd={() => { setModal(null); onRefresh(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Calendar tab ──────────────────────────────────────────────────────────────

function CalendarTab({ planId, weekCount, onWeekCountChange }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getPlanCalendar(planId).then(d => { setData(d); setLoading(false); });
  }, [planId, weekCount]);

  const weekCountControl = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Plan length</span>
      <button type="button" onClick={() => onWeekCountChange(Math.max(1, weekCount - 1))}
        style={{ width: '28px', height: '28px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--text)', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
      <span style={{ minWidth: '60px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text)', fontWeight: '500' }}>{weekCount} week{weekCount !== 1 ? 's' : ''}</span>
      <button type="button" onClick={() => onWeekCountChange(weekCount + 1)}
        style={{ width: '28px', height: '28px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--text)', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
    </div>
  );

  if (loading) return <>{weekCountControl}<p style={{ color: 'var(--muted)' }}>Loading…</p></>;
  if (!data?.weeks?.length) return <>{weekCountControl}<p style={{ color: 'var(--muted)' }}>Activate this plan to start the calendar.</p></>;

  // Collect all distinct workout day_of_week values in order
  const workoutDays = [...new Set(data.weeks.flatMap(w => w.days.map(d => d.day_of_week)))].sort((a, b) => a - b);

  // Build lookup: weekNum → dayOfWeek → day entry
  const lookup = {};
  for (const week of data.weeks) {
    lookup[week.week_num] = {};
    for (const day of week.days) lookup[week.week_num][day.day_of_week] = day;
  }

  const weeks = data.weeks;

  // Column width — fixed so grid scrolls horizontally on narrow screens
  const COL = 90;
  const ROW_LABEL = 72;

  return (
    <div>
      {weekCountControl}
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: ROW_LABEL + weeks.length * (COL + 8) }}>

        {/* Header row: week numbers */}
        <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: '6px' }}>
          <div style={{ width: ROW_LABEL, flexShrink: 0 }} />
          {weeks.map(week => (
            <div key={week.week_num} style={{ width: COL, flexShrink: 0, marginLeft: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                Week {week.week_num}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--dim)', opacity: 0.7 }}>
                {week.start_date.slice(5)}
              </div>
            </div>
          ))}
        </div>

        {/* Data rows: one per workout day */}
        {workoutDays.map(dow => (
          <div key={dow} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
            {/* Day label */}
            <div style={{ width: ROW_LABEL, flexShrink: 0, fontSize: '0.8rem', fontWeight: '500', color: 'var(--muted)', paddingRight: '0.5rem' }}>
              {DAY_SHORT[dow]}
            </div>

            {/* Week cells */}
            {weeks.map(week => {
              const day = lookup[week.week_num]?.[dow];

              if (!day) {
                return (
                  <div key={week.week_num} style={{ width: COL, flexShrink: 0, height: '44px', marginLeft: '8px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.3 }} />
                );
              }

              const completed = day.session?.checked_in === 1;
              const partial   = !completed && (day.session?.logged_count ?? 0) > 0;
              const isPast    = day.is_past && !day.is_today;
              const isToday   = day.is_today;
              const missed    = isPast && !completed && !partial && !day.session;

              let bg        = 'var(--surface)';
              let border    = '1px solid var(--border)';
              let textColor = 'var(--muted)';
              let opacity   = 1;

              if (completed) { bg = '#1e3b1e'; border = '1px solid #2d5a2d'; textColor = 'var(--success)'; }
              if (partial)   { bg = '#2a1c00'; border = '1px solid #5a3c00'; textColor = '#f0a030'; }
              if (isToday)   { border = '2px solid var(--text)'; textColor = 'var(--text)'; }
              if (missed)    { opacity = 0.35; }

              return (
                <div key={week.week_num}
                  style={{ width: COL, flexShrink: 0, height: '44px', marginLeft: '8px', borderRadius: '8px', background: bg, border, opacity, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: isToday || completed ? '600' : 'normal', color: textColor }}>
                    {completed ? '✓✓' : partial ? '✓' : isToday ? '▶' : DAY_SHORT[dow]}
                  </span>
                  {day.date && (
                    <span style={{ fontSize: '0.6rem', color: textColor, opacity: 0.7 }}>{day.date.slice(5)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

// ── Plan Detail Page ──────────────────────────────────────────────────────────

export default function PlanDetailPage() {
  const { id }              = useParams();
  const navigate            = useNavigate();
  const [plan, setPlan]     = useState(null);
  const [slots, setSlots]   = useState([]);
  const [tab, setTab]       = useState('configure');
  const [loading, setLoading]     = useState(true);
  const [activating, setActivating] = useState(false);
  const [weekCount, setWeekCount] = useState(4);

  async function load() {
    const data = await api.getPlan(id);
    setPlan(data);
    setSlots(data.slots);
    setWeekCount(data.week_count ?? 4);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function handleRename(name) {
    await api.updatePlan(id, { name });
    setPlan(p => ({ ...p, name }));
  }

  async function handleActivate() {
    setActivating(true);
    await api.activatePlan(id);
    setPlan(p => ({ ...p, is_active: 1, started_at: p.started_at ?? new Date().toISOString().split('T')[0] }));
    setActivating(false);
  }

  async function handleWeekCountChange(n) {
    setWeekCount(n);
    await api.updatePlan(id, { week_count: n });
  }

  if (loading) return <p style={{ color: 'var(--muted)' }}>Loading…</p>;

  const tabBtn = active => ({
    padding: '0.5rem 1rem', border: 'none', background: 'none', fontSize: '0.9rem', fontWeight: active ? '600' : 'normal',
    color: active ? 'var(--text)' : 'var(--muted)', borderBottom: active ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer',
  });

  return (
    <div>
      <Link to="/schedule" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.05rem', fontWeight: '600', color: 'var(--text)', textDecoration: 'none', marginBottom: '1.5rem' }}>
        ← Workout Plans
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <PlanNameEditor name={plan.name} onSave={handleRename} />
        {plan.is_active === 1
          ? <span style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--success)', border: '1px solid var(--success)', borderRadius: '4px', padding: '0.15rem 0.5rem' }}>Active</span>
          : <button onClick={handleActivate} disabled={activating} style={{ padding: '0.3rem 0.8rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'none', color: 'var(--muted)', fontSize: '0.85rem' }}>
              {activating ? 'Activating…' : 'Activate'}
            </button>
        }
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        <button style={tabBtn(tab === 'configure')} onClick={() => setTab('configure')}>Configure</button>
        <button style={tabBtn(tab === 'calendar')}  onClick={() => setTab('calendar')}>Calendar</button>
      </div>

      {tab === 'configure' && <ConfigureTab plan={plan} slots={slots} onRefresh={load} />}
      {tab === 'calendar'  && <CalendarTab  planId={id} weekCount={weekCount} onWeekCountChange={handleWeekCountChange} />}
    </div>
  );
}
