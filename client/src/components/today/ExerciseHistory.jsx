import { useState, useEffect, useRef } from 'react';
import { api } from '../../api/index.js';
import { useUnit } from '../../units.js';
import { MuscleGroupBadge } from './MuscleGroupBadge.jsx';

// ── History icon ──────────────────────────────────────────────────────────────

export function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 8A5 5 0 1 1 8 3" />
      <polyline points="5.5,1.5 8,3 5.5,4.5" />
      <line x1="8" y1="8" x2="8" y2="5.8" />
      <line x1="8" y1="8" x2="10.2" y2="8" />
    </svg>
  );
}

// ── History chart ──────────────────────────────────────────────────────────────

// metric: 'volume' | 'weight' (top weight) | 'e1rm' (estimated 1-rep max)
const metricValue = (d, metric) => metric === 'volume' ? d.volume : metric === 'e1rm' ? d.e1rm : d.max_weight;

export function HistoryChart({ data, metric }) {
  const { unit } = useUnit();
  const toDisp = kg => unit === 'lbs' ? Math.round(kg * 2.2046 * 10) / 10 : kg;
  const valueOf = d => metricValue(d, metric);

  const W = 500, H = 180;
  const pad = { top: 14, right: 16, bottom: 34, left: 46 };
  const cW  = W - pad.left - pad.right;
  const cH  = H - pad.top  - pad.bottom;

  const vals = data.map(d => toDisp(valueOf(d)));
  const lo   = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const yLo  = lo - span * 0.18, yHi = hi + span * 0.18;

  const xOf  = i => pad.left + (data.length > 1 ? (i / (data.length - 1)) * cW : cW / 2);
  const yOf  = v => pad.top  + cH * (1 - (v - yLo) / (yHi - yLo));
  const pts  = vals.map((v, i) => [xOf(i), yOf(v)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${line}L${pts.at(-1)[0].toFixed(1)},${(pad.top + cH).toFixed(1)}L${pts[0][0].toFixed(1)},${(pad.top + cH).toFixed(1)}Z`;

  // lo/hi are already in display units — round for tick labels (whole numbers
  // for volume, nearest 0.5 for weight).
  const yTicks = [lo, (lo + hi) / 2, hi].map(v =>
    metric === 'volume' ? Math.round(v) : Math.round(v * 2) / 2);

  const nLabels = Math.min(data.length, 5);
  const xIdxs  = Array.from({ length: nLabels }, (_, k) =>
    Math.round(k * (data.length - 1) / Math.max(nLabels - 1, 1))
  );
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const shortDate = s => { const [,m,d] = s.split('-').map(Number); return `${MONTHS[m-1]} ${d}`; };

  // Hover / tap to inspect a point — map the pointer to the nearest data index.
  const svgRef = useRef(null);
  const [active, setActive] = useState(null);
  const locate = e => {
    const svg = svgRef.current; if (!svg) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX;
    if (cx == null) return;
    const rect = svg.getBoundingClientRect();
    const vbX = (cx - rect.left) / rect.width * W;
    const i = data.length > 1 ? Math.round((vbX - pad.left) / cW * (data.length - 1)) : 0;
    setActive(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block', touchAction:'pan-y', cursor:'crosshair' }}
      onMouseMove={locate} onMouseLeave={() => setActive(null)} onTouchStart={locate} onTouchMove={locate}>
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
        transform={`rotate(-90,8,${pad.top + cH / 2})`}>{metric === 'volume' ? `${unit}·reps` : unit}</text>
      {xIdxs.map((idx, k) => (
        <text key={k} x={xOf(idx)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--dim)">
          {shortDate(data[idx].date)}
        </text>
      ))}

      {active != null && (() => {
        const d = data[active];
        const ax = xOf(active), ay = yOf(toDisp(valueOf(d)));
        const valStr = metric === 'volume'
          ? `${Math.round(toDisp(d.volume)).toLocaleString()} ${unit}·reps`
          : metric === 'e1rm'
            ? `e1RM ${toDisp(d.e1rm)} ${unit}`
            : `${toDisp(d.max_weight)} ${unit}`;
        const setsStr = `${d.sets_logged} set${d.sets_logged !== 1 ? 's' : ''}`;
        const lineH = 15, boxW = 128, boxH = 10 + 3 * lineH;
        const bx = Math.max(2, Math.min(W - boxW - 2, ax - boxW / 2));
        let by = ay - boxH - 12;
        if (by < pad.top) by = ay + 14;
        by = Math.max(2, Math.min(H - boxH - 2, by));
        return (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={ax} y1={pad.top} x2={ax} y2={pad.top + cH} stroke="var(--dim)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={ax} cy={ay} r="4.5" fill="var(--success)" stroke="var(--surface2)" strokeWidth="1.5" />
            <rect x={bx} y={by} width={boxW} height={boxH} rx="6" fill="#1c1c1c" stroke="#333" />
            <text x={bx + 9} y={by + 16}            fontSize="11" fontWeight="700" fill="#e8e8e8">{shortDate(d.date)}</text>
            <text x={bx + 9} y={by + 16 + lineH}     fontSize="11" fill="var(--success)">{valStr}</text>
            <text x={bx + 9} y={by + 16 + 2 * lineH} fontSize="11" fill="#9a9a9a">{setsStr}</text>
          </g>
        );
      })()}
    </svg>
  );
}

// ── Exercise history modal ─────────────────────────────────────────────────────

export function ExerciseHistoryModal({ exercise, onClose }) {
  const { display } = useUnit();
  const [history, setHistory] = useState(null);
  const [metric, setMetric]   = useState('volume');

  useEffect(() => {
    api.getExerciseHistory(exercise.exercise_id).then(setHistory);
  }, [exercise.exercise_id]); // eslint-disable-line

  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' };
  const box     = { background:'var(--surface2)', borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'560px', display:'flex', flexDirection:'column', gap:'1rem', border:'1px solid var(--border)' };
  const tab     = active => ({
    flex:1, padding:'0.45rem 0', minHeight:'34px',
    border:`1px solid ${active ? 'var(--btn)' : 'var(--border)'}`, borderRadius:'7px',
    background: active ? 'var(--btn)' : 'var(--surface)',
    color: active ? 'var(--btn-text)' : 'var(--text)',
    fontSize:'0.8rem', fontWeight: active ? '700' : '500', cursor:'pointer',
  });
  const valueOf = d => metricValue(d, metric);
  const weighted = exercise.equipment !== 'bodyweight';
  // Volume is a sum of weight×reps products — round to 0.1 before display so
  // floating-point noise (e.g. 4321.8000000000002) doesn't leak through.
  const round1  = n => Math.round(n * 10) / 10;

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
            <div style={{ display:'flex', gap:'0.4rem' }}>
              <button type="button" onClick={() => setMetric('volume')} style={tab(metric === 'volume')}>Volume</button>
              <button type="button" onClick={() => setMetric('weight')} style={tab(metric === 'weight')}>Top weight</button>
              {weighted && <button type="button" onClick={() => setMetric('e1rm')} style={tab(metric === 'e1rm')}>Est. 1RM</button>}
            </div>
            <HistoryChart data={history} metric={metric} />
            {metric === 'e1rm' && (
              <p style={{ margin:0, fontSize:'0.72rem', color:'var(--dim)', lineHeight:1.45 }}>
                Your best set each session converted to an estimated one-rep max (Epley), so heavier-but-fewer-reps and lighter-but-more-reps sessions compare fairly.
              </p>
            )}
            <div style={{ display:'flex', gap:'1.5rem', fontSize:'0.8rem', color:'var(--muted)' }}>
              <span>{history.length} session{history.length !== 1 ? 's' : ''}</span>
              <span>Peak: {display(round1(Math.max(...history.map(valueOf))))}</span>
              <span>Latest: {display(round1(valueOf(history.at(-1))))}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
