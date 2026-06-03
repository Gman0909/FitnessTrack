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

function Star({ size = 13, color = '#f0a030' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.86-5-4.87 7.1-1.01L12 2z" />
    </svg>
  );
}

// Thin progress ring — green arc fills to the lifts-up fraction on mount.
function Ring({ up, total }) {
  const r = 52, C = 2 * Math.PI * r;
  const frac = total > 0 ? up / total : 0;
  const [fill, setFill] = useState(0);
  useEffect(() => { const t = setTimeout(() => setFill(frac), 60); return () => clearTimeout(t); }, [frac]);
  return (
    <div style={{ position: 'relative', width: 128, height: 128 }}>
      <svg width="128" height="128" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--success)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - fill)} style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{up}</span>
        <span style={{ fontSize: '0.95rem', color: 'var(--muted)', marginTop: 2 }}>/ {total}</span>
      </div>
    </div>
  );
}

export function WorkoutRecap({ data, onClose }) {
  const { unit } = useUnit();
  const toDisp = kg => (unit === 'lbs' ? kg * 2.2046 : kg);
  const fmtW = kg => { const v = toDisp(kg); return Number.isInteger(v) ? `${v}` : `${Math.round(v * 2) / 2}`; };
  const fmtVol = kg => Math.round(toDisp(kg)).toLocaleString();

  const { comparison, exercises, counts, volume } = data;
  const baseline = comparison === 'baseline';
  const vsLabel = comparison === 'last_week' ? 'last week'
    : comparison === 'earlier' ? `week ${data.compared_week}` : null;

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 250, padding: '0' };
  const sheet = { background: 'var(--surface2)', borderRadius: '16px 16px 0 0', padding: '1.4rem 1.25rem 1.6rem', width: '100%', maxWidth: '480px', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1.15rem' };
  const sectionLabel = { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)', margin: '0 0 0.55rem' };

  // Tempo call-outs (one fast and/or one slow, kept brief).
  const fast = exercises.find(e => e.tempo === 'fast');
  const slow = exercises.find(e => e.tempo === 'slow');
  const prs  = exercises.filter(e => e.pr);

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
            <span style={{ color: 'var(--text)', fontSize: '1.05rem', marginTop: '0.4rem' }}>{fmtVol(volume.this)} <span style={{ color: 'var(--muted)' }}>{unit}·reps</span></span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Ring up={data.lifts_up} total={data.lifts_comparable} />
            <span style={{ color: 'var(--text)', fontSize: '1.05rem', fontWeight: 600 }}>
              lifts up on <span style={{ color: 'var(--muted)' }}>{vsLabel}</span>
            </span>
            <span style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
              {fmtVol(volume.this)} {unit}·reps
              {volume.delta_pct != null && (
                <span style={{ color: volume.delta_pct > 0 ? 'var(--success)' : volume.delta_pct < 0 ? 'var(--danger)' : 'var(--muted)', fontWeight: 600 }}>
                  {'  ·  '}{volume.delta_pct > 0 ? '▲' : volume.delta_pct < 0 ? '▼' : '→'} {volume.delta_pct > 0 ? '+' : ''}{volume.delta_pct}%
                </span>
              )}
            </span>
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
                <div key={e.exercise_id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
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
