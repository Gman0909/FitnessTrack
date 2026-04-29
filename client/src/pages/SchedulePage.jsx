import { useState, useEffect } from 'react';
import { api } from '../api/index.js';
import { useUnit } from '../units.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ── Add-exercise modal ────────────────────────────────────────────────────────

function AddExerciseModal({ dayIndex, onAdd, onClose }) {
  const [exercises, setExercises]     = useState([]);
  const [search, setSearch]           = useState('');
  const [muscleFilter, setMuscle]     = useState('');
  const [selected, setSelected]       = useState(null);
  const [setCount, setSetCount]       = useState(3);
  const [startWeight, setStartWeight] = useState('');
  const [startReps, setStartReps]     = useState(8);
  const [saving, setSaving]           = useState(false);
  const { unit, toKg }                = useUnit();

  useEffect(() => {
    api.getExercises({ user_equipment: true }).then(setExercises);
  }, []);

  const muscleGroups = [...new Set(exercises.map(e => e.muscle_group))].sort();
  const filtered = exercises.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase());
    const matchMuscle = !muscleFilter || e.muscle_group === muscleFilter;
    return matchSearch && matchMuscle;
  });

  async function handleAdd() {
    if (!selected || !startWeight) return;
    setSaving(true);
    try {
      const weightKg = toKg(parseFloat(startWeight));
      const slot = await api.addToSchedule({ day_of_week: dayIndex, exercise_id: selected.id, set_count: setCount, position: 999 });
      for (let i = 1; i <= setCount; i++) {
        await api.setTarget({ schedule_slot_id: slot.id, exercise_id: selected.id, set_num: i, weight: weightKg, reps: startReps });
      }
      onAdd();
    } finally {
      setSaving(false);
    }
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 };
  const sheet   = { background: 'var(--surface2)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '640px', padding: '1.25rem', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: '0.75rem' };

  const inputStyle = { padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text)' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ color: 'var(--text)' }}>Add to {DAYS[dayIndex]}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: 'var(--muted)' }}>✕</button>
        </div>

        {!selected ? (
          <>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                placeholder="Search exercises…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                autoFocus
              />
              <select value={muscleFilter} onChange={e => setMuscle(e.target.value)} style={inputStyle}>
                <option value="">All muscles</option>
                {muscleGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {filtered.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: '0.875rem', textAlign: 'center', marginTop: '1rem' }}>
                  No exercises found. Add equipment in Setup first.
                </p>
              )}
              {filtered.map(ex => (
                <button key={ex.id} onClick={() => setSelected(ex)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', textAlign: 'left' }}>
                  <span style={{ fontWeight: '500' }}>{ex.name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{ex.muscle_group}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 0, textAlign: 'left', fontSize: '0.875rem' }}>
              ← {selected.name}
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ width: '110px', fontSize: '0.9rem', color: 'var(--muted)' }}>Sets</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setSetCount(n)}
                      style={{ width: '2rem', height: '2rem', border: '1px solid var(--border)', borderRadius: '6px', background: setCount === n ? 'var(--btn)' : 'var(--surface)', color: setCount === n ? 'var(--btn-text)' : 'var(--text)' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ width: '110px', fontSize: '0.9rem', color: 'var(--muted)' }}>Starting weight</label>
                <input
                  type="number" min="0" step="0.5"
                  value={startWeight} onChange={e => setStartWeight(e.target.value)}
                  placeholder={unit === 'lbs' ? '135' : '60'}
                  style={{ ...inputStyle, width: '80px' }}
                />
                <span style={{ fontSize: '0.875rem', color: 'var(--dim)' }}>{unit}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ width: '110px', fontSize: '0.9rem', color: 'var(--muted)' }}>Starting reps</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {[6, 8, 10, 12].map(n => (
                    <button key={n} onClick={() => setStartReps(n)}
                      style={{ width: '2.2rem', height: '2rem', border: '1px solid var(--border)', borderRadius: '6px', background: startReps === n ? 'var(--btn)' : 'var(--surface)', color: startReps === n ? 'var(--btn-text)' : 'var(--text)', fontSize: '0.85rem' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={handleAdd} disabled={saving || !startWeight}
              style={{ marginTop: '0.25rem', padding: '0.65rem', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '8px', fontWeight: '600', opacity: saving || !startWeight ? 0.4 : 1 }}>
              {saving ? 'Adding…' : `Add ${setCount} set${setCount !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Day card ──────────────────────────────────────────────────────────────────

function DayCard({ day, dayIndex, slots, onAddClick, onDelete, onMove }) {
  const { display } = useUnit();

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '0.75rem', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: slots.length ? '1px solid var(--border)' : 'none' }}>
        <strong style={{ fontSize: '0.95rem', color: 'var(--text)' }}>{day}</strong>
        <button onClick={() => onAddClick(dayIndex)}
          style={{ padding: '0.3rem 0.75rem', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '500' }}>
          + Add
        </button>
      </div>

      {slots.map((slot, idx) => (
        <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderBottom: idx < slots.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button onClick={() => onMove(slot.id, -1)} disabled={idx === 0}
              style={{ background: 'none', border: 'none', color: idx === 0 ? 'var(--border)' : 'var(--muted)', lineHeight: 1, padding: '0 2px', fontSize: '0.75rem' }}>▲</button>
            <button onClick={() => onMove(slot.id, 1)} disabled={idx === slots.length - 1}
              style={{ background: 'none', border: 'none', color: idx === slots.length - 1 ? 'var(--border)' : 'var(--muted)', lineHeight: 1, padding: '0 2px', fontSize: '0.75rem' }}>▼</button>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: '500', fontSize: '0.9rem', color: 'var(--text)' }}>{slot.name}</span>
            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{slot.muscle_group}</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {slot.set_count} sets · {slot.weight != null ? display(slot.weight) : '—'}
          </span>
          <button onClick={() => onDelete(slot.id)}
            style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '1rem', padding: '0 4px' }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Schedule Page ─────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);

  async function load() {
    const slots = await api.getSchedule();
    setSchedule(slots);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id) {
    await api.removeFromSchedule(id);
    setSchedule(s => s.filter(slot => slot.id !== id));
  }

  async function handleMove(id, direction) {
    const slot     = schedule.find(s => s.id === id);
    const daySlots = schedule.filter(s => s.day_of_week === slot.day_of_week).sort((a, b) => a.position - b.position);
    const idx      = daySlots.findIndex(s => s.id === id);
    const swapIdx  = idx + direction;
    if (swapIdx < 0 || swapIdx >= daySlots.length) return;

    const other = daySlots[swapIdx];
    await Promise.all([
      api.updateScheduleSlot(id,       { position: other.position }),
      api.updateScheduleSlot(other.id, { position: slot.position  }),
    ]);
    setSchedule(s => s.map(sl => {
      if (sl.id === id)       return { ...sl, position: other.position };
      if (sl.id === other.id) return { ...sl, position: slot.position  };
      return sl;
    }));
  }

  if (loading) return <p style={{ color: 'var(--muted)' }}>Loading…</p>;

  const byDay = DAYS.map((_, i) =>
    schedule.filter(s => s.day_of_week === i).sort((a, b) => a.position - b.position)
  );

  return (
    <div>
      <h2 style={{ marginTop: 0, color: 'var(--text)' }}>Schedule</h2>
      {DAYS.map((day, i) => (
        <DayCard
          key={day} day={day} dayIndex={i}
          slots={byDay[i]}
          onAddClick={d => setModal(d)}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      ))}

      {modal !== null && (
        <AddExerciseModal
          dayIndex={modal}
          onAdd={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
