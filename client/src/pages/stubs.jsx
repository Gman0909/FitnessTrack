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
  const [version, setVersion]         = useState(null);
  const [updateState, setUpdateState] = useState('idle'); // idle | building | restarting | done | error
  const [updateLog, setUpdateLog]     = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    Promise.all([api.getEquipment(), api.getCustomExercises()]).then(([eqList, exList]) => {
      setSaved(new Set(eqList));
      setCustoms(exList);
      setLoading(false);
    });
    fetch('/api/version').then(r => r.json()).then(d => setVersion(d.version)).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

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

      <section style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text)' }}>App</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--muted)' }}>
          Version <strong style={{ color: 'var(--text)' }}>{version ?? '…'}</strong>
        </p>

        {updateState === 'idle' && (
          <button onClick={handleUpdate}
            style={{ padding: '0.55rem 1.25rem', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer' }}>
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
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--success)' }}>Updated to {version}.</p>
            <button onClick={() => window.location.reload()}
              style={{ padding: '0.55rem 1.25rem', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer' }}>
              Reload page
            </button>
          </div>
        )}
        {updateState === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--danger)' }}>Update failed.</p>
            {updateLog && (
              <pre style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.6rem 0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '12rem', overflowY: 'auto', width: '100%' }}>
                {updateLog}
              </pre>
            )}
            <button onClick={() => { setUpdateState('idle'); setUpdateLog(''); }}
              style={{ padding: '0.4rem 0.9rem', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', fontSize: '0.875rem', cursor: 'pointer' }}>
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

