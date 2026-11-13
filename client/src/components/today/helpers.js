export const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function fmtShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

export const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const DAY_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const MC_COLORS = {
  chest: '#f07098', back: '#3cc9b0', shoulders: '#f0a030',
  biceps: '#3cc9b0', triceps: '#f07098', legs: '#b088e8', core: '#4caf50',
};

export function mcColor(mg) { return MC_COLORS[mg] ?? '#777'; }

export function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
