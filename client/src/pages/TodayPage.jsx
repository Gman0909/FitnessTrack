import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/index.js';
import { useUnit } from '../units.js';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MC_COLORS = {
  chest: '#f07098', back: '#3cc9b0', shoulders: '#f0a030',
  biceps: '#3cc9b0', triceps: '#f07098', legs: '#b088e8', core: '#4caf50',
};
function mcColor(mg) { return MC_COLORS[mg] ?? '#777'; }

function groupByMuscle(exercises) {
  const order = [], map = new Map();
  for (const ex of exercises) {
    if (!map.has(ex.muscle_group)) { map.set(ex.muscle_group, []); order.push(ex.muscle_group); }
    map.get(ex.muscle_group).push(ex);
  }
  return order.map(mg => ({ muscle_group: mg, exercises: map.get(mg) }));
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ── Muscle group badge ─────────────────────────────────────────────────────────

function MuscleGroupBadge({ muscleGroup }) {
  const color = mcColor(muscleGroup);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: `${color}0f`, border: `1px solid ${color}66`, borderRadius: '6px', padding: '4px 10px 4px 8px' }}>
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
        {[10, 14, 10].map((h, i) => <div key={i} style={{ width: '3px', height: `${h}px`, background: color, borderRadius: '2px' }} />)}
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color }}>{muscleGroup}</span>
    </div>
  );
}

// ── Week shrink warning modal ─────────────────────────────────────────────────

function WeekShrinkWarningModal({ weekNum, onConfirm, onCancel }) {
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

function EndOfPlanModal({ plan, calendarData, onClone, onClose }) {
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

// ── Day picker panel ──────────────────────────────────────────────────────────

function DayPickerPanel({ calendarData, selectedSlot, onSelect, weekCount, onDecreaseWeek, onIncreaseWeek }) {
  if (!calendarData?.weeks?.length) return (
    <div style={{ padding: '0.75rem 0', marginBottom: '1rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
      No active plan. Set one up in the Schedule tab.
    </div>
  );

  const workoutDays = [...new Set(calendarData.weeks.flatMap(w => w.days).map(d => d.day_of_week))].sort((a, b) => a - b);
  const weeks       = calendarData.weeks;
  const lookup      = {};
  for (const week of weeks) {
    lookup[week.week_num] = {};
    for (const day of week.days) lookup[week.week_num][day.day_of_week] = day;
  }

  const COL = 64, ROW_LABEL = 44;

  return (
    <div style={{ overflowX: 'auto', marginBottom: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem 0.75rem 0.5rem' }}>

      {/* Week count controls */}
      {weekCount != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', paddingBottom: '0.6rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)', flex: 1 }}>Plan length</span>
          <button type="button" onClick={onDecreaseWeek} aria-label="Decrease weeks"
            style={{ width: '36px', height: '36px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', color: 'var(--text)', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <span style={{ minWidth: '60px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text)' }}>{weekCount} week{weekCount !== 1 ? 's' : ''}</span>
          <button type="button" onClick={onIncreaseWeek} aria-label="Increase weeks"
            style={{ width: '36px', height: '36px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', color: 'var(--text)', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
      )}

      <div style={{ minWidth: ROW_LABEL + weeks.length * (COL + 6) }}>

        {/* Week column headers */}
        <div style={{ display: 'flex', marginBottom: '5px' }}>
          <div style={{ width: ROW_LABEL, flexShrink: 0 }} />
          {weeks.map(w => (
            <div key={w.week_num} style={{ width: COL, flexShrink: 0, marginLeft: '6px', textAlign: 'center', fontSize: '0.68rem', fontWeight: '700', letterSpacing: '0.07em', color: 'var(--dim)', textTransform: 'uppercase' }}>
              Wk {w.week_num}
            </div>
          ))}
        </div>

        {/* Day rows */}
        {workoutDays.map(dow => (
          <div key={dow} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
            <div style={{ width: ROW_LABEL, flexShrink: 0, fontSize: '0.78rem', fontWeight: '500', color: 'var(--muted)' }}>
              {DAY_SHORT[dow]}
            </div>
            {weeks.map(week => {
              const day = lookup[week.week_num]?.[dow];
              if (!day) return <div key={week.week_num} style={{ width: COL, height: 40, flexShrink: 0, marginLeft: '6px' }} />;

              const loggedCount   = day.session?.logged_count ?? 0;
              const exerciseCount = day.session?.exercise_count ?? 0;
              const scheduled     = day.scheduled_count ?? 0;
              const completed     = loggedCount > 0 && loggedCount === scheduled;
              const allSkipped    = !completed && exerciseCount > 0 && loggedCount === 0 && exerciseCount === scheduled;
              const partial       = !completed && !allSkipped && exerciseCount > 0;
              const isSelected = selectedSlot?.weekNum === week.week_num && selectedSlot?.dow === dow;
              const isLocked   = day.is_locked;
              const isCurrent  = day.is_current;

              let bg = 'var(--surface2)', borderStyle = '1px solid var(--border)', textColor = 'var(--muted)';
              let opacity = 1, fontWeight = 'normal';

              if (completed)  { bg = '#1a2e1a'; borderStyle = '1px solid #2d5a2d'; textColor = '#4caf50'; }
              if (partial)    { bg = '#2a1c00'; borderStyle = '1px solid #5a3c00'; textColor = '#f0a030'; }
              if (allSkipped) { bg = '#2a0a0a'; borderStyle = '1px solid #5a1a1a'; textColor = 'var(--danger)'; }
              if (isCurrent && !isSelected) { borderStyle = '1px solid #555'; textColor = 'var(--text)'; }
              if (isSelected) { bg = completed ? '#1e3b1e' : allSkipped ? '#3a0a0a' : partial ? '#3a2800' : 'var(--surface3)'; borderStyle = '2px solid var(--text)'; textColor = 'var(--text)'; fontWeight = '700'; }
              if (isLocked && !isSelected) { borderStyle = '1px dashed var(--border)'; opacity = 0.55; }

              const label = completed ? '✓✓' : allSkipped ? '✗' : partial ? '✓' : isCurrent && !isSelected ? '▶' : DAY_SHORT[dow];

              return (
                <div key={week.week_num}
                  onClick={() => onSelect({ weekNum: week.week_num, dow })}
                  style={{ width: COL, height: 40, flexShrink: 0, marginLeft: '6px', borderRadius: '7px', background: bg, border: borderStyle, opacity, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px', transition: 'background 0.1s' }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight, color: textColor }}>{label}</span>
                  <span style={{ fontSize: '0.58rem', color: textColor, opacity: 0.65 }}>{day.date ? day.date.slice(5) : ''}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Check-in modal ─────────────────────────────────────────────────────────────

function CheckinModal({ sessionId, muscleGroup, onCheckin, onClose }) {
  const [form, setForm]       = useState({ pain: 'none', recovery: 'healed', pump: 'ok', intensity: 'just_right' });
  const [pauseWeight, setPause] = useState(false);
  const [saving, setSaving]   = useState(false);

  const fields = [
    { key: 'pain',      label: 'Pain',      options: [{ v:'none',l:'None' },{ v:'low',l:'Low' },{ v:'medium',l:'Medium' },{ v:'high',l:'High' }] },
    { key: 'recovery',  label: 'Recovery',  options: [{ v:'never_sore',l:'Never sore' },{ v:'still_sore',l:'Still sore' },{ v:'healed',l:'Healed' }] },
    { key: 'pump',      label: 'Pump',      options: [{ v:'poor',l:'Poor' },{ v:'ok',l:'OK' },{ v:'great',l:'Great' }] },
    { key: 'intensity', label: 'Intensity', options: [{ v:'too_easy',l:'Too easy' },{ v:'just_right',l:'Just right' },{ v:'too_much',l:'Too much' }] },
  ];

  async function handleSubmit() {
    setSaving(true);
    await api.checkin(sessionId, { ...form, pause_weight: pauseWeight, muscle_group: muscleGroup });
    onCheckin(muscleGroup);
  }

  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:200, padding:0 };
  const box     = {
    background:'var(--surface2)',
    borderRadius:'16px 16px 0 0',
    padding:'1.25rem 1rem',
    paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
    width:'100%',
    maxWidth:'520px',
    display:'flex',
    flexDirection:'column',
    gap:'1.1rem',
    border:'1px solid var(--border)',
    maxHeight: '92vh',
    overflowY: 'auto',
  };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
            <MuscleGroupBadge muscleGroup={muscleGroup} />
            <span style={{ color:'var(--muted)', fontSize:'0.95rem', fontWeight:500 }}>Check-in</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ background:'none', border:'none', color:'var(--muted)', fontSize:'1.5rem', cursor:'pointer', lineHeight:1, width:'40px', height:'40px', display:'flex', alignItems:'center', justifyContent:'center', margin:'-8px' }}>✕</button>
        </div>
        {fields.map(({ key, label, options }) => (
          <div key={key} style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            <span style={{ fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--dim)', fontWeight:'600' }}>{label}</span>
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${options.length}, minmax(0, 1fr))`, gap:'0.4rem' }}>
              {options.map(({ v, l }) => (
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, [key]: v }))}
                  style={{
                    padding:'0.7rem 0.25rem',
                    minHeight:'46px',
                    border:`1px solid ${form[key]===v?'var(--btn)':'var(--border)'}`,
                    borderRadius:'10px',
                    fontSize:'0.85rem',
                    lineHeight:1.15,
                    background:form[key]===v?'var(--btn)':'var(--surface)',
                    color:form[key]===v?'var(--btn-text)':'var(--text)',
                    fontWeight:form[key]===v?'600':'500',
                    cursor:'pointer',
                    textAlign:'center',
                    transition:'background 0.12s, color 0.12s, border-color 0.12s',
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        ))}
        <label style={{ display:'flex', alignItems:'center', gap:'0.6rem', cursor:'pointer', userSelect:'none', padding:'0.5rem 0' }}>
          <input type="checkbox" checked={pauseWeight} onChange={e => setPause(e.target.checked)}
            style={{ width:'1.15rem', height:'1.15rem', accentColor:'var(--btn)', cursor:'pointer', flexShrink:0 }} />
          <span style={{ fontSize:'0.9rem', color:'var(--muted)' }}>Pause weight increases</span>
        </label>
        <button type="button" onClick={handleSubmit} disabled={saving}
          style={{ width:'100%', padding:'0.95rem', background:'var(--btn)', color:'var(--btn-text)', border:'none', borderRadius:'10px', fontWeight:'700', fontSize:'1rem', cursor:'pointer', minHeight:'48px' }}>
          {saving ? 'Saving…' : 'Submit check-in'}
        </button>
      </div>
    </div>
  );
}

// ── Skip session confirm modal ────────────────────────────────────────────────

function SkipSessionModal({ onConfirm, onCancel }) {
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

function FinishConfirmModal({ toLog, toSkip, onConfirm, onCancel }) {
  const { display } = useUnit();
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    await onConfirm();
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

        <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.25rem' }}>
          <button type="button" onClick={onCancel} disabled={confirming}
            style={{ flex:1, padding:'0.85rem', minHeight:'48px', background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:'8px', fontWeight:'600', fontSize:'0.95rem', cursor:'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={confirming}
            style={{ flex:1, padding:'0.85rem', minHeight:'48px', background:'var(--btn)', color:'var(--btn-text)', border:'none', borderRadius:'8px', fontWeight:'700', fontSize:'0.95rem', cursor: confirming ? 'default' : 'pointer' }}>
            {confirming ? 'Logging…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Set row ────────────────────────────────────────────────────────────────────

// Controlled component — status / weight / reps are owned by the parent
// (TodayPage's setStatuses Map). All actions go through callbacks; no local
// state, no refs, no liveValues. This eliminates stale-state-after-reload bugs.
function SetRow({
  set, isBodyweight, bodyweightStr, isReadOnly,
  status, weight, reps,
  onWeightChange, onRepsChange, onClickTick, onClickUndo,
}) {
  const { unit } = useUnit();

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

  const canLog   = !isReadOnly && (status === 'logged' || (reps !== '' && parseInt(reps, 10) >= 1));
  const isLogged = status === 'logged';
  const inputStyle = { ...pill, width:'100%', color:'var(--text)', outline:'none', textAlign:'center', padding:0,
    borderColor: isLogged ? 'var(--success)' : 'var(--border)', opacity: isReadOnly ? 0.6 : 1 };

  const handleFocusSelect = e => e.target.select();
  const handleKeyDown = e => {
    if (e.key !== 'Enter' || isReadOnly || isLogged) return;
    const repsDone = parseInt(reps, 10);
    if (!repsDone || repsDone < 1) return;
    const weightPresent = isBodyweight ? bodyweightStr !== '' : weight !== '';
    if (!weightPresent) return;
    e.preventDefault();
    e.target.blur();
    onClickTick();
  };

  return (
    <div style={{ display:'grid', gridTemplateColumns: isBodyweight ? '1fr 44px' : '1fr 1fr 44px', gap:'10px', alignItems:'center', marginBottom:'8px' }}>
      {!isBodyweight && (
        <input type="number" value={weight} onChange={e => onWeightChange(e.target.value)}
          onFocus={handleFocusSelect} onKeyDown={handleKeyDown}
          placeholder={unit} step={unit === 'lbs' ? '1' : '0.5'}
          disabled={isReadOnly}
          style={inputStyle}
        />
      )}
      <input type="number" value={reps} onChange={e => onRepsChange(e.target.value)}
        onFocus={handleFocusSelect} onKeyDown={handleKeyDown}
        placeholder={String(set.reps)} min="1" max="999"
        disabled={isReadOnly}
        style={inputStyle}
      />
      <div onClick={canLog ? onClickTick : undefined}
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

// ── History icon ──────────────────────────────────────────────────────────────

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 8A5 5 0 1 1 8 3" />
      <polyline points="5.5,1.5 8,3 5.5,4.5" />
      <line x1="8" y1="8" x2="8" y2="5.8" />
      <line x1="8" y1="8" x2="10.2" y2="8" />
    </svg>
  );
}

// ── History chart ──────────────────────────────────────────────────────────────

function HistoryChart({ data }) {
  const { unit } = useUnit();
  const toDisp = kg => unit === 'lbs' ? Math.round(kg * 2.2046 * 10) / 10 : kg;

  const W = 500, H = 180;
  const pad = { top: 14, right: 16, bottom: 34, left: 46 };
  const cW  = W - pad.left - pad.right;
  const cH  = H - pad.top  - pad.bottom;

  const vals = data.map(d => toDisp(d.max_weight));
  const lo   = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const yLo  = lo - span * 0.18, yHi = hi + span * 0.18;

  const xOf  = i => pad.left + (data.length > 1 ? (i / (data.length - 1)) * cW : cW / 2);
  const yOf  = v => pad.top  + cH * (1 - (v - yLo) / (yHi - yLo));
  const pts  = vals.map((v, i) => [xOf(i), yOf(v)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${line}L${pts.at(-1)[0].toFixed(1)},${(pad.top + cH).toFixed(1)}L${pts[0][0].toFixed(1)},${(pad.top + cH).toFixed(1)}Z`;

  const yTicks = [lo, (lo + hi) / 2, hi].map(v => Math.round(toDisp(v) * 2) / 2);

  const nLabels = Math.min(data.length, 5);
  const xIdxs  = Array.from({ length: nLabels }, (_, k) =>
    Math.round(k * (data.length - 1) / Math.max(nLabels - 1, 1))
  );
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const shortDate = s => { const [,m,d] = s.split('-').map(Number); return `${MONTHS[m-1]} ${d}`; };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block' }}>
      {yTicks.map((v, i) => (
        <line key={i} x1={pad.left} y1={yOf(v)} x2={W - pad.right} y2={yOf(v)}
          stroke="var(--border)" strokeWidth="1" />
      ))}
      <path d={area} fill="var(--success)" opacity="0.07" />
      <path d={line} fill="none" stroke="var(--success)" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={data.length > 15 ? 2 : 3} fill="var(--success)" />
      ))}
      {yTicks.map((v, i) => (
        <text key={i} x={pad.left - 6} y={yOf(v) + 4} textAnchor="end" fontSize="11" fill="var(--dim)">{v}</text>
      ))}
      <text x={8} y={pad.top + cH / 2} textAnchor="middle" fontSize="10" fill="var(--dim)"
        transform={`rotate(-90,8,${pad.top + cH / 2})`}>{unit}</text>
      {xIdxs.map((idx, k) => (
        <text key={k} x={xOf(idx)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--dim)">
          {shortDate(data[idx].date)}
        </text>
      ))}
    </svg>
  );
}

// ── Exercise history modal ─────────────────────────────────────────────────────

function ExerciseHistoryModal({ exercise, onClose }) {
  const { display } = useUnit();
  const [history, setHistory] = useState(null);

  useEffect(() => {
    api.getExerciseHistory(exercise.exercise_id).then(setHistory);
  }, [exercise.exercise_id]); // eslint-disable-line

  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' };
  const box     = { background:'var(--surface2)', borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'560px', display:'flex', flexDirection:'column', gap:'1rem', border:'1px solid var(--border)' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
            <span style={{ fontWeight:'700', fontSize:'1rem', color:'var(--text)' }}>{exercise.name}</span>
            <MuscleGroupBadge muscleGroup={exercise.muscle_group} />
          </div>
          <button type="button" onClick={onClose}
            style={{ background:'none', border:'none', color:'var(--dim)', fontSize:'1.4rem', cursor:'pointer', lineHeight:1, padding:'0 4px', flexShrink:0 }}>✕</button>
        </div>

        {!history && <p style={{ color:'var(--muted)', margin:0 }}>Loading…</p>}
        {history?.length === 0 && <p style={{ color:'var(--muted)', margin:0 }}>No sessions logged yet.</p>}
        {history?.length > 0 && (
          <>
            <HistoryChart data={history} />
            <div style={{ display:'flex', gap:'1.5rem', fontSize:'0.8rem', color:'var(--muted)' }}>
              <span>{history.length} session{history.length !== 1 ? 's' : ''}</span>
              <span>Peak: {display(Math.max(...history.map(d => d.max_weight)))}</span>
              <span>Latest: {display(history.at(-1).max_weight)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Exercise card ──────────────────────────────────────────────────────────────

function ExerciseCard({ exercise, isGroupCheckedIn, onResetCheckin, onAddSet, onRemoveSet, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, getStatus, onWeightChange, onRepsChange, onClickTick, onClickUndo, isBodyweight = false, bodyweightStr = '', onBodyweightChange, isReadOnly = false }) {
  const { unit } = useUnit();
  const [historyOpen, setHistoryOpen] = useState(false);
  const colHeader   = { fontSize:'0.7rem', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--dim)', textAlign:'center' };
  const isSetDone   = (setNum) => {
    const st = getStatus(exercise.exercise_id, setNum);
    return st.status === 'logged' || st.status === 'skipped';
  };
  const lastSetDone = isSetDone(exercise.sets.length);

  // Volume hint: total session volume (weight × reps across all sets), current vs previous targets
  let volumeHint = null;
  if (!isBodyweight && exercise.sets.some(s => s.prev_weight != null || s.prev_reps != null)) {
    const toDisp  = kg => unit === 'lbs' ? kg * 2.2046 : kg;
    const curVol  = exercise.sets.reduce((sum, s) => sum + toDisp(s.weight  ?? 0) * (s.reps      ?? 0), 0);
    const prevVol = exercise.sets.reduce((sum, s) => sum + toDisp((s.prev_weight ?? s.weight) ?? 0) * ((s.prev_reps ?? s.reps) ?? 0), 0);
    const delta   = curVol - prevVol;
    const pct     = prevVol > 0 ? (delta / prevVol) * 100 : 0;
    if (Math.abs(delta) > 0.01) {
      volumeHint = {
        text:  `${delta > 0 ? '▲' : '▼'} ${Math.round(curVol)} ${unit}·reps (${delta > 0 ? '+' : ''}${Math.round(pct)}%)`,
        color: delta > 0 ? 'var(--success)' : 'var(--danger)',
      };
    }
  }

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',''); onDragStart(); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; onDragOver(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      style={{ border:`1px solid ${isDragOver ? 'var(--muted)' : 'var(--border)'}`, borderRadius:'10px', padding:'1rem', marginBottom:'0.75rem', background: isDragOver ? 'var(--surface2)' : 'var(--surface)', transition:'border-color 0.1s, background 0.1s' }}
    >
      <div style={{ display:'flex', alignItems:'flex-start', gap:'0.5rem', marginBottom:'0.85rem', cursor:'grab', userSelect:'none' }}>
        <span style={{ color:'var(--dim)', fontSize:'1rem', marginTop:'3px', flexShrink:0, letterSpacing:'-1px' }}>⠿</span>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', marginBottom:'5px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
              <span style={{ fontWeight:'600', fontSize:'1.05rem', color:'var(--text)' }}>{exercise.name}</span>
              <button type="button" onClick={e => { e.stopPropagation(); setHistoryOpen(true); }}
                style={{ background:'none', border:'none', padding:'2px', cursor:'pointer', color:'var(--muted)', lineHeight:1, display:'flex', alignItems:'center' }}
                title="View history">
                <HistoryIcon />
              </button>
            </div>
            <MuscleGroupBadge muscleGroup={exercise.muscle_group} />
          </div>
          {exercise.equipment && <div style={{ fontSize:'0.78rem', color:'var(--dim)', textTransform:'capitalize' }}>{exercise.equipment}</div>}
        </div>
        {isGroupCheckedIn && (
          <div style={{ display:'flex', alignItems:'center', gap:'4px', flexShrink:0, paddingTop:'2px' }}>
            <span style={{ color:'var(--success)', fontSize:'0.85rem' }}>✓</span>
            <button type="button" onClick={e => { e.stopPropagation(); onResetCheckin(); }}
              style={{ background:'none', border:'none', color:'var(--dim)', fontSize:'0.75rem', cursor:'pointer', textDecoration:'underline', padding:0 }}>
              reset
            </button>
          </div>
        )}
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
            onWeightChange={(val) => onWeightChange(exercise.exercise_id, set.set_num, val)}
            onRepsChange={(val) => onRepsChange(exercise.exercise_id, set.set_num, val)}
            onClickTick={() => onClickTick(exercise.exercise_id, set.set_num)}
            onClickUndo={() => onClickUndo(exercise.exercise_id, set.set_num)}
          />
        );
      })}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'8px', paddingTop:'8px', borderTop:'1px solid var(--border)' }}>
        <span style={{ fontSize:'0.72rem', color: volumeHint ? volumeHint.color : 'var(--muted)', letterSpacing:'0.01em' }}>{volumeHint?.text ?? ''}</span>
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

  // Check-in state
  const [checkedInGroups, setCheckedIn] = useState(new Set());
  const [pendingCheckin, setPending]    = useState(null);
  const [dismissedGroups, setDismissed] = useState(new Set());

  // Finish workout
  const [reloadKey, setReloadKey]       = useState(0);
  const [finishModal, setFinishModal]   = useState(null);
  const [skipConfirm, setSkipConfirm]   = useState(false);
  // One-shot flag: when set, the next loadSlot skips preDismiss (signalling
  // "user explicitly clicked Finish, don't silence the check-in modals").
  const skipPreDismissOnceRef = useRef(false);

  // Per-exercise bodyweight input (propagates forward to subsequent BW exercises)
  const [bodyweightValues, setBodyweightValues] = useState(new Map());

  // Drag state
  const [dragExerciseId, setDragExId] = useState(null);
  const [dragOverId, setDragOverId]   = useState(null);

  const [loading, setLoading]       = useState(true);
  const [sessLoading, setSessLoading] = useState(false);
  const [error, setError]           = useState(null);

  // ── Step 1: load plan + calendar, pick default slot ──────────────────────────

  useEffect(() => {
    async function init() {
      const plan = await api.getActivePlan();
      if (!plan) { setLoading(false); return; }
      setActivePlan(plan);

      const calData = await api.getPlanCalendar(plan.id);
      setCalendarData(calData);

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
      setSessLoading(true);
      setSetStatuses(new Map());
      setCheckedIn(new Set());
      setPending(null);
      setDismissed(new Set());
      setDragExId(null);
      setDragOverId(null);

      const { weekNum, dow } = selectedSlot;
      const [slotData, exs] = await Promise.all([
        api.getSessionForSlot(activePlan.id, weekNum, dow),
        api.getScheduleForDay(dow),
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
      for (const ex of exs) {
        for (const s of ex.sets) {
          const dispWeight = (ex.equipment !== 'bodyweight' && s.weight != null)
            ? toDisplay(s.weight)
            : '';
          statuses.set(`${ex.exercise_id}-${s.set_num}`, { status: 'idle', weight: dispWeight, reps: '' });
        }
      }

      const checkinSet = new Set();
      if (sess) {
        const [loggedSets, checkinGroups] = await Promise.all([
          api.getSessionSets(sess.id),
          api.getCheckins(sess.id),
        ]);
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
        for (const g of checkinGroups) checkinSet.add(g);
      }

      // Pre-dismiss groups that are already fully done. Two cases:
      //   - Past (non-current) slots: never pop modals on read-only views.
      //   - Unlocked sessions: the user explicitly unlocked to edit something,
      //     not to redo every check-in. Modals should only fire after they
      //     touch a set (handleLog / handleClear remove the group from
      //     dismissedGroups, so re-completing the group re-fires the modal).
      // Exception: if the user just clicked Finish Workout, they've explicitly
      // committed to the check-in flow — don't silence anything this reload.
      const skipPreDismiss = skipPreDismissOnceRef.current;
      skipPreDismissOnceRef.current = false;
      const shouldPreDismiss = !skipPreDismiss && (!is_current || sess?.unlocked === 1);
      const preDismissed = new Set();
      if (shouldPreDismiss) {
        for (const g of groupByMuscle(exs)) {
          if (!checkinSet.has(g.muscle_group)) {
            const allDone = g.exercises.every(ex =>
              ex.sets.every(s => {
                const st = statuses.get(`${ex.exercise_id}-${s.set_num}`);
                return st && (st.status === 'logged' || st.status === 'skipped');
              })
            );
            if (allDone) preDismissed.add(g.muscle_group);
          }
        }
      }

      const bwKey    = `ft_bodyweight_${weekNum}_${dow}`;
      const storedBW = localStorage.getItem(bwKey) ?? localStorage.getItem('ft_bodyweight') ?? '';
      const bwMap    = new Map();
      for (const ex of exs) {
        if (ex.equipment === 'bodyweight') bwMap.set(ex.exercise_id, storedBW);
      }

      setSetStatuses(statuses);
      setCheckedIn(checkinSet);
      setDismissed(preDismissed);
      setBodyweightValues(bwMap);
      setSessLoading(false);
      setLoading(false);
    }

    loadSlot().catch(e => { setError(e.message); setSessLoading(false); setLoading(false); });
  }, [selectedSlot?.weekNum, selectedSlot?.dow, activePlan?.id, reloadKey]); // eslint-disable-line

  // ── Derived state ─────────────────────────────────────────────────────────────

  const groups = groupByMuscle(exercises);

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

  function groupIsDone(group) {
    return group.exercises.every(ex => ex.sets.every(s => {
      const st = getStatus(ex.exercise_id, s.set_num);
      return st.status === 'logged' || st.status === 'skipped';
    }));
  }

  // Groups whose sets are all skipped don't need a check-in modal.
  function groupHasLoggedSets(group) {
    return group.exercises.some(ex =>
      ex.sets.some(s => getStatus(ex.exercise_id, s.set_num).status === 'logged')
    );
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

  // A session is "all done" iff the server says so (checked_in === 1).
  // Per-group local check-ins are tracked client-side, but the authoritative
  // source for "complete" is the server flag, refreshed via setReloadKey when
  // all groups requiring a check-in are checked in.
  const allDone = session?.checked_in === 1;

  // ── Auto-trigger check-in ─────────────────────────────────────────────────────

  useEffect(() => {
    if (pendingCheckin !== null) return;
    const next = groups.find(g =>
      groupIsDone(g) &&
      !checkedInGroups.has(g.muscle_group) &&
      !dismissedGroups.has(g.muscle_group) &&
      groupHasLoggedSets(g)
    );
    if (next) setPending(next.muscle_group);
  }, [setStatuses, pendingCheckin, checkedInGroups, dismissedGroups]); // eslint-disable-line

  // ── Per-set actions ───────────────────────────────────────────────────────────

  // Reset a group's server-side check-in. Used when the user edits or unticks
  // a logged set in a group that was already checked in.
  async function resetGroupCheckinIfAny(muscleGroup) {
    if (!session?.id) return;
    if (!checkedInGroups.has(muscleGroup)) return;
    await api.resetCheckin(session.id, muscleGroup).catch(() => {});
    setCheckedIn(prev => { const n = new Set(prev); n.delete(muscleGroup); return n; });
    setDismissed(prev => { const n = new Set(prev); n.delete(muscleGroup); return n; });
  }

  // Remove a group from dismissedGroups when the user actively logs / clears.
  // Needed so that after an unlock (where loadSlot pre-dismisses every group),
  // re-completing a group re-fires its check-in modal.
  function markGroupActive(muscleGroup) {
    setDismissed(prev => {
      if (!prev.has(muscleGroup)) return prev;
      const n = new Set(prev);
      n.delete(muscleGroup);
      return n;
    });
  }

  async function handleLog(exId, setNum) {
    if (!session?.id || isReadOnly) return;
    const ex  = exercises.find(e => e.exercise_id === exId);
    if (!ex) return;
    const set = ex.sets.find(s => s.set_num === setNum);
    const cur = getStatus(exId, setNum);
    const repsDone = parseInt(cur.reps, 10);
    if (!repsDone || repsDone < 1) return;
    const isBW = ex.equipment === 'bodyweight';
    const bwStr = bodyweightValues.get(exId);
    const weightKg = isBW
      ? (bwStr !== '' && bwStr != null ? toKg(parseFloat(bwStr)) : 0)
      : (cur.weight !== '' ? toKg(parseFloat(cur.weight)) : (set?.weight ?? 0));
    // Optimistic flip
    patchStatus(exId, setNum, { status: 'logged' });
    markGroupActive(ex.muscle_group);
    try {
      await api.logSet(session.id, { exercise_id: exId, set_num: setNum, reps_done: repsDone, skipped: 0, weight_used: weightKg });
    } catch {
      patchStatus(exId, setNum, { status: 'idle' });
    }
  }

  async function handleClear(exId, setNum) {
    if (!session?.id || isReadOnly) return;
    const ex = exercises.find(e => e.exercise_id === exId);
    // Optimistic
    patchStatus(exId, setNum, { status: 'idle' });
    if (ex) {
      markGroupActive(ex.muscle_group);
      await resetGroupCheckinIfAny(ex.muscle_group);
    }
    api.unlogSet(session.id, exId, setNum).catch(() => {});
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

  // ── Check-in callbacks ────────────────────────────────────────────────────────

  const onCheckin = useCallback((muscleGroup) => {
    setCheckedIn(prev => new Set([...prev, muscleGroup]));
    setPending(null);
    if (activePlan) api.getPlanCalendar(activePlan.id).then(setCalendarData);

    // Reload slot when all groups *requiring* a check-in have one. All-skipped
    // groups don't need check-in rows (server filters them out), so we only
    // wait on groups with logged sets.
    const updatedGroups = new Set([...checkedInGroups, muscleGroup]);
    const groupsNeedingCheckin = groups.filter(groupHasLoggedSets);
    if (groupsNeedingCheckin.every(g => updatedGroups.has(g.muscle_group))) {
      const lastWeek = calendarData?.weeks?.[calendarData.weeks.length - 1];
      const lastDay  = lastWeek?.days?.[lastWeek.days.length - 1];
      if (lastWeek?.week_num === selectedSlot?.weekNum && lastDay?.day_of_week === selectedSlot?.dow) {
        setEndOfPlanModal(true);
      }
      setReloadKey(k => k + 1);
    }
  }, [activePlan, groups, checkedInGroups, calendarData, selectedSlot, setStatuses]);

  function handleClosePending() {
    setDismissed(prev => new Set([...prev, pendingCheckin]));
    setPending(null);
  }

  const onResetCheckin = useCallback(async (muscleGroup) => {
    if (!session?.id) return;
    await api.resetCheckin(session.id, muscleGroup);
    setCheckedIn(prev => { const n = new Set(prev); n.delete(muscleGroup); return n; });
    setDismissed(prev => { const n = new Set(prev); n.delete(muscleGroup); return n; });
    // Don't untick the group's individual sets — they remain logged on the
    // server. The auto-checkin effect will simply re-fire the modal so the
    // user can submit fresh feedback.
  }, [session]);

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
    const newSet = { set_num: ex.sets.length + 1, weight: last.weight, reps: last.reps };
    setExercises(prev => prev.map(e => e.exercise_id !== exerciseId ? e : { ...e, set_count: e.set_count + 1, sets: [...e.sets, newSet] }));
    await api.updatePlanSlot(ex.plan_id, ex.schedule_id, { set_count: ex.set_count + 1 });
  }

  async function onRemoveSet(exerciseId) {
    const ex = exercises.find(e => e.exercise_id === exerciseId);
    if (!ex || ex.sets.length <= 1) return;
    const lastSt = getStatus(exerciseId, ex.sets.length);
    if (lastSt.status === 'logged' || lastSt.status === 'skipped') return;
    setExercises(prev => prev.map(e => e.exercise_id !== exerciseId ? e : { ...e, set_count: e.set_count - 1, sets: e.sets.slice(0, -1) }));
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
    localStorage.setItem('ft_bodyweight', value); // global fallback
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
    setDismissed(prev => new Set([...prev, ...exercises.map(ex => ex.muscle_group)]));
    setPending(null);
    if (activePlan) api.getPlanCalendar(activePlan.id).then(setCalendarData);
    setReloadKey(k => k + 1);
  }

  // ── Finish workout ────────────────────────────────────────────────────────────

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
    if (toLog.length === 0 && toSkip.length === 0) {
      // Everything already accounted for — re-trigger check-in modals for any
      // unchecked groups that have at least one logged set. All-skipped groups
      // are silently fine (server doesn't require check-ins for them).
      const needsCheckin = groups.some(g =>
        groupIsDone(g) && !checkedInGroups.has(g.muscle_group) && groupHasLoggedSets(g)
      );
      if (needsCheckin) setDismissed(new Set());
      return;
    }
    setFinishModal({ toLog, toSkip });
  }

  async function handleConfirmFinish() {
    const { toLog, toSkip } = finishModal;
    await Promise.all([
      ...toLog.map(item => api.logSet(session.id, { exercise_id: item.exerciseId, set_num: item.setNum, reps_done: item.reps, skipped: 0, weight_used: item.weightKg })),
      ...toSkip.map(item => api.logSet(session.id, { exercise_id: item.exerciseId, set_num: item.setNum, reps_done: null, skipped: 1, weight_used: null })),
    ]);
    setFinishModal(null);
    // Clear dismissed locally and tell the next loadSlot not to re-apply
    // preDismiss (e.g., on an unlocked session) — user explicitly committed.
    setDismissed(new Set());
    skipPreDismissOnceRef.current = true;
    setReloadKey(k => k + 1);
  }

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
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem' }}>
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
            {session?.date ? fmtDate(session.date) : selectedSlot ? DAY_LABELS[selectedSlot.dow] : ''}
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
          {isReadOnly && (
            <div style={{ marginBottom:'1rem', padding:'0.55rem 0.85rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', fontSize:'0.8rem', color:'var(--dim)' }}>
              {isLocked ? '🔒 This session is locked — complete the current session first.' : 'Read-only view of a completed session.'}
            </div>
          )}

          {exercises.map(ex => (
            <ExerciseCard
              key={`${session?.id ?? `${selectedSlot?.weekNum}-${selectedSlot?.dow}`}-${ex.exercise_id}`}
              exercise={ex}
              isGroupCheckedIn={checkedInGroups.has(ex.muscle_group)}
              onResetCheckin={() => onResetCheckin(ex.muscle_group)}
              onAddSet={() => onAddSet(ex.exercise_id)}
              onRemoveSet={() => onRemoveSet(ex.exercise_id)}
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
              <div style={{ padding:'0.85rem 1rem', background:'#152015', border:'1px solid #2d4a2d', borderRadius:'10px', color:'var(--success)', fontWeight:'600' }}>
                ✓ All done — next session targets updated.
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

      {pendingCheckin && (
        <CheckinModal
          sessionId={session?.id}
          muscleGroup={pendingCheckin}
          onCheckin={onCheckin}
          onClose={handleClosePending}
        />
      )}

      {skipConfirm && (
        <SkipSessionModal
          onConfirm={async () => { await handleSkipSession(); setSkipConfirm(false); }}
          onCancel={() => setSkipConfirm(false)}
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
