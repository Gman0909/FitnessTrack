import { useState, useEffect, useRef } from 'react';
import { api } from '../api/index.js';
import { useUnit } from '../units.js';

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
  const box     = { background: 'var(--surface2)', borderRadius: '12px', padding: '1.25rem', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '90vh', overflowY: 'auto' };
  const inp     = { padding: '0.7rem 0.85rem', minHeight: '46px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '16px', width: '100%' };
  const chip    = (active) => ({
    padding: '0.55rem 0.85rem', minHeight: '40px',
    border: '1px solid var(--border)', borderRadius: '8px',
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
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dim)' }}>Muscle group</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {MUSCLE_GROUPS.map(m => (
              <button key={m} onClick={() => setMg(m)} style={chip(mg === m)}>{m}</button>
            ))}
          </div>
        </div>
        <div>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dim)' }}>Equipment</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {ALL_EQUIPMENT.map(e => (
              <button key={e} onClick={() => setEquip(e)} style={chip(equip === e)}>{e}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Increment (kg)</label>
          <input type="number" min="0" step="0.5" value={incr} onChange={e => setIncr(e.target.value)} style={{ ...inp, width: '90px' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '0.85rem', minHeight: '48px', border: '1px solid var(--border)', borderRadius: '8px', background: 'none', color: 'var(--text)', fontSize: '0.95rem', fontWeight: '500', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} style={{ flex: 1, padding: '0.85rem', minHeight: '48px', border: 'none', borderRadius: '8px', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: '700', fontSize: '0.95rem', opacity: !name.trim() ? 0.4 : 1, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Setup Page ────────────────────────────────────────────────────────────────

const REP_RANGE_OPTIONS = [
  { v: 'powerlifting', l: '5–8',  title: 'Powerlifting' },
  { v: 'standard',     l: '8–12', title: 'Standard' },
  { v: 'volume',       l: '12–15', title: 'Volume' },
];

const AGGRESSIVENESS_OPTIONS = [
  { v: 'conservative', l: 'Slow',   title: 'Conservative' },
  { v: 'moderate',     l: 'Normal', title: 'Moderate' },
  { v: 'aggressive',   l: 'Fast',   title: 'Aggressive' },
];

export function SetupPage() {
  const [saved, setSaved]         = useState(new Set());
  const [customs, setCustoms]     = useState([]);
  const [mgSettings, setMgSettings] = useState([]);
  const [editTarget, setEdit]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const { unit, toggle }          = useUnit();
  const [version, setVersion]         = useState(null);
  const [updateState, setUpdateState] = useState('idle'); // idle | building | restarting | done | error
  const [updateLog, setUpdateLog]     = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    Promise.all([api.getEquipment(), api.getCustomExercises(), api.getMuscleGroupSettings()])
      .then(([eqList, exList, mgList]) => {
        setSaved(new Set(eqList));
        setCustoms(exList);
        setMgSettings(mgList);
        setLoading(false);
      });
    fetch('/api/version').then(r => r.json()).then(d => setVersion(d.version)).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

  async function handleMgUpdate(muscleGroup, field, value) {
    setMgSettings(s => s.map(r => r.muscle_group === muscleGroup ? { ...r, [field]: value } : r));
    await api.updateMuscleGroupSetting(muscleGroup, { [field]: value });
  }

  function waitForRestart() {
    setUpdateState('restarting');
    const start = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - start > 3 * 60 * 1000) {
        clearInterval(pollRef.current);
        setUpdateLog('Server did not come back within 3 minutes.');
        setUpdateState('error');
        return;
      }
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        if (!r.ok) return;
        const { version: newVer } = await r.json();
        clearInterval(pollRef.current);
        setVersion(newVer);
        setUpdateState('done');
      } catch { /* still restarting */ }
    }, 2000);
  }

  async function handleUpdate() {
    setUpdateState('building');
    setUpdateLog('');
    try { await api.triggerUpdate(); } catch { /* fire and forget */ }

    const start = Date.now();
    let seenRunning = false;
    pollRef.current = setInterval(async () => {
      if (Date.now() - start > 10 * 60 * 1000) {
        clearInterval(pollRef.current);
        setUpdateLog('Build timed out after 10 minutes.');
        setUpdateState('error');
        return;
      }
      try {
        const { state, log } = await api.getUpdateStatus();
        if (state === 'running') { seenRunning = true; return; }
        if (state === 'error') {
          clearInterval(pollRef.current);
          setUpdateLog(log);
          setUpdateState('error');
        } else if (state === 'done') {
          // Build finished, server is about to exit — wait for restart
          clearInterval(pollRef.current);
          waitForRestart();
        } else if (state === 'idle' && seenRunning) {
          // Server already restarted (fresh process reset state to idle)
          clearInterval(pollRef.current);
          const r = await fetch('/api/version', { cache: 'no-store' });
          const { version: newVer } = await r.json();
          setVersion(newVer);
          setUpdateState('done');
        }
      } catch {
        // Server unreachable — mid-restart
        clearInterval(pollRef.current);
        waitForRestart();
      }
    }, 2000);
  }

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
            <label key={eq} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.85rem', minHeight: '52px', border: '1px solid var(--border)', borderRadius: '10px', background: saved.has(eq) ? 'var(--checked-bg)' : 'var(--surface)' }}>
              <input
                type="checkbox"
                checked={saved.has(eq)}
                onChange={() => handleToggle(eq)}
                style={{ width: '1.15rem', height: '1.15rem', accentColor: 'var(--success)', flexShrink: 0 }}
              />
              <span style={{ textTransform: 'capitalize', fontWeight: saved.has(eq) ? '600' : '500', fontSize: '0.95rem', color: 'var(--text)' }}>{eq}</span>
              {saved.has(eq) && <span style={{ marginLeft: 'auto', color: 'var(--success)', fontSize: '0.95rem' }}>✓</span>}
            </label>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text)' }}>Weight units</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['kg', 'lbs'].map(u => (
            <button key={u} onClick={() => unit !== u && toggle()}
              style={{ padding: '0.7rem 1.5rem', minHeight: '44px', border: '1px solid var(--border)', borderRadius: '8px', background: unit === u ? 'var(--btn)' : 'var(--surface)', color: unit === u ? 'var(--btn-text)' : 'var(--text)', fontSize: '0.95rem', fontWeight: unit === u ? '600' : '500', cursor: 'pointer' }}>
              {u}
            </button>
          ))}
        </div>
      </section>

      <section style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem', color: 'var(--text)' }}>Training preferences</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
          Rep range controls when weight increases; speed controls how boldly the algorithm responds to positive check-in signals.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {mgSettings.map(({ muscle_group, rep_range, aggressiveness }) => (
            <div key={muscle_group} style={{
              display: 'flex', flexDirection: 'column', gap: '0.65rem',
              padding: '0.85rem 0.9rem',
              border: '1px solid var(--border)', borderRadius: '10px',
              background: 'var(--surface)',
            }}>
              <span style={{
                fontWeight: '600', color: 'var(--text)', textTransform: 'capitalize', fontSize: '0.95rem',
              }}>{muscle_group}</span>

              <div>
                <span style={{ display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--dim)', fontWeight: '600', marginBottom: '0.3rem' }}>Rep range</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.35rem' }}>
                  {REP_RANGE_OPTIONS.map(({ v, l, title }) => (
                    <button key={v} title={title} onClick={() => handleMgUpdate(muscle_group, 'rep_range', v)}
                      style={{ padding: '0.55rem 0', minHeight: '40px', border: `1px solid ${rep_range === v ? 'var(--btn)' : 'var(--border)'}`, borderRadius: '8px', fontSize: '0.85rem', background: rep_range === v ? 'var(--btn)' : 'var(--surface2)', color: rep_range === v ? 'var(--btn-text)' : 'var(--text)', fontWeight: rep_range === v ? '600' : '500', cursor: 'pointer' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--dim)', fontWeight: '600', marginBottom: '0.3rem' }}>Progression</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.35rem' }}>
                  {AGGRESSIVENESS_OPTIONS.map(({ v, l, title }) => (
                    <button key={v} title={title} onClick={() => handleMgUpdate(muscle_group, 'aggressiveness', v)}
                      style={{ padding: '0.55rem 0', minHeight: '40px', border: `1px solid ${aggressiveness === v ? 'var(--btn)' : 'var(--border)'}`, borderRadius: '8px', fontSize: '0.85rem', background: aggressiveness === v ? 'var(--btn)' : 'var(--surface2)', color: aggressiveness === v ? 'var(--btn-text)' : 'var(--text)', fontWeight: aggressiveness === v ? '600' : '500', cursor: 'pointer' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text)' }}>Custom exercises</h3>
        {customs.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>No custom exercises yet. Create one from the Schedule exercise picker.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {customs.map(ex => (
              <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.7rem 0.85rem', minHeight: '52px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontWeight: '500', fontSize: '0.95rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</span>
                  <span style={{ display: 'flex', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--dim)' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: `var(--mc-${ex.muscle_group}, var(--muted))` }}>{ex.muscle_group}</span>
                    <span>·</span>
                    <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{ex.equipment}</span>
                  </span>
                </div>
                <button onClick={() => setEdit(ex)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.82rem', padding: '0.5rem 0.75rem', minHeight: '40px', cursor: 'pointer', flexShrink: 0 }}>Edit</button>
                <button onClick={async () => { await api.deleteExercise(ex.id); setCustoms(c => c.filter(e => e.id !== ex.id)); }}
                  aria-label="Remove custom exercise"
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '1.1rem', cursor: 'pointer', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '6px' }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text)' }}>App</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--muted)' }}>
          Version <strong style={{ color: 'var(--text)' }}>{version ?? '…'}</strong>
        </p>

        {updateState === 'idle' && (
          <button onClick={handleUpdate}
            style={{ padding: '0.85rem 1.4rem', minHeight: '46px', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '0.95rem', cursor: 'pointer' }}>
            Update to latest
          </button>
        )}
        {updateState === 'building' && (
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Pulling and rebuilding… this takes a minute or two.</p>
        )}
        {updateState === 'restarting' && (
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Restarting server…</p>
        )}
        {updateState === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--success)' }}>Updated to {version}.</p>
            <button onClick={() => window.location.reload()}
              style={{ padding: '0.85rem 1.4rem', minHeight: '46px', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '0.95rem', cursor: 'pointer' }}>
              Reload page
            </button>
          </div>
        )}
        {updateState === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--danger)' }}>Update failed.</p>
            {updateLog && (
              <pre style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.65rem 0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '12rem', overflowY: 'auto', width: '100%' }}>
                {updateLog}
              </pre>
            )}
            <button onClick={() => { setUpdateState('idle'); setUpdateLog(''); }}
              style={{ padding: '0.65rem 1.1rem', minHeight: '40px', background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', fontWeight: '500', cursor: 'pointer' }}>
              Dismiss
            </button>
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

