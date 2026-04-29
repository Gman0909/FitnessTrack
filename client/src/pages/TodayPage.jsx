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
  chest: '#e05c8a', back: '#3cc9b0', shoulders: '#f0a030',
  biceps: '#3cc9b0', triceps: '#e05c8a', legs: '#9b6fd4', core: '#4caf50',
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

function todayStr() { return new Date().toISOString().split('T')[0]; }

// Parse date string safely at UTC noon so local timezone can't shift the day
function dateFromStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}
function dowFromStr(str) { return (dateFromStr(str).getUTCDay() + 6) % 7; }

function fmtDate(dateStr) {
  return dateFromStr(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ── Muscle group badge ─────────────────────────────────────────────────────────

function MuscleGroupBadge({ muscleGroup }) {
  const color = mcColor(muscleGroup);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: `${color}22`, border: `1px solid ${color}55`, borderRadius: '6px', padding: '4px 10px 4px 8px' }}>
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

  const pastWeeks = calendarData?.weeks?.filter(w =>
    w.days.some(d => d.session?.checked_in === 1)
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
          <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1rem', fontWeight: '700' }}>Seed starting weights from</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button onClick={() => setSeedWeek(null)} style={optBtn(seedWeek === null)}>Current targets</button>
          {pastWeeks.map(w => (
            <button key={w.week_num} onClick={() => setSeedWeek(w.week_num)} style={optBtn(seedWeek === w.week_num)}>
              Week {w.week_num}
              <span style={{ opacity: 0.65, fontWeight: 'normal' }}> · {fmtShort(w.start_date)} – {fmtShort(w.end_date)}</span>
            </button>
          ))}
          {pastWeeks.length === 0 && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--dim)' }}>No past weeks to seed from.</p>
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

function DayPickerPanel({ calendarData, selectedDate, onSelect, weekCount, onDecreaseWeek, onIncreaseWeek }) {
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
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', flex: 1 }}>Plan length</span>
          <button type="button" onClick={onDecreaseWeek}
            style={{ width: '26px', height: '26px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface2)', color: 'var(--text)', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <span style={{ minWidth: '54px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text)' }}>{weekCount} week{weekCount !== 1 ? 's' : ''}</span>
          <button type="button" onClick={onIncreaseWeek}
            style={{ width: '26px', height: '26px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface2)', color: 'var(--text)', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
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

              const completed  = day.session?.checked_in === 1;
              const partial    = !completed && (day.session?.logged_count ?? 0) > 0;
              const isSelected = day.date === selectedDate;
              const isPastMissed = day.is_past && !completed && !partial;

              let bg = 'var(--surface2)', borderStyle = '1px solid var(--border)', textColor = 'var(--muted)';
              let opacity = 1, fontWeight = 'normal';

              if (completed)    { bg = '#1a2e1a'; borderStyle = '1px solid #2d5a2d'; textColor = '#4caf50'; }
              if (partial)      { bg = '#2a1c00'; borderStyle = '1px solid #5a3c00'; textColor = '#f0a030'; }
              if (day.is_today && !isSelected) { borderStyle = '1px solid #555'; textColor = completed ? '#4caf50' : partial ? '#f0a030' : 'var(--text)'; }
              if (isSelected)   { bg = completed ? '#1e3b1e' : partial ? '#3a2800' : 'var(--surface3)'; borderStyle = '2px solid var(--text)'; textColor = 'var(--text)'; fontWeight = '700'; }
              if (isPastMissed && !isSelected) { opacity = 0.45; }

              const label = completed ? '✓✓' : partial ? '✓' : day.is_today && !isSelected ? '▶' : DAY_SHORT[dow];

              return (
                <div key={week.week_num}
                  onClick={() => onSelect(day.date)}
                  style={{ width: COL, height: 40, flexShrink: 0, marginLeft: '6px', borderRadius: '7px', background: bg, border: borderStyle, opacity, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px', transition: 'background 0.1s' }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight, color: textColor }}>{label}</span>
                  <span style={{ fontSize: '0.58rem', color: textColor, opacity: 0.65 }}>{day.date.slice(5)}</span>
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
  const [form, setForm]     = useState({ pain: 'none', recovery: 'just_in_time', pump: 'ok' });
  const [saving, setSaving] = useState(false);

  const fields = [
    { key: 'pain',     label: 'Pain',     options: [{ v:'none',l:'None' },{ v:'low',l:'Low' },{ v:'medium',l:'Medium' },{ v:'high',l:'High' }] },
    { key: 'recovery', label: 'Recovery', options: [{ v:'still_sore',l:'Still sore' },{ v:'just_in_time',l:'Just in time' },{ v:'healed',l:'Healed' },{ v:'never_sore',l:'Never sore' }] },
    { key: 'pump',     label: 'Pump',     options: [{ v:'poor',l:'Poor' },{ v:'ok',l:'OK' },{ v:'great',l:'Great' }] },
  ];

  async function handleSubmit() {
    setSaving(true);
    await api.checkin(sessionId, { ...form, muscle_group: muscleGroup });
    onCheckin(muscleGroup);
  }

  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' };
  const box     = { background:'var(--surface2)', borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'500px', display:'flex', flexDirection:'column', gap:'1.25rem', border:'1px solid var(--border)' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
            <MuscleGroupBadge muscleGroup={muscleGroup} />
            <span style={{ color:'var(--muted)', fontSize:'0.9rem' }}>Check-in</span>
          </div>
          <button type="button" onClick={onClose}
            style={{ background:'none', border:'none', color:'var(--dim)', fontSize:'1.4rem', cursor:'pointer', lineHeight:1, padding:'0 4px' }}>✕</button>
        </div>
        {fields.map(({ key, label, options }) => (
          <div key={key}>
            <p style={{ margin:'0 0 0.5rem', fontSize:'0.75rem', textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--dim)', fontWeight:'600' }}>{label}</p>
            <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
              {options.map(({ v, l }) => (
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, [key]: v }))}
                  style={{ padding:'0.45rem 0.85rem', border:`1px solid ${form[key]===v?'var(--btn)':'var(--border)'}`, borderRadius:'8px', fontSize:'0.875rem', background:form[key]===v?'var(--btn)':'var(--surface)', color:form[key]===v?'var(--btn-text)':'var(--muted)', fontWeight:form[key]===v?'600':'normal', cursor:'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={handleSubmit} disabled={saving}
          style={{ padding:'0.7rem', background:'var(--btn)', color:'var(--btn-text)', border:'none', borderRadius:'8px', fontWeight:'700', fontSize:'0.95rem', cursor:'pointer' }}>
          {saving ? 'Saving…' : 'Submit check-in'}
        </button>
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
            style={{ flex:1, padding:'0.7rem', background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:'8px', fontWeight:'600', fontSize:'0.9rem', cursor:'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={confirming}
            style={{ flex:1, padding:'0.7rem', background:'var(--btn)', color:'var(--btn-text)', border:'none', borderRadius:'8px', fontWeight:'700', fontSize:'0.9rem', cursor: confirming ? 'default' : 'pointer' }}>
            {confirming ? 'Logging…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Set row ────────────────────────────────────────────────────────────────────

function SetRow({ set, exerciseId, sessionId, isGroupCheckedIn, onDone, onUndone, onResetCheckin, onValuesChange, resetCounter = 0, initialStatus = 'idle', initialReps = '', isBodyweight = false, bodyweightStr = '' }) {
  const { unit, toKg } = useUnit();

  // Initialise weight in the user's display unit so they edit in familiar numbers
  const [weight, setWeight] = useState(() => {
    if (isBodyweight || set.weight == null) return '';
    return unit === 'lbs' ? String(parseFloat((set.weight * 2.2046).toFixed(1))) : String(set.weight);
  });
  const [reps, setReps]     = useState(initialReps);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    onValuesChange?.(isBodyweight ? bodyweightStr : weight, reps, status);
  }, [weight, reps, status, bodyweightStr]); // eslint-disable-line

  useEffect(() => {
    if (!resetCounter) return;
    setStatus('idle');
  }, [resetCounter]); // eslint-disable-line

  function triggerReset() { if (isGroupCheckedIn) onResetCheckin(); }

  function handleWeightChange(val) {
    setWeight(val);
    if (status === 'logged') { setStatus('idle'); onUndone(); triggerReset(); }
  }

  async function handleLog() {
    if (status === 'logged') { setStatus('idle'); onUndone(); triggerReset(); return; }
    const repsDone = parseInt(reps, 10);
    if (!repsDone || repsDone < 1) return;
    const weightKg = isBodyweight
      ? (bodyweightStr !== '' ? toKg(parseFloat(bodyweightStr)) : 0)
      : (weight !== '' ? toKg(parseFloat(weight)) : (set.weight ?? 0));
    await api.logSet(sessionId, { exercise_id: exerciseId, set_num: set.set_num, reps_done: repsDone, skipped: 0, weight_used: weightKg });
    setStatus('logged');
    onDone();
  }

  async function handleSkip() {
    if (status === 'skipped') { setStatus('idle'); onUndone(); triggerReset(); return; }
    await api.logSet(sessionId, { exercise_id: exerciseId, set_num: set.set_num, reps_done: null, skipped: 1, weight_used: null });
    setStatus('skipped');
    onDone();
  }

  function handleRepsChange(val) {
    setReps(val);
    if (status === 'logged') { setStatus('idle'); onUndone(); triggerReset(); }
  }

  const pill = { display:'flex', alignItems:'center', justifyContent:'center', background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:'8px', height:'42px', fontSize:'1rem', fontWeight:'500' };

  if (status === 'skipped') return (
    <div style={{ display:'grid', gridTemplateColumns: isBodyweight ? '1fr 44px' : '1fr 1fr 44px', gap:'10px', alignItems:'center', marginBottom:'8px' }}>
      <div style={{ ...pill, color:'var(--dim)', gridColumn: isBodyweight ? '1/2' : '1/3', justifyContent:'flex-start', paddingLeft:'0.75rem' }}>
        <span style={{ fontSize:'0.85rem', color:'var(--dim)' }}>Set {set.set_num} — Skipped</span>
        <button type="button" onClick={handleSkip} style={{ marginLeft:'auto', marginRight:'0.5rem', background:'none', border:'none', color:'var(--muted)', fontSize:'0.8rem', cursor:'pointer', textDecoration:'underline' }}>Undo</button>
      </div>
      <div style={{ width:'44px', height:'44px' }} />
    </div>
  );

  const canLog   = status === 'logged' || (reps !== '' && parseInt(reps, 10) >= 1);
  const isLogged = status === 'logged';
  const inputStyle = { ...pill, width:'100%', color:'var(--text)', outline:'none', textAlign:'center', padding:0,
    borderColor: isLogged ? 'var(--success)' : 'var(--border)' };

  return (
    <div style={{ display:'grid', gridTemplateColumns: isBodyweight ? '1fr 44px' : '1fr 1fr 44px', gap:'10px', alignItems:'center', marginBottom:'8px' }}>
      {!isBodyweight && (
        <input type="number" value={weight} onChange={e => handleWeightChange(e.target.value)}
          placeholder={unit} step={unit === 'lbs' ? '1' : '0.5'}
          style={inputStyle}
        />
      )}
      <input type="number" value={reps} onChange={e => handleRepsChange(e.target.value)}
        placeholder={String(set.reps)} min="1" max="999"
        style={inputStyle}
      />
      <div onClick={canLog ? handleLog : undefined}
        style={{ width:'44px', height:'44px', borderRadius:'8px', flexShrink:0, cursor: canLog ? 'pointer' : 'default',
          border:`2px solid ${isLogged ? 'var(--success)' : canLog ? 'var(--muted)' : 'var(--border)'}`,
          background: isLogged ? '#1a2e1a' : 'transparent',
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

function ExerciseCard({ exercise, sessionId, isGroupCheckedIn, onSetDone, onSetUndone, onResetCheckin, onAddSet, onRemoveSet, onSetValuesChange, resetCounter, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, doneSet, initials, isBodyweight = false, bodyweightStr = '', onBodyweightChange }) {
  const { unit, display } = useUnit();
  const [historyOpen, setHistoryOpen] = useState(false);
  const colHeader   = { fontSize:'0.7rem', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--dim)', textAlign:'center' };
  const lastSetDone = doneSet.has(`${exercise.exercise_id}-${exercise.sets.length}`);

  // Progression hint derived from set 1 (representative for the exercise)
  const s1 = exercise.sets[0];
  let progressHint = null;
  if (s1?.prev_weight != null || s1?.prev_reps != null) {
    const parts = [];
    if (s1.prev_weight != null && Math.abs(s1.weight - s1.prev_weight) > 0.001) {
      parts.push(`${s1.weight > s1.prev_weight ? '↑' : '↓'} ${display(s1.prev_weight)} → ${display(s1.weight)}`);
    }
    if (s1.prev_reps != null && s1.reps !== s1.prev_reps) {
      parts.push(`${s1.prev_reps} → ${s1.reps} reps`);
    }
    if (parts.length) progressHint = parts.join(' · ');
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
        const bwLocked = exercise.sets.some(s => doneSet.has(`${exercise.exercise_id}-${s.set_num}`));
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
        const initKey = `${exercise.exercise_id}-${set.set_num}`;
        const init    = initials?.get(initKey);
        return (
          <SetRow key={set.set_num} set={set}
            exerciseId={exercise.exercise_id} sessionId={sessionId}
            isGroupCheckedIn={isGroupCheckedIn}
            onDone={() => onSetDone(exercise.exercise_id, set.set_num)}
            onUndone={() => onSetUndone(exercise.exercise_id, set.set_num)}
            onResetCheckin={onResetCheckin}
            onValuesChange={(w, r, s) => onSetValuesChange?.(set.set_num, w, r, s)}
            resetCounter={resetCounter}
            initialStatus={init?.status ?? 'idle'}
            initialReps={init?.reps ?? ''}
            isBodyweight={isBodyweight}
            bodyweightStr={bodyweightStr}
          />
        );
      })}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'8px', paddingTop:'8px', borderTop:'1px solid var(--border)' }}>
        <span style={{ fontSize:'0.72rem', color:'var(--muted)', letterSpacing:'0.01em' }}>{progressHint ?? ''}</span>
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
      </div>

      {historyOpen && (
        <ExerciseHistoryModal exercise={exercise} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  );
}

// ── Today page ─────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const { toKg, display } = useUnit();
  const navigate = useNavigate();

  // Plan & navigation
  const [activePlan, setActivePlan]   = useState(null);
  const [calendarData, setCalendarData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Week count (mirrors activePlan.week_count, updated optimistically)
  const [weekCount, setWeekCount]           = useState(null);
  const [weekShrinkWarning, setWeekShrinkWarning] = useState(null);
  const [endOfPlanModal, setEndOfPlanModal] = useState(false);

  // Session & exercises
  const [session, setSession]       = useState(null);
  const [exercises, setExercises]   = useState([]);
  const [initials, setInitials]     = useState(new Map());

  // Logging state
  const [doneSet, setDoneSet]           = useState(new Set());
  const [checkedInGroups, setCheckedIn] = useState(new Set());
  const [pendingCheckin, setPending]    = useState(null);
  const [dismissedGroups, setDismissed] = useState(new Set());

  // Finish workout
  const liveValues = useRef(new Map());
  const [reloadKey, setReloadKey]     = useState(0);
  const [finishModal, setFinishModal] = useState(null);

  // Per-exercise reset counters (incremented to signal SetRows to untick)
  const [exerciseResetCounters, setExerciseResetCounters] = useState({});

  // Per-exercise bodyweight input (propagates forward to subsequent BW exercises)
  const [bodyweightValues, setBodyweightValues] = useState(new Map());

  // Drag state
  const [dragExerciseId, setDragExId] = useState(null);
  const [dragOverId, setDragOverId]   = useState(null);

  const [loading, setLoading]       = useState(true);
  const [sessLoading, setSessLoading] = useState(false);
  const [error, setError]           = useState(null);

  // ── Step 1: load plan + calendar, pick default date ──────────────────────────

  useEffect(() => {
    async function init() {
      const plan = await api.getActivePlan();
      if (!plan) { setLoading(false); return; }
      setActivePlan(plan);

      const calData = await api.getPlanCalendar(plan.id);
      setCalendarData(calData);

      const allDays = calData.weeks.flatMap(w => w.days).sort((a, b) => a.date.localeCompare(b.date));

      // Default: first workout slot that hasn't been completed yet (ignore actual date)
      let def = allDays.find(d => !(d.session?.checked_in === 1));
      // Fallback: last day in calendar
      if (!def) def = allDays[allDays.length - 1];

      if (def) setSelectedDate(def.date);
      else setLoading(false);
    }
    init().catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (activePlan) setWeekCount(activePlan.week_count ?? 4);
  }, [activePlan?.id]); // eslint-disable-line

  // ── Step 2: load session + exercises when selected date changes ───────────────

  useEffect(() => {
    if (!selectedDate || !activePlan) return;

    async function loadDay() {
      liveValues.current.clear();
      setSessLoading(true);
      setDoneSet(new Set());
      setCheckedIn(new Set());
      setPending(null);
      setDismissed(new Set());
      setDragExId(null);
      setDragOverId(null);

      const dow = dowFromStr(selectedDate);
      const [sess, exs] = await Promise.all([
        api.getSessionForDate(selectedDate),
        api.getScheduleForDay(dow),
      ]);
      setSession(sess);
      setExercises(exs);

      const [loggedSets, checkinGroups] = await Promise.all([
        api.getSessionSets(sess.id),
        api.getCheckins(sess.id),
      ]);

      const initMap = new Map();
      const initDone = new Set();
      for (const ls of loggedSets) {
        const key = `${ls.exercise_id}-${ls.set_num}`;
        if (ls.skipped) { initMap.set(key, { status: 'skipped', reps: '' }); initDone.add(key); }
        else if (ls.reps_done != null) { initMap.set(key, { status: 'logged', reps: String(ls.reps_done) }); initDone.add(key); }
      }

      // Pre-dismiss groups whose sets are all already logged/skipped so the
      // check-in modal doesn't fire immediately when switching to a past day.
      const checkinSet = new Set(checkinGroups);
      const preDismissed = new Set();
      for (const g of groupByMuscle(exs)) {
        if (!checkinSet.has(g.muscle_group)) {
          const allLogged = g.exercises.every(ex =>
            ex.sets.every(s => initDone.has(`${ex.exercise_id}-${s.set_num}`))
          );
          if (allLogged) preDismissed.add(g.muscle_group);
        }
      }

      const storedBW = localStorage.getItem(`ft_bodyweight_${selectedDate}`) ?? localStorage.getItem('ft_bodyweight') ?? '';
      const bwMap = new Map();
      for (const ex of exs) {
        if (ex.equipment === 'bodyweight') bwMap.set(ex.exercise_id, storedBW);
      }

      setInitials(initMap);
      setDoneSet(initDone);
      setCheckedIn(checkinSet);
      setDismissed(preDismissed);
      setBodyweightValues(bwMap);
      setSessLoading(false);
      setLoading(false);
    }

    loadDay().catch(e => { setError(e.message); setSessLoading(false); setLoading(false); });
  }, [selectedDate, activePlan?.id, reloadKey]); // eslint-disable-line

  // ── Derived state ─────────────────────────────────────────────────────────────

  const groups = groupByMuscle(exercises);

  function groupIsDone(group) {
    return group.exercises.every(ex => ex.sets.every(s => doneSet.has(`${ex.exercise_id}-${s.set_num}`)));
  }

  // Week / Day label — derived from the calendar so week boundaries align correctly
  const weekDayLabel = (() => {
    if (!calendarData?.weeks?.length || !selectedDate) return null;
    for (const week of calendarData.weeks) {
      const idx = week.days.findIndex(d => d.date === selectedDate);
      if (idx >= 0) return { weekNum: week.week_num, dayNum: idx + 1 };
    }
    return null;
  })();

  const allDone = session?.checked_in === 1 ||
    (groups.length > 0 && groups.every(g => checkedInGroups.has(g.muscle_group)));

  // ── Auto-trigger check-in ─────────────────────────────────────────────────────

  useEffect(() => {
    if (pendingCheckin !== null) return;
    const next = groups.find(g => groupIsDone(g) && !checkedInGroups.has(g.muscle_group) && !dismissedGroups.has(g.muscle_group));
    if (next) setPending(next.muscle_group);
  }, [doneSet, pendingCheckin, checkedInGroups, dismissedGroups]); // eslint-disable-line

  // ── Callbacks ─────────────────────────────────────────────────────────────────

  const onSetDone = useCallback((exId, setNum) => {
    setDoneSet(prev => new Set([...prev, `${exId}-${setNum}`]));
  }, []);

  const onSetUndone = useCallback((exId, setNum) => {
    setDoneSet(prev => { const n = new Set(prev); n.delete(`${exId}-${setNum}`); return n; });
    const ex = exercises.find(e => e.exercise_id === exId);
    if (ex) setDismissed(prev => { const n = new Set(prev); n.delete(ex.muscle_group); return n; });
  }, [exercises]);

  const onCheckin = useCallback((muscleGroup) => {
    setCheckedIn(prev => new Set([...prev, muscleGroup]));
    setPending(null);
    if (activePlan) api.getPlanCalendar(activePlan.id).then(setCalendarData);

    // Detect end-of-plan: all groups now checked in AND this is the last calendar day
    const updatedGroups = new Set([...checkedInGroups, muscleGroup]);
    if (groups.every(g => updatedGroups.has(g.muscle_group))) {
      const lastWeek = calendarData?.weeks?.[calendarData.weeks.length - 1];
      const lastDay  = lastWeek?.days?.[lastWeek.days.length - 1];
      if (lastDay?.date === selectedDate) {
        setEndOfPlanModal(true);
      }
    }
  }, [activePlan, groups, checkedInGroups, calendarData, selectedDate]);

  function handleClosePending() {
    setDismissed(prev => new Set([...prev, pendingCheckin]));
    setPending(null);
  }

  const onResetCheckin = useCallback(async (muscleGroup) => {
    if (!session?.id) return;
    await api.resetCheckin(session.id, muscleGroup);
    setCheckedIn(prev => { const n = new Set(prev); n.delete(muscleGroup); return n; });
    setDismissed(prev => { const n = new Set(prev); n.delete(muscleGroup); return n; });
    // Untick all sets in this muscle group and remove from doneSet
    const groupExs = exercises.filter(ex => ex.muscle_group === muscleGroup);
    setDoneSet(prev => {
      const n = new Set(prev);
      for (const ex of groupExs) for (const s of ex.sets) n.delete(`${ex.exercise_id}-${s.set_num}`);
      return n;
    });
    setExerciseResetCounters(prev => {
      const n = { ...prev };
      for (const ex of groupExs) n[ex.exercise_id] = (n[ex.exercise_id] ?? 0) + 1;
      return n;
    });
  }, [session, exercises]);

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
    if (doneSet.has(`${exerciseId}-${ex.sets.length}`)) return;
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
    localStorage.setItem(`ft_bodyweight_${selectedDate}`, value);
    localStorage.setItem('ft_bodyweight', value); // global fallback for new days
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

  // ── Skip helpers ──────────────────────────────────────────────────────────────

  async function handleSkipSession() {
    if (!session) return;
    await api.skipSession(session.id);
    setSession(s => ({ ...s, checked_in: 1 }));
    const allKeys = exercises.flatMap(ex => ex.sets.map(s => `${ex.exercise_id}-${s.set_num}`));
    setDoneSet(new Set(allKeys));
    if (activePlan) api.getPlanCalendar(activePlan.id).then(setCalendarData);
  }

  // ── Finish workout ────────────────────────────────────────────────────────────

  function handleFinishWorkout() {
    const toLog = [], toSkip = [];
    for (const ex of exercises) {
      for (const set of ex.sets) {
        const key  = `${ex.exercise_id}-${set.set_num}`;
        const live = liveValues.current.get(key);
        if (live?.status === 'logged' || live?.status === 'skipped') continue;
        const isBW      = ex.equipment === 'bodyweight';
        const hasWeight = isBW || (live?.weight !== '' && live?.weight != null);
        const hasReps   = live?.reps !== '' && live?.reps != null && parseInt(live.reps, 10) >= 1;
        if (hasWeight && hasReps) {
          const bwStr   = bodyweightValues.get(ex.exercise_id);
          const weightKg = isBW
            ? (bwStr ? toKg(parseFloat(bwStr)) : 0)
            : toKg(parseFloat(live.weight));
          toLog.push({ exerciseName: ex.name, exerciseId: ex.exercise_id, setNum: set.set_num,
            weightKg, reps: parseInt(live.reps, 10) });
        } else {
          toSkip.push({ exerciseName: ex.name, exerciseId: ex.exercise_id, setNum: set.set_num });
        }
      }
    }
    if (toLog.length === 0 && toSkip.length === 0) return;
    setFinishModal({ toLog, toSkip });
  }

  async function handleConfirmFinish() {
    const { toLog, toSkip } = finishModal;
    await Promise.all([
      ...toLog.map(item => api.logSet(session.id, { exercise_id: item.exerciseId, set_num: item.setNum, reps_done: item.reps, skipped: 0, weight_used: item.weightKg })),
      ...toSkip.map(item => api.logSet(session.id, { exercise_id: item.exerciseId, set_num: item.setNum, reps_done: null, skipped: 1, weight_used: null })),
    ]);
    setFinishModal(null);
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
            {weekDayLabel?.dayNum ? `Day ${weekDayLabel.dayNum}` : (selectedDate ? DAY_LABELS[dowFromStr(selectedDate)] : 'Today')}
          </h2>
          <div style={{ fontSize:'0.8rem', color:'var(--muted)', marginTop:'4px' }}>
            {selectedDate && fmtDate(selectedDate)}
            {activePlan && <span style={{ color:'var(--dim)' }}> · {activePlan.name}</span>}
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
          selectedDate={selectedDate}
          onSelect={date => { setSelectedDate(date); setCalendarOpen(false); }}
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
          {exercises.map(ex => (
            <ExerciseCard
              key={`${session?.id}-${ex.exercise_id}`}
              exercise={ex} sessionId={session?.id}
              isGroupCheckedIn={checkedInGroups.has(ex.muscle_group)}
              onSetDone={onSetDone} onSetUndone={onSetUndone}
              onResetCheckin={() => onResetCheckin(ex.muscle_group)}
              onAddSet={() => onAddSet(ex.exercise_id)}
              onRemoveSet={() => onRemoveSet(ex.exercise_id)}
              onSetValuesChange={(setNum, w, r, s) => { liveValues.current.set(`${ex.exercise_id}-${setNum}`, { weight: w, reps: r, status: s }); }}
              resetCounter={exerciseResetCounters[ex.exercise_id] ?? 0}
              isDragOver={dragOverId === ex.exercise_id}
              onDragStart={() => setDragExId(ex.exercise_id)}
              onDragOver={() => { if (dragExerciseId && dragExerciseId !== ex.exercise_id) setDragOverId(ex.exercise_id); }}
              onDrop={() => handleExerciseDrop(ex.exercise_id)}
              onDragEnd={() => { setDragExId(null); setDragOverId(null); }}
              doneSet={doneSet}
              initials={initials}
              isBodyweight={ex.equipment === 'bodyweight'}
              bodyweightStr={bodyweightValues.get(ex.exercise_id) ?? ''}
              onBodyweightChange={val => handleBodyweightChange(ex.exercise_id, val)}
            />
          ))}

          {allDone ? (
            <div style={{ marginTop:'1rem', padding:'0.85rem 1rem', background:'#152015', border:'1px solid #2d4a2d', borderRadius:'10px', color:'var(--success)', fontWeight:'600' }}>
              ✓ All done — next session targets updated.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'stretch', gap:'0.5rem', marginTop:'1rem' }}>
              <button type="button" onClick={handleFinishWorkout}
                style={{ padding:'0.75rem 1rem', background:'var(--btn)', color:'var(--btn-text)', border:'none', borderRadius:'10px', fontWeight:'700', fontSize:'1rem', cursor:'pointer' }}>
                Finish Workout
              </button>
              <button type="button" onClick={handleSkipSession}
                style={{ background:'none', border:'none', color:'var(--dim)', fontSize:'0.8rem', cursor:'pointer', textDecoration:'underline', padding:'0.25rem 0' }}>
                Skip entire session →
              </button>
            </div>
          )}
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
