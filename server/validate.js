// Minimal request validation for write routes. Each check returns an error
// message string, or null when the value is acceptable.

export const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
export const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export const isText = (v, max = 100) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

export const LIMITS = {
  setNum:   [1, 20],   // set number within an exercise
  setCount: [1, 20],   // sets per exercise
  reps:     [0, 500],
  weightKg: [0, 2000],
  weeks:    [1, 52],
  dow:      [0, 6],
  repRange: [1, 100],
  increment:[0, 100],
};

// Returns the first error for fields present in `body`, per `rules`
// ({ field: (value) => boolean, ... }); undefined fields are skipped unless
// listed in `required`.
export function check(body, rules, required = []) {
  for (const f of required)
    if (body[f] === undefined || body[f] === null) return `${f} is required`;
  for (const [f, ok] of Object.entries(rules))
    if (body[f] !== undefined && !ok(body[f])) return `invalid ${f}`;
  return null;
}
