import { useState } from 'react';
import { api } from '../api/index.js';

const ALL_EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'];
const MUSCLE_GROUPS  = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'];

// Edits an exercise's library properties — name, muscle group, equipment,
// weight increment and rep range. When `slot` is supplied (the exercise sits
// on a plan day) the set count for that slot is editable here too.
//
// Props:
//   exercise : { id, name, muscle_group, equipment, default_increment, rep_min, rep_max }
//   slot     : { planId, scheduleId, setCount }  — optional
//   onSaved  : () => void   — called after a successful save
//   onClose  : () => void
export function ExerciseEditModal({ exercise, slot, onSaved, onClose }) {
  const [name,   setName]   = useState(exercise.name);
  const [mg,     setMg]     = useState(exercise.muscle_group);
  const [equip,  setEquip]  = useState(exercise.equipment);
  const [incr,   setIncr]   = useState(String(exercise.default_increment ?? 2.5));
  const [repMin, setRepMin] = useState(String(exercise.rep_min ?? 8));
  const [repMax, setRepMax] = useState(String(exercise.rep_max ?? 12));
  const [sets,   setSets]   = useState(slot?.setCount ?? null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const mn = parseInt(repMin, 10), mx = parseInt(repMax, 10);
  const rangeValid = Number.isInteger(mn) && Number.isInteger(mx) && mn >= 1 && mx > mn;
  const canSave    = name.trim() && rangeValid;

  async function handleSave() {
    if (!canSave) { if (!rangeValid) setError('Rep max must be a whole number above rep min.'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.updateExercise(exercise.id, {
        name: name.trim(), muscle_group: mg, equipment: equip,
        default_increment: parseFloat(incr) || 2.5, rep_min: mn, rep_max: mx,
      });
      if (slot && sets !== slot.setCount)
        await api.updatePlanSlot(slot.planId, slot.scheduleId, { set_count: sets });
    } catch {
      setSaving(false);
      setError('Could not save. Check your connection and try again.');
      return;
    }
    onSaved();
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' };
  const box     = { background: 'var(--surface2)', borderRadius: '12px', padding: '1.25rem', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' };
  const inp     = { padding: '0.7rem 0.85rem', minHeight: '46px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '16px', width: '100%' };
  const label   = { margin: '0 0 0.5rem', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dim)' };
  const chip    = (active) => ({
    padding: '0.55rem 0.85rem', minHeight: '40px',
    border: `1px solid ${active ? 'var(--btn)' : 'var(--border)'}`, borderRadius: '8px',
    background: active ? 'var(--btn)' : 'var(--surface)',
    color: active ? 'var(--btn-text)' : 'var(--text)',
    fontSize: '0.88rem', fontWeight: active ? '600' : '500',
    textTransform: 'capitalize', cursor: 'pointer',
  });

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ color: 'var(--text)', fontSize: '1rem' }}>Edit exercise</strong>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.5rem', cursor: 'pointer', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '-8px' }}>✕</button>
        </div>

        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inp} />

        <div>
          <p style={label}>Muscle group</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {MUSCLE_GROUPS.map(m => (
              <button key={m} onClick={() => setMg(m)} style={chip(mg === m)}>{m}</button>
            ))}
          </div>
        </div>

        <div>
          <p style={label}>Equipment</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {ALL_EQUIPMENT.map(e => (
              <button key={e} onClick={() => setEquip(e)} style={chip(equip === e)}>{e}</button>
            ))}
          </div>
        </div>

        {slot && (
          <div>
            <p style={label}>Default sets</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '0.35rem' }}>
              {[1,2,3,4,5,6].map(n => (
                <button key={n} onClick={() => setSets(n)} style={{ ...chip(sets === n), padding: '0.55rem 0', textAlign: 'center' }}>{n}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Rep range</span>
          <input type="number" min="1" value={repMin} onChange={e => setRepMin(e.target.value)}
            style={{ ...inp, width: '66px', borderColor: rangeValid ? 'var(--border)' : 'var(--danger)' }} />
          <span style={{ color: 'var(--dim)' }}>–</span>
          <input type="number" min="2" value={repMax} onChange={e => setRepMax(e.target.value)}
            style={{ ...inp, width: '66px', borderColor: rangeValid ? 'var(--border)' : 'var(--danger)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Weight increment</span>
          <input type="number" min="0" step="0.5" value={incr} onChange={e => setIncr(e.target.value)}
            style={{ ...inp, width: '80px' }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--dim)' }}>kg</span>
        </div>

        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--dim)', lineHeight: 1.5 }}>
          Rep range, weight increment and set count are personal to you. Name,
          muscle group and equipment are shared across accounts.
        </p>

        {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '0.85rem', minHeight: '48px', border: '1px solid var(--border)', borderRadius: '8px', background: 'none', color: 'var(--text)', fontSize: '0.95rem', fontWeight: '500', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !canSave}
            style={{ flex: 1, padding: '0.85rem', minHeight: '48px', border: 'none', borderRadius: '8px', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: '700', fontSize: '0.95rem', opacity: canSave ? 1 : 0.4, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
