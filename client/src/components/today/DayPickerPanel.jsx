import { DAY_SHORT } from './helpers.js';

// ── Day picker panel ──────────────────────────────────────────────────────────

export function DayPickerPanel({ calendarData, selectedSlot, onSelect, weekCount, onDecreaseWeek, onIncreaseWeek }) {
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
