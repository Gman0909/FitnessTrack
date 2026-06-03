import { useEffect, useState } from 'react';
import { useUnit } from '../units.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Verdict → colour / glyph / label. Mirrors the app's per-set language:
// green up, amber "eased off" (a deload — not the lifter's fault), red down.
const V = {
  up:    { color: 'var(--success)', glyph: '▲', label: 'up' },
  held:  { color: 'var(--dim)',     glyph: '=', label: 'held' },
  down:  { color: 'var(--danger)',  glyph: '▼', label: 'down' },
  eased: { color: '#f0a030',        glyph: '▼', label: 'eased off' },
  new:   { color: '#5a9bd4',        glyph: '+', label: 'new' },
};

// Muscle-group accent colours (matches the exercise cards).
const MC = { chest: '#f07098', back: '#3cc9b0', shoulders: '#f0a030', biceps: '#3cc9b0', triceps: '#f07098', legs: '#b088e8', core: '#4caf50' };
const mc = mg => MC[mg] ?? '#777';

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Count a number up from 0 to `target` (easeOutCubic) once on mount.
function useCountUp(target, ms = 650) {
  const reduce = reduceMotion();
  const [v, setV] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) { setV(target); return; }
    let raf, start;
    const tick = t => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduce]);
  return v;
}

function Star({ size = 13, color = '#f0a030' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.86-5-4.87 7.1-1.01L12 2z" />
    </svg>
  );
}

// Thin progress ring — green arc fills to the lifts-up fraction; centre counts up.
function Ring({ up, total }) {
  const r = 52, C = 2 * Math.PI * r;
  const frac = total > 0 ? up / total : 0;
  const reduce = reduceMotion();
  const [fill, setFill] = useState(reduce ? frac : 0);
  const num = useCountUp(up, 650);
  useEffect(() => { if (reduce) return; const t = setTimeout(() => setFill(frac), 60); return () => clearTimeout(t); }, [frac, reduce]);
  return (
    <div style={{ position: 'relative', width: 128, height: 128 }}>
      <svg width="128" height="128" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--success)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - fill)} style={{ transition: reduce ? 'none' : 'stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{Math.round(num)}</span>
        <span style={{ fontSize: '0.95rem', color: 'var(--muted)', marginTop: 2 }}>/ {total}</span>
      </div>
    </div>
  );
}

// Tiny volume sparkline across the last few same-slot sessions.
function Sparkline({ values }) {
  if (!values || values.length < 2) return null;
  const w = 168, h = 34, pad = 4;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (w - 2 * pad),
    h - pad - ((v - min) / range) * (h - 2 * pad),
  ]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--success)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="var(--success)" />
    </svg>
  );
}

export function WorkoutRecap({ data, onClose }) {
  const { unit } = useUnit();
  const toDisp = kg => (unit === 'lbs' ? kg * 2.2046 : kg);
  const fmtW = kg => { const v = toDisp(kg); return Number.isInteger(v) ? `${v}` : `${Math.round(v * 2) / 2}`; };

  const { comparison, exercises, counts, volume, trend } = data;
  const baseline = comparison === 'baseline';
  const vsLabel = comparison === 'last_week' ? 'last week'
    : comparison === 'earlier' ? `week ${data.compared_week}` : null;

  // Slide-in entrance (skipped under reduced motion).
  const reduce = reduceMotion();
  const [shown, setShown] = useState(reduce);
  useEffect(() => { if (reduce) return; const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, [reduce]);

  const volCount = useCountUp(volume.this, 650);

  // Verdict-driven hero headline (keeps a rough week encouraging).
  let hero = null;
  if (!baseline) {
    const comp = data.lifts_comparable, ratio = comp > 0 ? data.lifts_up / comp : 0;
    const rough = (counts.down + counts.eased) > data.lifts_up;
    if (comp === 0)                 hero = { head: 'Session logged', sub: `vs ${vsLabel}`, color: 'var(--text)' };
    else if (ratio >= 0.6)          hero = { head: 'Strong week',    sub: `lifts up on ${vsLabel}`, color: 'var(--success)' };
    else if (rough || ratio < 0.34) hero = { head: 'Tough one',      sub: `held the line — the targets ease off, so ${vsLabel === 'last week' ? 'next week' : 'next time'}’s a fresh shot`, color: '#f0a030' };
    else                            hero = { head: 'Solid session',  sub: `lifts up on ${vsLabel}`, color: 'var(--text)' };
  }

  const fast = exercises.find(e => e.tempo === 'fast');
  const slow = exercises.find(e => e.tempo === 'slow');
  const prs  = exercises.filter(e => e.pr);

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 250, opacity: shown ? 1 : 0, transition: reduce ? 'none' : 'opacity 0.3s ease' };
  const sheet = { background: 'var(--surface2)', borderRadius: '16px 16px 0 0', padding: '1.4rem 1.25rem 1.6rem', width: '100%', maxWidth: '480px', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1.15rem', transform: shown ? 'translateY(0)' : 'translateY(100%)', transition: reduce ? 'none' : 'transform 0.36s cubic-bezier(.32,.72,0,1)' };
  const sectionLabel = { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)', margin: '0 0 0.55rem' };
  const volLine = Math.round(toDisp(volCount)).toLocaleString();

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <div style={{ textAlign: 'center', color: 'var(--dim)', fontSize: '0.8rem', letterSpacing: '0.04em' }}>
          Week {data.week_num} · {DOW[data.session_dow]} — complete
        </div>

        {/* Hero */}
        {baseline ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.5rem 0' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>Baseline set</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>First time through — next week you'll see how you stack up.</span>
            <span style={{ color: 'var(--text)', fontSize: '1.05rem', marginTop: '0.4rem' }}>{volLine} <span style={{ color: 'var(--muted)' }}>{unit}·reps</span></span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: hero.color }}>{hero.head}</span>
            <Ring up={data.lifts_up} total={data.lifts_comparable} />
            <span style={{ color: 'var(--muted)', fontSize: '0.95rem', textAlign: 'center', maxWidth: 320 }}>{hero.sub}</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
              {volLine} {unit}·reps
              {volume.delta_pct != null && (
                <span style={{ color: volume.delta_pct > 0 ? 'var(--success)' : volume.delta_pct < 0 ? 'var(--danger)' : 'var(--muted)', fontWeight: 600 }}>
                  {'  ·  '}{volume.delta_pct > 0 ? '▲' : volume.delta_pct < 0 ? '▼' : '→'} {volume.delta_pct > 0 ? '+' : ''}{volume.delta_pct}%
                </span>
              )}
            </span>
            {trend && trend.length >= 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: 2 }}>
                <Sparkline values={trend.map(t => t.vol)} />
                <span style={{ fontSize: '0.66rem', color: 'var(--dim)', letterSpacing: '0.04em' }}>volume · last {trend.length} {DOW[data.session_dow]}s</span>
              </div>
            )}
          </div>
        )}

        {/* Segmented bar */}
        <div>
          <div style={{ display: 'flex', gap: 3 }}>
            {exercises.map(e => (
              <div key={e.exercise_id} title={`${e.name} — ${V[e.verdict].label}`}
                style={{ flex: 1, height: 9, borderRadius: 3, background: V[e.verdict].color, opacity: e.verdict === 'held' ? 0.5 : 1 }} />
            ))}
          </div>
          {!baseline && (
            <div style={{ marginTop: '0.55rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {[counts.up && `${counts.up} up`, counts.held && `${counts.held} held`,
                counts.down && `${counts.down} down`, counts.eased && `${counts.eased} eased off`,
                counts.new && `${counts.new} new`].filter(Boolean).join('  ·  ')}
            </div>
          )}
        </div>

        {/* Highlights */}
        {(prs.length > 0 || data.biggest_jump || data.reps_added > 0 || fast || slow) && (
          <div>
            <p style={sectionLabel}>Highlights</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {prs.map(e => (
                <div key={e.exercise_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}>
                  <Star /> New best — <strong>{e.name}</strong>
                  <span style={{ color: 'var(--muted)' }}>{e.pr === 'weight' ? `${fmtW(e.this.top_weight)} ${unit}` : `${e.this.top_reps} reps`}</span>
                </div>
              ))}
              {data.biggest_jump && (
                <div style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                  <span style={{ color: 'var(--success)' }}>↑</span> Biggest jump — <strong>{data.biggest_jump.name}</strong>
                </div>
              )}
              {data.reps_added > 0 && (
                <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>+{data.reps_added} reps over {vsLabel}</div>
              )}
              {fast && (
                <div style={{ fontSize: '0.9rem', color: 'var(--success)' }}>On a roll — <strong style={{ color: 'var(--text)' }}>{fast.name}</strong> is on a fast track</div>
              )}
              {slow && (
                <div style={{ fontSize: '0.9rem', color: '#f0a030' }}>Easing the pace on <strong style={{ color: 'var(--text)' }}>{slow.name}</strong> to get you through</div>
              )}
            </div>
          </div>
        )}

        {/* Lift by lift */}
        <div>
          <p style={sectionLabel}>Lift by lift</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {exercises.map(e => {
              const v = V[e.verdict];
              const thisStr = e.is_bodyweight ? `${e.this.top_reps} reps` : `${fmtW(e.this.top_weight)}×${e.this.top_reps}`;
              const prevStr = e.prev ? (e.is_bodyweight ? `${e.prev.top_reps}` : `${fmtW(e.prev.top_weight)}×${e.prev.top_reps}`) : null;
              return (
                <div key={e.exercise_id} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: mc(e.muscle_group), flexShrink: 0 }} />
                  <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.9rem' }}>{e.name}</span>
                  <span style={{ color: 'var(--dim)', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>
                    {prevStr ? `${prevStr} → ` : ''}<span style={{ color: 'var(--muted)' }}>{thisStr}</span>
                  </span>
                  <span style={{ color: v.color, fontWeight: 700, width: 16, textAlign: 'center' }}>{v.glyph}</span>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={onClose}
          style={{ marginTop: '0.2rem', padding: '0.75rem', border: 'none', borderRadius: '10px', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
          Done
        </button>
      </div>
    </div>
  );
}
