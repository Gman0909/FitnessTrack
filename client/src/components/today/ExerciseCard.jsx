import { useState } from 'react';
import { useUnit } from '../../units.js';
import { computeProgressionHint } from '../../progressionHint.js';
import { mcColor } from './helpers.js';
import { SetRow } from './SetRow.jsx';
import { HistoryIcon, ExerciseHistoryModal } from './ExerciseHistory.jsx';

// ── Exercise card ──────────────────────────────────────────────────────────────

export function ExerciseCard({ exercise, onAddSet, onRemoveSet, onEdit, onResumeWeight, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, getStatus, onWeightChange, onRepsChange, onClickTick, onClickUndo, isBodyweight = false, bodyweightStr = '', onBodyweightChange, isReadOnly = false }) {
  const { unit } = useUnit();
  const [historyOpen, setHistoryOpen] = useState(false);
  const colHeader   = { fontSize:'0.7rem', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--dim)', textAlign:'center' };
  // Header action buttons (history / edit) — sized as proper tap targets.
  const iconBtn     = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'8px',
    width:'34px', height:'34px', display:'flex', alignItems:'center', justifyContent:'center',
    cursor:'pointer', color:'var(--muted)', flexShrink:0, padding:0 };
  const isSetDone   = (setNum) => {
    const st = getStatus(exercise.exercise_id, setNum);
    return st.status === 'logged' || st.status === 'skipped';
  };
  const lastSetDone = isSetDone(exercise.sets.length);
  // "Complete" once every set is logged or skipped.
  const exerciseComplete = exercise.sets.every(s => isSetDone(s.set_num));

  // Reps-only exercises (bodyweight / weight-paused) can only grow by adding
  // sets, up to the user's configured optimal_sets ceiling (default 6). When
  // all sets are logged at the rep ceiling and the optimal target is reached,
  // there is no further automatic progression path — a stall alert fires.
  const repsOnly    = isBodyweight || exercise.pause_weight === 1;
  const optimalSets = exercise.optimal_sets ?? 6;
  const isStalled   = repsOnly && exercise.sets.length >= optimalSets && exerciseComplete &&
    exercise.sets.every(s => {
      const st = getStatus(exercise.exercise_id, s.set_num);
      return st.status === 'logged' && parseInt(st.reps, 10) >= exercise.rep_max;
    });

  // Progressive-overload hint: arrow + % volume delta + primary weight bump +
  // total reps delta — this session's target vs the user's last logged
  // performance of this exercise. Shown only while the card is in progress;
  // it disappears once every set is logged.
  const volumeHint = computeProgressionHint({
    sets: exercise.sets,
    repMin: exercise.rep_min,
    repMax: exercise.rep_max,
    exerciseComplete,
    isBodyweight,
    unit,
  });

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',''); onDragStart(); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; onDragOver(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      style={{ position:'relative', border:`1px solid ${isDragOver ? 'var(--muted)' : 'var(--border)'}`, borderRadius:'10px', padding:'1rem', marginTop:'1rem', marginBottom:'0.75rem', background: isDragOver ? 'var(--surface2)' : 'var(--surface)', transition:'border-color 0.1s, background 0.1s' }}
    >
      {/* Muscle-group tab — straddles the card's top edge, aligned to the
          left edge of the weight-input column. */}
      <div style={{ position:'absolute', top:'-12px', left:'1rem', display:'inline-flex', alignItems:'center', gap:'5px',
        background:'var(--surface3)', border:`1px solid ${mcColor(exercise.muscle_group)}66`, borderRadius:'6px', padding:'3px 9px' }}>
        <div style={{ display:'flex', gap:'2px', alignItems:'center' }}>
          {[7,10,7].map((h,i) => <div key={i} style={{ width:'2.5px', height:`${h}px`, background:mcColor(exercise.muscle_group), borderRadius:'2px' }} />)}
        </div>
        <span style={{ fontSize:'0.66rem', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', color:mcColor(exercise.muscle_group) }}>{exercise.muscle_group}</span>
      </div>
      <div style={{ display:'flex', alignItems:'flex-start', gap:'0.5rem', marginBottom:'0.8rem', cursor:'grab', userSelect:'none' }}>
        <span style={{ color:'var(--dim)', fontSize:'1rem', marginTop:'6px', flexShrink:0, letterSpacing:'-1px' }}>⠿</span>
        <div style={{ flex:1, minWidth:0 }}>
          {/* Row 1 — name (own line, wraps freely) + action buttons */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
            <span style={{ fontWeight:'600', fontSize:'1.05rem', color:'var(--text)', lineHeight:1.3, minWidth:0 }}>
              {exercise.name}
              {exerciseComplete && <span style={{ color:'var(--success)', marginLeft:'6px' }}>✓</span>}
            </span>
            <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
              <button type="button" onClick={e => { e.stopPropagation(); setHistoryOpen(true); }}
                style={iconBtn} title="View history">
                <HistoryIcon />
              </button>
              {onEdit && (
                <button type="button" onClick={e => { e.stopPropagation(); onEdit(); }}
                  style={{ ...iconBtn, fontSize:'1.2rem', lineHeight:1 }} title="Edit exercise">
                  ✎
                </button>
              )}
              {exercise.pause_weight === 1 && (
                <button type="button" onClick={e => { e.stopPropagation(); onResumeWeight?.(); }}
                  style={{ ...iconBtn, borderColor:'#e0a030', color:'#e0a030' }}
                  title="Weight is paused — tap to resume weight progression">
                  <span style={{ display:'inline-flex', gap:'3px' }}>
                    <span style={{ width:'3px', height:'13px', background:'currentColor', borderRadius:'1.5px' }} />
                    <span style={{ width:'3px', height:'13px', background:'currentColor', borderRadius:'1.5px' }} />
                  </span>
                </button>
              )}
            </div>
          </div>
          {exercise.equipment && (
            <div style={{ fontSize:'0.75rem', color:'var(--dim)', textTransform:'capitalize', marginTop:'7px' }}>
              {exercise.equipment}
            </div>
          )}
        </div>
      </div>

      {isBodyweight && (() => {
        const bwLocked = exercise.sets.some(s => isSetDone(s.set_num));
        return (
          <div style={{ marginBottom:'0.75rem' }}>
            <div style={{ fontSize:'0.75rem', color:'var(--muted)', marginBottom:'4px' }}>Bodyweight</div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <input
                type="number" value={bodyweightStr} min="0" step="0.5"
                onChange={e => onBodyweightChange?.(e.target.value)}
                placeholder={unit === 'lbs' ? '160' : '70'}
                disabled={bwLocked}
                style={{ padding:'0.4rem 0.6rem', border:'1px solid var(--border)', borderRadius:'8px', background:'var(--input-bg)', color: bwLocked ? 'var(--dim)' : 'var(--text)', width:'100px', textAlign:'center', fontSize:'1rem', outline:'none', opacity: bwLocked ? 0.6 : 1, cursor: bwLocked ? 'not-allowed' : 'text' }}
              />
              <span style={{ fontSize:'0.875rem', color:'var(--dim)' }}>{unit}</span>
              {bwLocked && <span style={{ fontSize:'0.75rem', color:'var(--dim)' }}>locked</span>}
            </div>
          </div>
        );
      })()}

      <div style={{ display:'grid', gridTemplateColumns: isBodyweight ? '1fr 44px' : '1fr 1fr 44px', gap:'10px', marginBottom:'8px' }}>
        {!isBodyweight && <div style={colHeader}>Weight</div>}
        <div style={colHeader}>Reps</div>
        <div style={{ ...colHeader, textAlign:'center' }}>Log</div>
      </div>

      {exercise.sets.map(set => {
        const st = getStatus(exercise.exercise_id, set.set_num);
        return (
          <SetRow key={set.set_num} set={set}
            isBodyweight={isBodyweight}
            bodyweightStr={bodyweightStr}
            isReadOnly={isReadOnly}
            status={st.status}
            weight={st.weight}
            reps={st.reps}
            repMin={exercise.rep_min}
            repMax={exercise.rep_max}
            onWeightChange={(val) => onWeightChange(exercise.exercise_id, set.set_num, val)}
            onRepsChange={(val) => onRepsChange(exercise.exercise_id, set.set_num, val)}
            onClickTick={() => onClickTick(exercise.exercise_id, set.set_num)}
            onClickUndo={() => onClickUndo(exercise.exercise_id, set.set_num)}
          />
        );
      })}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'8px', paddingTop:'8px', borderTop:'1px solid var(--border)' }}>
        <span style={{ fontSize:'0.72rem', color: isStalled ? '#f0a030' : volumeHint ? volumeHint.color : 'var(--muted)', letterSpacing:'0.01em' }}>
          {isStalled
            ? <>
                Progression stalled at optimal set target.{' '}
                {onEdit && (
                  <button type="button" onClick={e => { e.stopPropagation(); onEdit(); }}
                    style={{ background:'none', border:'none', color:'#f0a030', textDecoration:'underline', cursor:'pointer', fontSize:'0.72rem', padding:'4px 2px', margin:'-4px -2px' }}>
                    Edit settings
                  </button>
                )}
              </>
            : (volumeHint?.text ?? '')}
        </span>
        {!isReadOnly && (
          <div style={{ display:'flex', gap:'0.4rem' }}>
            <button type="button" onClick={onRemoveSet} disabled={exercise.sets.length <= 1 || lastSetDone}
              style={{ padding:'0.2rem 0.65rem', background:'none', border:'1px solid var(--border)', borderRadius:'4px', color: exercise.sets.length <= 1 || lastSetDone ? 'var(--border)' : 'var(--dim)', fontSize:'0.8rem', cursor: exercise.sets.length <= 1 || lastSetDone ? 'default' : 'pointer' }}>
              − set
            </button>
            <button type="button" onClick={onAddSet}
              style={{ padding:'0.2rem 0.65rem', background:'none', border:'1px solid var(--border)', borderRadius:'4px', color:'var(--muted)', fontSize:'0.8rem', cursor:'pointer' }}>
              + set
            </button>
          </div>
        )}
      </div>

      {historyOpen && (
        <ExerciseHistoryModal exercise={exercise} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  );
}
