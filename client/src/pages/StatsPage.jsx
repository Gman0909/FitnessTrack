import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/index.js';
import { useUnit } from '../units.js';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const MG_COLOR = {
  chest: '#e05c8a', back: '#3cc9b0', shoulders: '#f0a030',
  biceps: '#4d9de0', triceps: '#e15554', legs: '#9b6fd4', core: '#4caf50',
};

const TT = { contentStyle: { background: '#1c1c1c', border: '1px solid #333', borderRadius: '6px', color: '#e8e8e8', fontSize: '0.82rem' } };

function fmtWeek(str) {
  const d = new Date(str + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function Section({ title }) {
  return (
    <h3 style={{ margin: '1.75rem 0 0.65rem', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--dim)' }}>
      {title}
    </h3>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
      <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--dim)', marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: '700', color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

// ── Reset modal ───────────────────────────────────────────────────────────────

function ResetModal({ onClose, onDone }) {
  const [typed,   setTyped]   = useState('');
  const [loading, setLoading] = useState(false);
  const [backup,  setBackup]  = useState(null);
  const ok = typed === 'erase all training data';

  async function handleReset() {
    setLoading(true);
    try {
      const data = await api.resetStats();
      setBackup(data.backup);
      onDone();
    } catch (e) {
      alert(e.message);
      setLoading(false);
    }
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' };
  const box     = { background: 'var(--surface2)', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '1rem' };
  const inp     = { padding: '0.5rem 0.65rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box', fontSize: '0.9rem' };

  if (backup) return (
    <div style={overlay}>
      <div style={box}>
        <strong style={{ color: 'var(--text)' }}>Data reset complete</strong>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)' }}>All training data deleted. Backup saved to:</p>
        <code style={{ fontSize: '0.78rem', color: 'var(--dim)', background: 'var(--surface)', padding: '0.5rem 0.75rem', borderRadius: '6px', wordBreak: 'break-all' }}>{backup}</code>
        <button onClick={onClose} style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '6px', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: '600', cursor: 'pointer' }}>Done</button>
      </div>
    </div>
  );

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ color: '#e05c8a' }}>Reset all training data</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.55 }}>
          Permanently deletes all sessions, logged sets, check-ins, and set targets.
          A timestamped backup is created before deletion.
        </p>
        <div>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.8rem', color: 'var(--dim)' }}>Type to confirm:</p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', fontStyle: 'italic', color: 'var(--muted)', userSelect: 'all' }}>erase all training data</p>
          <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type the phrase above…"
            autoFocus style={inp} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.45rem 1rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleReset} disabled={!ok || loading}
            style={{ padding: '0.45rem 1.25rem', border: 'none', borderRadius: '6px', background: ok ? '#c0392b' : 'var(--surface)', color: ok ? '#fff' : 'var(--dim)', fontWeight: '600', cursor: ok ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}>
            {loading ? 'Resetting…' : 'Reset everything'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

async function downloadExport(type, scope) {
  const res = await fetch(`/api/stats/export?type=${type}&scope=${scope}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const ct = res.headers.get('Content-Type') ?? '';
  if (!ct.startsWith('text/csv')) throw new Error('Export failed — server returned unexpected content type. Try restarting the server.');
  const cd       = res.headers.get('Content-Disposition') ?? '';
  const filename = cd.match(/filename="([^"]+)"/)?.[1] ?? `${type}.csv`;
  const blob     = await res.blob();
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const EXPORTS = [
  { type: 'exercise_history', label: 'Exercise history',  desc: 'Every logged set — date, exercise, weight, reps' },
  { type: 'sessions',         label: 'Session summary',   desc: 'One row per workout — volume and sets logged' },
  { type: 'personal_bests',   label: 'Personal bests',    desc: 'All-time max weight per exercise' },
  { type: 'weekly_volume',    label: 'Weekly volume',     desc: 'Total volume (kg·reps) by week' },
];

export function StatsPage() {
  const [scope,     setScope]     = useState('all');
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [showReset, setShowReset] = useState(false);
  const [exercises, setExercises] = useState([]);
  const [selEx,     setSelEx]     = useState(null);
  const [exHistory, setExHistory] = useState([]);
  const [exMetric,  setExMetric]  = useState('volume');
  const [exporting, setExporting] = useState(null);
  const { unit, display } = useUnit();

  async function handleExport(type) {
    setExporting(type);
    try { await downloadExport(type, scope); }
    catch (e) { alert(e.message); }
    finally   { setExporting(null); }
  }

  const load = useCallback(() => {
    setLoading(true);
    api.getStats(scope).then(s => { setStats(s); setLoading(false); });
  }, [scope]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.getLoggedExercises().then(setExercises); }, []);
  useEffect(() => {
    if (!selEx) return;
    api.getExerciseHistory(selEx.exercise_id).then(setExHistory);
  }, [selEx]);

  const { overview, weekly_volume = [], session_volume = [], muscle_volume = [], personal_bests = [], top_exercises = [] } = stats ?? {};

  const volScale = unit === 'lbs' ? 2.2046 : 1;
  const volUnit  = unit === 'lbs' ? 'lbs' : 'kg';

  const volData  = weekly_volume.map(r => ({ week: fmtWeek(r.week_start), vol: Math.round(r.volume * volScale) }));
  const sessData = session_volume.map(r => ({ date: fmtWeek(r.date), vol: Math.round(r.volume * volScale) }));
  const pieData  = muscle_volume.map(r => ({ name: r.muscle_group, value: Math.round(r.volume * volScale) }));
  const pieTotal = pieData.reduce((s, r) => s + r.value, 0);
  const maxSess  = top_exercises.reduce((m, e) => Math.max(m, e.session_count), 1);

  const exData = exHistory.map(r => ({
    date: r.date.slice(5),
    y: unit === 'lbs' ? +(( exMetric === 'max_weight' ? r.max_weight : r.volume) * 2.2046).toFixed(1)
                      : (exMetric === 'max_weight' ? r.max_weight : r.volume),
  }));

  const noData = !loading && (overview?.total_workouts ?? 0) === 0;

  return (
    <div>
      {/* Header + scope toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, color: 'var(--text)' }}>Stats</h2>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {[['all', 'All time'], ['active', 'This plan']].map(([s, l]) => (
            <button key={s} onClick={() => setScope(s)}
              style={{ padding: '0.3rem 0.75rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', background: scope === s ? 'var(--btn)' : 'var(--surface)', color: scope === s ? 'var(--btn-text)' : 'var(--muted)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats && <p style={{ color: 'var(--muted)' }}>Loading…</p>}

      {/* Overview cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
          <StatCard label="Workouts" value={overview.total_workouts} />
          <StatCard label="Avg / week" value={overview.avg_per_week} sub="workouts" />
          <StatCard label="Sets logged" value={overview.sets_logged.toLocaleString()} />
          <StatCard label="Total volume"
            value={Math.round(overview.total_volume * volScale).toLocaleString()}
            sub={`${volUnit}·reps`} />
        </div>
      )}

      {noData && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted)' }}>
          <p style={{ margin: '0 0 0.4rem' }}>No workout data{scope === 'active' ? ' for the active plan' : ''} yet.</p>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Log a workout to see your stats.</p>
        </div>
      )}

      {/* Weekly volume */}
      {volData.length > 0 && <>
        <Section title="Weekly Volume" />
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <AreaChart data={volData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3cc9b0" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3cc9b0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
              <XAxis dataKey="week" tick={{ fill: '#555', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#555', fontSize: 10 }} width={44}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip {...TT} formatter={v => [`${v.toLocaleString()} ${volUnit}·reps`, 'Volume']} />
              <Area type="monotone" dataKey="vol" stroke="#3cc9b0" strokeWidth={2} fill="url(#vg)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </>}

      {/* Per-session volume */}
      {sessData.length > 0 && <>
        <Section title="Volume per Workout" />
        <div style={{ width: '100%', height: 190 }}>
          <ResponsiveContainer>
            <LineChart data={sessData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
              <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#555', fontSize: 10 }} width={44}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip {...TT} formatter={v => [`${v.toLocaleString()} ${volUnit}·reps`, 'Volume']} />
              <Line type="monotone" dataKey="vol" stroke="#4d9de0" strokeWidth={2}
                dot={{ r: 3, fill: '#4d9de0' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>}

      {/* Volume by muscle */}
      {pieData.length > 0 && <>
        <Section title="Volume by Muscle Group" />
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ width: 150, height: 150, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={2}>
                  {pieData.map((e, i) => <Cell key={i} fill={MG_COLOR[e.name] ?? '#888'} />)}
                </Pie>
                <Tooltip {...TT} formatter={(v, n) => [`${Math.round(v / pieTotal * 100)}%`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {pieData.map(r => (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: MG_COLOR[r.name] ?? '#888', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text)', textTransform: 'capitalize' }}>{r.name}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>{Math.round(r.value / pieTotal * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </>}

      {/* Exercise progression */}
      {exercises.length > 0 && <>
        <Section title="Exercise Progression" />
        <select value={selEx?.exercise_id ?? ''}
          onChange={e => setSelEx(exercises.find(x => x.exercise_id === Number(e.target.value)) ?? null)}
          style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.9rem', width: '100%', background: 'var(--input-bg)', color: 'var(--text)', marginBottom: '0.5rem' }}>
          <option value="">Select an exercise…</option>
          {exercises.map(x => <option key={x.exercise_id} value={x.exercise_id}>{x.name}</option>)}
        </select>
        {selEx && <>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.65rem' }}>
            {[['volume', 'Volume'], ['max_weight', 'Max weight']].map(([k, l]) => (
              <button key={k} onClick={() => setExMetric(k)}
                style={{ padding: '0.25rem 0.7rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', background: exMetric === k ? 'var(--btn)' : 'var(--surface)', color: exMetric === k ? 'var(--btn-text)' : 'var(--text)' }}>
                {l}
              </button>
            ))}
          </div>
          {exData.length > 0 ? (
            <div style={{ width: '100%', height: 210 }}>
              <ResponsiveContainer>
                <LineChart data={exData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
                  <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#555', fontSize: 10 }} width={48} />
                  <Tooltip {...TT}
                    formatter={v => exMetric === 'max_weight'
                      ? [`${v} ${unit}`, 'Max weight']
                      : [`${Math.round(v).toLocaleString()} ${volUnit}·reps`, 'Volume']} />
                  <Line type="monotone" dataKey="y" stroke="#e8e8e8" strokeWidth={2}
                    dot={{ r: 3, fill: '#e8e8e8' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>No data for this exercise yet.</p>}
        </>}
      </>}

      {/* Personal bests */}
      {personal_bests.length > 0 && <>
        <Section title="Personal Bests" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {personal_bests.map(pb => (
            <div key={pb.exercise_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: MG_COLOR[pb.muscle_group] ?? '#888', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text)' }}>{pb.name}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                {display(pb.max_weight)} × {pb.reps_done}
              </span>
            </div>
          ))}
        </div>
      </>}

      {/* Most trained */}
      {top_exercises.length > 0 && <>
        <Section title="Most Trained" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {top_exercises.map(ex => (
            <div key={ex.exercise_id} style={{ padding: '0.5rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: MG_COLOR[ex.muscle_group] ?? '#888', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.87rem', color: 'var(--text)' }}>{ex.name}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--dim)' }}>{ex.session_count} sessions</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(ex.session_count / maxSess) * 100}%`, background: MG_COLOR[ex.muscle_group] ?? '#888', borderRadius: 2, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </>}

      {/* Export */}
      <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 0.3rem', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--dim)' }}>Export Data</h3>
        <p style={{ margin: '0 0 0.85rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
          Downloads respect the <em>All time / This plan</em> scope above. Data is always in kg.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {EXPORTS.map(({ type, label, desc }) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text)' }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--dim)', marginTop: '0.1rem' }}>{desc}</div>
              </div>
              <button
                onClick={() => handleExport(type)}
                disabled={exporting !== null}
                style={{ padding: '0.3rem 0.75rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface2)', color: exporting === type ? 'var(--dim)' : 'var(--text)', fontSize: '0.8rem', cursor: exporting !== null ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {exporting === type ? 'Downloading…' : 'Download CSV'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--danger)' }}>Danger Zone</h3>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.855rem', color: 'var(--muted)' }}>
          Permanently delete all training data. A backup is created automatically before deletion.
        </p>
        <button onClick={() => setShowReset(true)}
          style={{ padding: '0.45rem 1.1rem', border: '1px solid var(--danger)', borderRadius: '6px', background: 'none', color: 'var(--danger)', fontSize: '0.855rem', cursor: 'pointer' }}>
          Reset training data…
        </button>
      </div>

      {showReset && <ResetModal onClose={() => setShowReset(false)} onDone={load} />}
    </div>
  );
}
