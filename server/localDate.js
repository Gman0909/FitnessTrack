// "Today" in the user's own timezone.
//
// The server clock is UTC-based (toISOString / SQLite date('now')), so a
// morning workout east of UTC (or an evening one west of it) would be stamped
// with the wrong calendar day. The client sends its local date as the
// X-Local-Date header; it is accepted only within ±1 day of the UTC date (the
// full range of real timezone offsets), so a bad header can't move dates far.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const utcToday = () => new Date().toISOString().slice(0, 10);

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function resolveToday(header, utc = utcToday()) {
  if (typeof header === 'string' && DATE_RE.test(header) &&
      (header === utc || header === addDays(utc, -1) || header === addDays(utc, 1)))
    return header;
  return utc;
}

// Express middleware: sets req.today (YYYY-MM-DD).
export function localDate(req, _res, next) {
  req.today = resolveToday(req.get('X-Local-Date'));
  next();
}
