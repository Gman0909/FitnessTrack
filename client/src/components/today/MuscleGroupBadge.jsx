import { mcColor } from './helpers.js';

// ── Muscle group badge ─────────────────────────────────────────────────────────

export function MuscleGroupBadge({ muscleGroup }) {
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
