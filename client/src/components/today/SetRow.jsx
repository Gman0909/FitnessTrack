import { useState } from 'react';
import { useUnit } from '../../units.js';
import { weightAdjustedTarget } from '../../../../shared/algorithm.js';

// ── Set row ────────────────────────────────────────────────────────────────────

// Controlled component — status / weight / reps are owned by the parent
// (TodayPage's setStatuses Map). All actions go through callbacks; no local
// state, no refs, no liveValues. This eliminates stale-state-after-reload bugs.
export function SetRow({
  set, isBodyweight, bodyweightStr, isReadOnly,
  status, weight, reps, repMin, repMax,
  onWeightChange, onRepsChange, onClickTick, onClickUndo,
}) {
  const { unit, toKg } = useUnit();
  // Weight last committed (on blur) for the deviation re-targeting below.
  const [evalWeight, setEvalWeight] = useState(weight);

  const pill = { display:'flex', alignItems:'center', justifyContent:'center', background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:'8px', height:'42px', fontSize:'1rem', fontWeight:'500' };

  if (status === 'skipped') return (
    <div style={{ display:'grid', gridTemplateColumns: isBodyweight ? '1fr 44px' : '1fr 1fr 44px', gap:'10px', alignItems:'center', marginBottom:'8px' }}>
      <div style={{ ...pill, color:'var(--dim)', gridColumn: isBodyweight ? '1/2' : '1/3', justifyContent:'flex-start', paddingLeft:'0.75rem' }}>
        <span style={{ fontSize:'0.85rem', color:'var(--dim)' }}>Set {set.set_num} — Skipped</span>
        {!isReadOnly && <button type="button" onClick={onClickUndo} style={{ marginLeft:'auto', marginRight:'0.5rem', background:'none', border:'none', color:'var(--muted)', fontSize:'0.8rem', cursor:'pointer', textDecoration:'underline' }}>Undo</button>}
      </div>
      <div style={{ width:'44px', height:'44px' }} />
    </div>
  );

  const weightFilled = isBodyweight ? bodyweightStr !== '' : weight !== '';
  const isLogged = status === 'logged';
  const inputStyle = { ...pill, width:'100%', color:'var(--text)', outline:'none', textAlign:'center', padding:0,
    borderColor: isLogged ? 'var(--success)' : 'var(--border)', opacity: isReadOnly ? 0.6 : 1 };

  const handleFocusSelect = e => e.target.select();

  // P7: guard against typo-driven progression. A logged weight far off the
  // target (>25%), or an implausibly high rep count, prompts a confirm before
  // logging — only on the log action, not when un-ticking an already-logged set.
  const logWithGuard = () => {
    if (!isLogged) {
      const issues = [];
      if (!isBodyweight && set.weight > 0) {
        const w = toKg(parseFloat(weight));
        if (Number.isFinite(w) && w > 0 && Math.abs(w - set.weight) / set.weight >= 0.25)
          issues.push(`weight (${weight} ${unit})`);
      }
      const r = parseInt(reps, 10);
      if (Number.isFinite(r) && r > Math.max(repMax * 2, 30)) issues.push(`${r} reps`);
      if (issues.length && !window.confirm(`That ${issues.join(' and ')} looks unusual — possible typo. Log it anyway?`))
        return;
    }
    onClickTick();
  };

  const handleKeyDown = e => {
    if (e.key !== 'Enter' || isReadOnly || isLogged) return;
    const repsDone = parseInt(reps, 10);
    if (!repsDone || repsDone < 1) return;
    const weightPresent = isBodyweight ? bodyweightStr !== '' : weight !== '';
    if (!weightPresent) return;
    e.preventDefault();
    e.target.blur();
    logWithGuard();
  };

  // Disable inputs once a set is logged — to edit, un-tick (✓) first.
  const inputsLocked = isReadOnly || isLogged;
  const lockedStyle  = isLogged ? { ...inputStyle, cursor: 'not-allowed' } : inputStyle;

  // Weight-deviation rep target. When the loaded weight differs from the
  // recommendation, the rep target re-derives to preserve volume (±15% band);
  // beyond the band there is no comparable target, shown as "?". Re-evaluated
  // when the weight cell loses focus, or from the logged weight once set is in.
  const effWeight  = isLogged ? weight : evalWeight;
  const adj = (!isBodyweight && set.weight != null && effWeight !== '' && effWeight != null)
    ? weightAdjustedTarget({ weight: set.weight, reps: set.reps }, toKg(parseFloat(effWeight)), { repMin, repMax })
    : null;
  const outOfBand  = adj != null && !adj.inBand;
  const targetReps = (adj && adj.inBand) ? adj.reps : Math.max(repMin, Math.min(repMax, set.reps ?? repMin));

  // The tick activates only when both weight and reps hold a usable value —
  // typed, or available as a recommendation. Weight's recommendation is the
  // pre-filled target (weightFilled covers it); reps has a recommendation
  // whenever the weight is in-band (out-of-band shows "?" and needs a typed
  // value). Clicking with reps blank logs the recommendation (see handleLog).
  const repsEntered = reps !== '' && parseInt(reps, 10) >= 1;
  const canLog = !isReadOnly && (isLogged || (weightFilled && (repsEntered || !outOfBand)));

  // Actual-vs-target glyph. Suppressed on first-time sets and out-of-band
  // weight deviations. Within the ±15% weight band, volume (kg × reps) drives
  // the comparison so that logging a heavier weight for the same reps correctly
  // shows ▲ rather than =.
  const loggedReps = parseInt(reps, 10);
  let perf = null;
  if (isLogged && !outOfBand && Number.isFinite(loggedReps) && targetReps != null && set.prev_reps != null) {
    if (adj && adj.inBand && set.weight != null && set.weight > 0) {
      const wKg = toKg(parseFloat(effWeight));
      const actualVol = wKg * loggedReps;
      const targetVol = set.weight * set.reps;
      // Tolerate the whole-rep rounding of the displayed (weight-adjusted) target:
      // within half a rep of the target volume counts as "met", so hitting the
      // shown rep target after a small weight deviation isn't mis-flagged ▲/▼.
      const tol = wKg * 0.5;
      perf = actualVol > targetVol + tol ? 'up' : actualVol < targetVol - tol ? 'down' : 'met';
    } else {
      perf = loggedReps > targetReps ? 'up' : loggedReps === targetReps ? 'met' : 'down';
    }
  }
  const perfGlyph = { up: '▲', met: '=', down: '▼' };
  const perfColor = { up: 'var(--success)', met: 'var(--dim)', down: 'var(--danger)' };

  return (
    <div style={{ display:'grid', gridTemplateColumns: isBodyweight ? '1fr 44px' : '1fr 1fr 44px', gap:'10px', alignItems:'center', marginBottom:'8px' }}>
      {!isBodyweight && (
        <input type="number" value={weight} onChange={e => onWeightChange(e.target.value)}
          onFocus={handleFocusSelect} onKeyDown={handleKeyDown}
          onBlur={() => setEvalWeight(weight)}
          placeholder={unit} step={unit === 'lbs' ? '1' : '0.5'}
          disabled={inputsLocked}
          style={lockedStyle}
        />
      )}
      <div style={{ position:'relative' }}>
        <input type="number" value={reps} onChange={e => onRepsChange(e.target.value)}
          onFocus={handleFocusSelect} onKeyDown={handleKeyDown}
          placeholder={outOfBand ? '?' : (targetReps != null ? String(targetReps) : 'reps')} min="1" max="999"
          disabled={inputsLocked}
          style={{ ...lockedStyle, width:'100%' }}
        />
        {perf && (
          <span title={`Target ${targetReps}`}
            style={{ position:'absolute', right:'7px', top:'50%', transform:'translateY(-50%)',
              fontSize:'0.8rem', fontWeight:700, color: perfColor[perf], pointerEvents:'none' }}>
            {perfGlyph[perf]}
          </span>
        )}
      </div>
      <div onClick={canLog ? logWithGuard : undefined}
        style={{ width:'44px', height:'44px', borderRadius:'8px', flexShrink:0,
          cursor: isReadOnly ? 'default' : canLog ? 'pointer' : 'default',
          border:`2px solid ${isLogged ? 'var(--success)' : canLog ? 'var(--muted)' : 'var(--border)'}`,
          background: isLogged ? '#1a2e1a' : 'transparent', opacity: isReadOnly && !isLogged ? 0.4 : 1,
          display:'flex', alignItems:'center', justifyContent:'center', transition:'border-color 0.15s, background 0.15s' }}>
        {isLogged && <span style={{ color:'var(--success)', fontSize:'1.3rem', lineHeight:1 }}>✓</span>}
      </div>
    </div>
  );
}
