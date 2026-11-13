import { useState } from 'react';
import { useUnit } from '../../units.js';
import { fmtShort } from './helpers.js';

// ── Week shrink warning modal ─────────────────────────────────────────────────

export function WeekShrinkWarningModal({ weekNum, onConfirm, onCancel }) {
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' };
  const box     = { background: 'var(--surface2)', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border)' };
  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={box}>
        <h3 style={{ margin: 0, color: 'var(--text)' }}>Shorten plan?</h3>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
          Week {weekNum} has logged workouts. Shortening the plan will hide them from view (data is kept).
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel}
            style={{ padding: '0.5rem 1rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'none', color: 'var(--muted)' }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '6px', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: '600' }}>
            Shorten
          </button>
        </div>
      </div>
    </div>
  );
}

// ── End-of-plan modal ─────────────────────────────────────────────────────────

export function EndOfPlanModal({ plan, calendarData, onClone, onClose }) {
  const [step, setStep]         = useState('prompt');
  const [seedWeek, setSeedWeek] = useState(null);
  const [cloning, setCloning]   = useState(false);

  const completedWeeks = calendarData?.weeks?.filter(w =>
    w.days.some(d => (d.session?.exercise_count ?? 0) > 0)
  ) ?? [];

  async function handleClone() {
    setCloning(true);
    await onClone(seedWeek != null ? { seed_week: seedWeek } : {});
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' };
  const box     = { background: 'var(--surface2)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border)' };
  const optBtn  = active => ({ width: '100%', padding: '0.55rem 0.85rem', textAlign: 'left', border: `1px solid ${active ? 'var(--btn)' : 'var(--border)'}`, borderRadius: '8px', background: active ? 'var(--btn)' : 'var(--surface)', color: active ? 'var(--btn-text)' : 'var(--muted)', fontSize: '0.875rem', fontWeight: active ? '600' : 'normal', cursor: 'pointer' });

  if (step === 'prompt') return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1.1rem' }}>Plan complete!</h3>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          You've finished <strong style={{ color: 'var(--text)' }}>{plan.name}</strong>. Consider taking a week off to rest and recover before starting your next cycle.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '0.6rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'none', color: 'var(--muted)', fontWeight: '500' }}>
            Not now
          </button>
          <button onClick={() => setStep('seed')}
            style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: '600' }}>
            Start new cycle →
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setStep('prompt')}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, fontSize: '1rem', lineHeight: 1 }}>←</button>
          <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1rem', fontWeight: '700' }}>Pick up weights from</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button onClick={() => setSeedWeek(null)} style={optBtn(seedWeek === null)}>Original starting weights</button>
          {completedWeeks.map(w => (
            <button key={w.week_num} onClick={() => setSeedWeek(w.week_num)} style={optBtn(seedWeek === w.week_num)}>
              Week {w.week_num}
              {w.start_date && w.end_date && <span style={{ opacity: 0.65, fontWeight: 'normal' }}> · {fmtShort(w.start_date)} – {fmtShort(w.end_date)}</span>}
            </button>
          ))}
          {completedWeeks.length === 0 && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--dim)' }}>No completed weeks to seed from.</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onClose} disabled={cloning}
            style={{ flex: 1, padding: '0.6rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'none', color: 'var(--muted)', fontWeight: '500' }}>
            Cancel
          </button>
          <button onClick={handleClone} disabled={cloning}
            style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: '600' }}>
            {cloning ? 'Cloning…' : 'Clone & edit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skip session confirm modal ────────────────────────────────────────────────

export function SkipSessionModal({ onConfirm, onCancel }) {
  const [value, setValue] = useState('');
  const [busy, setBusy]   = useState(false);
  const confirmed = value.trim().toLowerCase() === 'skip';

  async function handleConfirm() {
    if (!confirmed) return;
    setBusy(true);
    await onConfirm();
  }

  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' };
  const box     = { background:'var(--surface2)', borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'400px', display:'flex', flexDirection:'column', gap:'1.25rem', border:'1px solid var(--border)' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={box}>
        <div>
          <h3 style={{ margin:'0 0 0.5rem', color:'var(--text)', fontSize:'1.1rem', fontWeight:'700' }}>Skip entire session?</h3>
          <p style={{ margin:0, color:'var(--muted)', fontSize:'0.875rem', lineHeight:1.5 }}>
            All sets will be marked as skipped and the session will be closed. This cannot be undone.
          </p>
        </div>
        <div>
          <label style={{ display:'block', fontSize:'0.75rem', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--dim)', marginBottom:'0.4rem' }}>
            Type <strong style={{ color:'var(--text)' }}>skip</strong> to confirm
          </label>
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmed && handleConfirm()}
            placeholder="skip"
            style={{ width:'100%', padding:'0.55rem 0.75rem', border:`1px solid ${confirmed ? 'var(--danger)' : 'var(--border)'}`, borderRadius:'8px', background:'var(--input-bg)', color:'var(--text)', fontSize:'1rem', boxSizing:'border-box', outline:'none' }}
          />
        </div>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{ flex:1, padding:'0.85rem', minHeight:'48px', background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:'8px', fontWeight:'600', fontSize:'0.95rem', cursor:'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={!confirmed || busy}
            style={{ flex:1, padding:'0.85rem', minHeight:'48px', background: confirmed ? 'var(--danger)' : 'var(--surface2)', color: confirmed ? '#fff' : 'var(--dim)', border:'none', borderRadius:'8px', fontWeight:'700', fontSize:'0.95rem', cursor: confirmed && !busy ? 'pointer' : 'default', transition:'background 0.15s, color 0.15s' }}>
            {busy ? 'Skipping…' : 'Skip session'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Finish confirm modal ───────────────────────────────────────────────────────

export function FinishConfirmModal({ toLog, toSkip, onConfirm, onCancel }) {
  const { display } = useUnit();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      setConfirming(false);
      setError('Could not save. Check your connection and try again.');
    }
  }

  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' };
  const box     = { background:'var(--surface2)', borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'500px', maxHeight:'80vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:'1.25rem', border:'1px solid var(--border)' };
  const sectionLabel = { margin:'0 0 0.5rem', fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:'700' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={box}>
        <h3 style={{ margin:0, color:'var(--text)', fontSize:'1.1rem', fontWeight:'700' }}>Finish Workout</h3>

        {toLog.length > 0 && (
          <div>
            <p style={{ ...sectionLabel, color:'var(--success)' }}>Logging ({toLog.length} set{toLog.length !== 1 ? 's' : ''})</p>
            {toLog.map((item, i) => (
              <div key={i} style={{ fontSize:'0.875rem', color:'var(--text)', padding:'3px 0', borderBottom:'1px solid var(--border)' }}>
                {item.exerciseName} · Set {item.setNum}: <span style={{ color:'var(--muted)' }}>{display(item.weightKg)} × {item.reps}</span>
              </div>
            ))}
          </div>
        )}

        {toSkip.length > 0 && (
          <div>
            <p style={{ ...sectionLabel, color:'var(--dim)' }}>Skipping ({toSkip.length} set{toSkip.length !== 1 ? 's' : ''})</p>
            {toSkip.map((item, i) => (
              <div key={i} style={{ fontSize:'0.875rem', color:'var(--muted)', padding:'3px 0', borderBottom:'1px solid var(--border)' }}>
                {item.exerciseName} · Set {item.setNum}
              </div>
            ))}
          </div>
        )}

        {error && (
          <p style={{ margin:0, color:'var(--danger)', fontSize:'0.85rem', textAlign:'center' }}>{error}</p>
        )}
        <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.25rem' }}>
          <button type="button" onClick={onCancel} disabled={confirming}
            style={{ flex:1, padding:'0.85rem', minHeight:'48px', background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:'8px', fontWeight:'600', fontSize:'0.95rem', cursor:'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={confirming}
            style={{ flex:1, padding:'0.85rem', minHeight:'48px', background:'var(--btn)', color:'var(--btn-text)', border:'none', borderRadius:'8px', fontWeight:'700', fontSize:'0.95rem', cursor: confirming ? 'default' : 'pointer' }}>
            {confirming ? 'Logging…' : error ? 'Retry' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Resume-weight confirm modal ───────────────────────────────────────────────

export function ResumeWeightModal({ exerciseName, onConfirm, onCancel }) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  async function handle() {
    setBusy(true);
    setError(null);
    try { await onConfirm(); }
    catch { setBusy(false); setError('Could not save. Check your connection and try again.'); }
  }

  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' };
  const box     = { background:'var(--surface2)', borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'400px', display:'flex', flexDirection:'column', gap:'1rem', border:'1px solid var(--border)' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={box}>
        <h3 style={{ margin:0, color:'var(--text)', fontSize:'1.1rem', fontWeight:'700' }}>Resume weight progression?</h3>
        <p style={{ margin:0, color:'var(--muted)', fontSize:'0.875rem', lineHeight:1.5 }}>
          <strong style={{ color:'var(--text)' }}>{exerciseName}</strong> will start adding
          weight again once you hit the top of its rep range — from your next session onward.
        </p>
        {error && <p style={{ margin:0, color:'var(--danger)', fontSize:'0.85rem' }}>{error}</p>}
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{ flex:1, padding:'0.85rem', minHeight:'48px', background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:'8px', fontWeight:'600', fontSize:'0.95rem', cursor:'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={handle} disabled={busy}
            style={{ flex:1, padding:'0.85rem', minHeight:'48px', background:'var(--btn)', color:'var(--btn-text)', border:'none', borderRadius:'8px', fontWeight:'700', fontSize:'0.95rem', cursor:'pointer' }}>
            {busy ? 'Saving…' : error ? 'Retry' : 'Resume'}
          </button>
        </div>
      </div>
    </div>
  );
}
