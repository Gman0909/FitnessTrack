import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/index.js';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function NewPlanModal({ onCreated, onClose }) {
  const [name, setName]   = useState('');
  const [days, setDays]   = useState([]);
  const [saving, setSaving] = useState(false);

  function toggleDay(d) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const { id } = await api.createPlan({ name: name.trim(), days });
    onCreated(id);
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
  const box     = { background: 'var(--surface2)', borderRadius: '12px', padding: '1.5rem', width: '90%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '1rem' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <h3 style={{ margin: 0, color: 'var(--text)' }}>New workout plan</h3>

        <input
          autoFocus
          placeholder="Plan name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text)', fontSize: '1rem' }}
        />

        <div>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>Workout days</p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {DAY_LABELS.map((label, i) => (
              <button key={i} onClick={() => toggleDay(i)}
                style={{ padding: '0.35rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: days.includes(i) ? 'var(--btn)' : 'var(--surface)', color: days.includes(i) ? 'var(--btn-text)' : 'var(--muted)', fontSize: '0.85rem', fontWeight: days.includes(i) ? '600' : 'normal' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '0.5rem 1rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'none', color: 'var(--muted)' }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving || !name.trim()}
            style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '6px', background: 'var(--btn)', color: 'var(--btn-text)', fontWeight: '600', opacity: !name.trim() ? 0.4 : 1 }}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloneModal({ plan, onCloned, onClose }) {
  const [calendar, setCalendar] = useState(null);
  const [seedWeek, setSeedWeek] = useState(null);
  const [cloning, setCloning]   = useState(false);

  useEffect(() => { api.getPlanCalendar(plan.id).then(setCalendar); }, [plan.id]);

  const completedWeeks = calendar
    ? calendar.weeks.filter(w => w.days.some(d => (d.session?.exercise_count ?? 0) > 0))
    : [];

  async function handleClone() {
    setCloning(true);
    const body = seedWeek != null ? { seed_week: seedWeek } : undefined;
    const { id: newId } = await api.clonePlan(plan.id, body);
    onCloned(newId);
  }

  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'1rem' };
  const box     = { background:'var(--surface2)', borderRadius:'12px', padding:'1.5rem', width:'100%', maxWidth:'420px', display:'flex', flexDirection:'column', gap:'1rem' };
  const optBtn  = (active) => ({ width:'100%', padding:'0.55rem 0.85rem', textAlign:'left', border:`1px solid ${active ? 'var(--btn)' : 'var(--border)'}`, borderRadius:'8px', background: active ? 'var(--btn)' : 'var(--surface)', color: active ? 'var(--btn-text)' : 'var(--muted)', fontSize:'0.875rem', fontWeight: active ? '600' : 'normal', cursor:'pointer' });

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <h3 style={{ margin:0, color:'var(--text)', fontSize:'1rem', fontWeight:'700' }}>Clone "{plan.name}"</h3>

        <div>
          <p style={{ margin:'0 0 0.5rem', fontSize:'0.8rem', color:'var(--muted)' }}>Pick up weights from</p>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
            <button onClick={() => setSeedWeek(null)} style={optBtn(seedWeek === null)}>
              Original starting weights
            </button>
            {!calendar && <p style={{ margin:0, fontSize:'0.8rem', color:'var(--dim)' }}>Loading weeks…</p>}
            {completedWeeks.map(w => (
              <button key={w.week_num} onClick={() => setSeedWeek(w.week_num)} style={optBtn(seedWeek === w.week_num)}>
                Week {w.week_num}{w.start_date && w.end_date ? <span style={{ opacity:0.65, fontWeight:'normal' }}> · {fmtShort(w.start_date)} – {fmtShort(w.end_date)}</span> : ''}
              </button>
            ))}
            {calendar && completedWeeks.length === 0 && (
              <p style={{ margin:0, fontSize:'0.8rem', color:'var(--dim)' }}>No completed weeks to seed from.</p>
            )}
          </div>
        </div>

        <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'0.5rem 1rem', border:'1px solid var(--border)', borderRadius:'6px', background:'none', color:'var(--muted)' }}>
            Cancel
          </button>
          <button onClick={handleClone} disabled={cloning}
            style={{ padding:'0.5rem 1.25rem', border:'none', borderRadius:'6px', background:'var(--btn)', color:'var(--btn-text)', fontWeight:'600' }}>
            {cloning ? 'Cloning…' : 'Clone'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ plan, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    try {
      await onConfirm();
    } catch (e) {
      setDeleting(false);
      alert(e.message);
    }
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' };
  const box     = { background: 'var(--surface2)', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '1rem' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <h3 style={{ margin: 0, color: 'var(--text)' }}>Delete plan?</h3>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
          "<strong style={{ color: 'var(--text)' }}>{plan.name}</strong>" and all its targets will be permanently deleted.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={deleting}
            style={{ padding: '0.5rem 1rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'none', color: 'var(--muted)' }}>
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={deleting}
            style={{ padding: '0.5rem 1.25rem', border: 'none', borderRadius: '6px', background: 'var(--danger)', color: '#fff', fontWeight: '600', opacity: deleting ? 0.6 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, onActivate, onClone, onDelete, onClick }) {
  const [busy, setBusy] = useState(false);

  async function wrap(fn) {
    setBusy(true);
    try { await fn(); } catch (e) { alert(e.message); }
    setBusy(false);
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1rem', cursor: 'pointer' }} onClick={onClick}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <span style={{ fontWeight: '600', fontSize: '1rem', color: 'var(--text)' }}>{plan.name}</span>
          {plan.is_active === 1 && (
            <span style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--success)', border: '1px solid var(--success)', borderRadius: '4px', padding: '0.1rem 0.4rem' }}>
              Active
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: plan.total_days > 0 ? '0.65rem' : 0 }}>
          {plan.days.length > 0
            ? plan.days.map(d => (
                <span key={d} style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'var(--surface2)', borderRadius: '4px', padding: '0.15rem 0.45rem' }}>
                  {DAY_LABELS[d]}
                </span>
              ))
            : <span style={{ fontSize: '0.8rem', color: 'var(--dim)' }}>No days configured</span>
          }
        </div>
        {plan.total_days > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ flex: 1, height: '3px', borderRadius: '2px', background: 'var(--border)' }}>
              <div style={{
                height: '100%', borderRadius: '2px',
                background: plan.completed_days >= plan.total_days ? 'var(--success)' : 'var(--btn)',
                width: `${Math.min(100, Math.round((plan.completed_days / plan.total_days) * 100))}%`,
                minWidth: plan.completed_days > 0 ? '3px' : '0',
              }} />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--dim)', whiteSpace: 'nowrap' }}>
              {plan.completed_days}/{plan.total_days}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
        {plan.is_active !== 1 && (
          <button onClick={() => wrap(onActivate)} disabled={busy}
            style={{ flex: 1, padding: '0.55rem', background: 'none', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--success)', fontSize: '0.85rem', fontWeight: '500' }}>
            Activate
          </button>
        )}
        <button onClick={onClick}
          style={{ flex: 1, padding: '0.55rem', background: 'none', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.85rem' }}>
          Edit
        </button>
        <button onClick={() => wrap(onClone)} disabled={busy}
          style={{ flex: 1, padding: '0.55rem', background: 'none', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.85rem' }}>
          Clone
        </button>
        <button onClick={onDelete} disabled={busy}
          style={{ flex: 1, padding: '0.55rem', background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.85rem' }}>
          Delete
        </button>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [cloneTarget, setCloneTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const navigate              = useNavigate();

  async function load() {
    const data = await api.getPlans();
    setPlans(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleActivate(id) {
    await api.activatePlan(id);
    setPlans(ps => ps.map(p => ({ ...p, is_active: p.id === id ? 1 : 0 })));
  }

  function handleCloneRequest(plan) {
    setCloneTarget(plan);
  }

  async function handleDelete(id) {
    await api.deletePlan(id);
    setPlans(ps => ps.filter(p => p.id !== id));
    setDeleteTarget(null);
  }

  if (loading) return <p style={{ color: 'var(--muted)' }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, color: 'var(--text)' }}>Workout Plans</h2>
        <button onClick={() => setModal(true)}
          style={{ padding: '0.4rem 0.9rem', background: 'var(--btn)', color: 'var(--btn-text)', border: 'none', borderRadius: '6px', fontWeight: '600' }}>
          + New
        </button>
      </div>

      {plans.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No plans yet. Create your first one.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onClick={() => navigate(`/schedule/${plan.id}`)}
              onActivate={() => handleActivate(plan.id)}
              onClone={() => handleCloneRequest(plan)}
              onDelete={() => setDeleteTarget(plan)}
            />
          ))}
        </div>
      )}

      {modal && (
        <NewPlanModal
          onCreated={id => { setModal(false); navigate(`/schedule/${id}`); }}
          onClose={() => setModal(false)}
        />
      )}

      {cloneTarget && (
        <CloneModal
          plan={cloneTarget}
          onCloned={newId => { setCloneTarget(null); navigate(`/schedule/${newId}`); }}
          onClose={() => setCloneTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          plan={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
