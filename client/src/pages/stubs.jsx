import { useState, useEffect } from 'react';
import { api } from '../api/index.js';
import { useUnit } from '../units.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const ALL_EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'];
const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'];

// ── Custom exercise edit modal ────────────────────────────────────────────────

function EditExerciseModal({ exercise, onSave, onClose }) {
  const [name,  setName]  = useState(exercise.name);
  const [mg,    setMg]    = useState(exercise.muscle_group);
  const [equip, setEquip] = useState(exercise.equipment);
  const [incr,  setIncr]  = useState(String(exercise.default_increment));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await api.updateExercise(exercise.id, { name: name.trim(), muscle_group: mg, equipment: equip, default_increment: parseFloat(incr) || 2.5 });
    onSave({ ...exercise, name: name.trim(), muscle_group: mg, equipment: equip, default_increment: parseFloat(incr) });
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' };
  const box     = { background: 'var(--surface2)', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' };
  const inp     = { padding: '0.45rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text)', width: '100%' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong style={{ color: 'var(--text)' }}>Edit exercise</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '1.2rem' }}>✕</button>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inp} />
        <div>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dim)' }}>Muscle group</p>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {MUSCLE_GROUPS.map(m => (
              <button key={m} onClick={() => setMg(m)} style={{ padding: '0.3rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: mg === m ? 'var(--btn)' : 'var(--surface)', color: mg === m ? 'var(--btn-text)' : 'var(--muted)', fontSize: '0.82rem', textTransform: 'capitalize' }}>{m}</button>
            ))}
          </div>
        </div>
        <div>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dim)' }}>Equipment</p>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {ALL_EQUIPMENT.map(e => (
              <button key={e} onClick={() => setEquip(e)} style={{ padding: '0.3rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: equip === e ? 'var(--btn)' : 'var(--surface)', color: equip === e ? 'var(--btn-text)' : 'var(--muted)', fontSize: '0.82rem', textTransform: 'capitalize' }}>{e}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Increment (kg)</label>
          <input type="number" min="0" step="0.5" value={incr} onChange={e => setIncr(e.target.value)} style={{ ...inp, width: '70px' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.45rem 1rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'none', color: 'var(--muted)' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} style={{ padding: '0.45rem 1.25rem', border: 'none', borderRadius: '6px', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: '600', opacity: !name.trim() ? 0.4 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Setup Page ────────────────────────────────────────────────────────────────

export function SetupPage() {
  const [saved, setSaved]         = useState(new Set());
  const [customs, setCustoms]     = useState([]);
  const [editTarget, setEdit]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const { unit, toggle }          = useUnit();

  useEffect(() => {
    Promise.all([api.getEquipment(), api.getCustomExercises()]).then(([eqList, exList]) => {
      setSaved(new Set(eqList));
      setCustoms(exList);
      setLoading(false);
    });
  }, []);

  async function handleToggle(eq) {
    if (saved.has(eq)) {
      await api.removeEquipment(eq);
      setSaved(s => { const n = new Set(s); n.delete(eq); return n; });
    } else {
      await api.addEquipment(eq);
      setSaved(s => new Set(s).add(eq));
    }
  }

  if (loading) return <p style={{ color: 'var(--muted)' }}>Loading…</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0, color: 'var(--text)' }}>Setup</h2>

      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text)' }}>Your equipment</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
          Only exercises matching your equipment will show in the Schedule picker.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ALL_EQUIPMENT.map(eq => (
            <label key={eq} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.6rem 0.75rem', border: '1px solid var(--border)', borderRadius: '8px', background: saved.has(eq) ? 'var(--checked-bg)' : 'var(--surface)' }}>
              <input
                type="checkbox"
                checked={saved.has(eq)}
                onChange={() => handleToggle(eq)}
                style={{ width: '1rem', height: '1rem', accentColor: 'var(--success)' }}
              />
              <span style={{ textTransform: 'capitalize', fontWeight: saved.has(eq) ? '500' : 'normal', color: 'var(--text)' }}>{eq}</span>
              {saved.has(eq) && <span style={{ marginLeft: 'auto', color: 'var(--success)', fontSize: '0.8rem' }}>✓</span>}
            </label>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text)' }}>Weight units</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['kg', 'lbs'].map(u => (
            <button key={u} onClick={() => unit !== u && toggle()}
              style={{ padding: '0.5rem 1.25rem', border: '1px solid var(--border)', borderRadius: '6px', background: unit === u ? 'var(--btn)' : 'var(--surface)', color: unit === u ? 'var(--btn-text)' : 'var(--text)', fontWeight: unit === u ? '600' : 'normal' }}>
              {u}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text)' }}>Custom exercises</h3>
        {customs.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>No custom exercises yet. Create one from the Schedule exercise picker.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {customs.map(ex => (
              <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: '500', color: 'var(--text)' }}>{ex.name}</span>
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{ex.muscle_group}</span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--dim)', textTransform: 'capitalize' }}>{ex.equipment}</span>
                <button onClick={() => setEdit(ex)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>Edit</button>
                <button onClick={async () => { await api.deleteExercise(ex.id); setCustoms(c => c.filter(e => e.id !== ex.id)); }}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '1rem', padding: '0 4px' }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {editTarget && (
        <EditExerciseModal
          exercise={editTarget}
          onSave={updated => { setCustoms(c => c.map(e => e.id === updated.id ? updated : e)); setEdit(null); }}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

// ── History Page ──────────────────────────────────────────────────────────────

export function HistoryPage() {
  const [exercises, setExercises] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [metric, setMetric]       = useState('volume');
  const { unit, display }         = useUnit();

  useEffect(() => {
    api.getLoggedExercises().then(list => {
      setExercises(list);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    api.getExerciseHistory(selected.exercise_id).then(setHistory);
  }, [selected]);

  function yValue(row) {
    if (metric === 'max_weight') {
      return unit === 'lbs'
        ? parseFloat((row.max_weight * 2.2046).toFixed(1))
        : row.max_weight;
    }
    return row.volume ?? 0;
  }

  const data = history.map(row => ({
    date: row.date.slice(5),
    y: yValue(row),
  }));

  const yLabel = metric === 'volume' ? 'Volume (kg·reps)' : `Max weight (${unit})`;

  if (loading) return <p style={{ color: 'var(--muted)' }}>Loading…</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0, color: 'var(--text)' }}>History</h2>

      {exercises.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No sessions logged yet.</p>
      ) : (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <select
              value={selected?.exercise_id ?? ''}
              onChange={e => setSelected(exercises.find(ex => ex.exercise_id === Number(e.target.value)) ?? null)}
              style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.95rem', width: '100%', background: 'var(--input-bg)', color: 'var(--text)' }}
            >
              <option value="">Select an exercise…</option>
              {exercises.map(ex => (
                <option key={ex.exercise_id} value={ex.exercise_id}>{ex.name}</option>
              ))}
            </select>
          </div>

          {selected && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {[['volume', 'Volume'], ['max_weight', 'Max weight']].map(([key, label]) => (
                  <button key={key} onClick={() => setMetric(key)}
                    style={{ padding: '0.3rem 0.9rem', border: '1px solid var(--border)', borderRadius: '6px', background: metric === key ? 'var(--btn)' : 'var(--surface)', color: metric === key ? 'var(--btn-text)' : 'var(--text)', fontSize: '0.875rem' }}>
                    {label}
                  </button>
                ))}
              </div>

              {data.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>No data yet for this exercise.</p>
              ) : (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                      <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#666', fontSize: 11 }} width={52}
                        label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, style: { fill: '#666', fontSize: 10 } }} />
                      <Tooltip
                        contentStyle={{ background: '#1c1c1c', border: '1px solid #2e2e2e', borderRadius: '6px', color: '#e8e8e8' }}
                        formatter={v => metric === 'max_weight' ? display(unit === 'lbs' ? v / 2.2046 : v) : `${v} kg·reps`}
                      />
                      <Line type="monotone" dataKey="y" stroke="#e8e8e8" strokeWidth={2} dot={{ r: 3, fill: '#e8e8e8' }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
