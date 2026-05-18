# FitnessTrack — Claude context

Progressive overload fitness tracker. Node.js + Express backend, SQLite via `better-sqlite3`, React 18 + Vite frontend. Single-user capable, multi-user ready.

## Stack

- **Backend**: Node.js, Express (port 3001)
- **Frontend**: React 18, Vite, react-router-dom (dev: port 5173, proxies `/api` → 3001)
- **Database**: SQLite — `fitness.db` in project root (configurable via `DATABASE_PATH` env)
- **Shared logic**: `shared/algorithm.js` — pure functions, no DB deps, imported by both server and client

## Key commands

```bash
# First-time setup
npm run install:all    # installs both server + client deps
npm run setup          # creates fitness.db + seeds exercise library

# Development (two terminals)
npm run dev            # API server on :3001
cd client && npm run dev   # Vite on :5173 with HMR

# Production
cd client && npm run build && cd ..
npm start              # serves API + built client on :3001
```

## Project structure

```
shared/
  algorithm.js               # double-progression logic — edit here for algorithm changes
  slotDone.js                # shared slot-completion predicate
server/
  db.js                      # schema + column migrations (run directly to re-migrate)
  seed.js                    # exercise library seed data (~75 exercises) + sample plan
  index.js                   # Express entry point + route mounting
  middleware/auth.js          # JWT cookie middleware
  routes/
    auth.js                  # register, login, logout, /me
    exercises.js             # exercise CRUD (incl. rep_min/rep_max) + equipment filter
    schedule.js              # schedule slots + GET /today (per-set targets for a day)
    plans.js                 # workout plans CRUD, plan days, plan schedule, calendar
    sessions.js              # session access, set logging (auto-runs progression), unlock, history
    stats.js                 # aggregate stats + data reset
    admin.js                 # in-app git pull + rebuild update endpoint
client/src/
  api/index.js               # all fetch wrappers — add new endpoints here first
  App.jsx                    # shell, nav, auth gate, routing
  auth.jsx                   # AuthProvider + useAuth hook
  units.js                   # kg/lbs unit context
  components/
    ExerciseEditModal.jsx    # shared editor: name, muscle group, equipment, increment, rep range, set count
  pages/
    TodayPage.jsx            # main workout logging screen (~1300 lines)
    PlansPage.jsx            # plan list
    PlanDetailPage.jsx       # plan schedule editor + calendar (per-row exercise edit)
    SchedulePage.jsx         # exercise search + add-to-plan UI
    StatsPage.jsx            # volume charts, stat cards, data reset
    ProfilePage.jsx          # profile + unit toggle
    AuthPage.jsx             # register / login (redirects new users to /setup)
    stubs.jsx                # SetupPage (equipment + custom exercises) + in-app updater
```

## Database schema (key tables)

- `users` — accounts with hashed passwords + JWT secret in `config`
- `exercises` — exercise library; `muscle_group`, `equipment`, `default_increment`, `rep_min`/`rep_max` (per-exercise rep range), `is_custom`
- `workout_plans` — named plans per user; `is_active` (one active at a time), `week_count`, `started_at`
- `plan_days` — which days of week (0=Mon…6=Sun) belong to a plan
- `schedule` — exercises per plan per day; `set_count` (a live mirror of the latest `set_counts` value), `position` for ordering
- `set_counts` — date-versioned set count per `(plan_id, day_of_week, exercise_id)`; append-only, `valid_from`. The effective count for a session is the latest row valid as of the session's date. A manual +/− set records `valid_from = today`; an algorithm-appended set records `valid_from = session.date + 1`. Resolve via `effectiveSetCount()` in `server/setCounts.js` — never read `schedule.set_count` directly for a session
- `set_targets` — target weight + reps per exercise per set; `valid_from` date + `plan_id`; the algorithm writes a new row per completed exercise. `is_suggestion` is a legacy flag (no longer written)
- `sessions` — identified by `(plan_id, week_num, session_dow, user_id)` UNIQUE; `checked_in` (= "complete"), `unlocked` flags
- `logged_sets` — actual logged weight/reps per set; `skipped` flag; `reps_done` NULL when skipped

## Important conventions

- `day_of_week` is **0=Monday … 6=Sunday** throughout (not JS convention where 0=Sunday)
- Logging a set re-runs progression for that exercise: the server writes the next-session `set_targets` rows with `valid_from = session.date + 1 day`
- `set_targets` and `set_counts` are append-only — never update, always insert a new row
- Set-count changes propagate forward only: a completed session always resolves to the count it had, never one added later
- Sessions are position-based (week_num, session_dow), not date-based
- `slotDone(s)` — the key predicate used in `sessions.js` and `plans.js`: `s && !s.unlocked && (s.checked_in === 1 || (s.expected_sets > 0 && s.done_sets >= s.expected_sets))`. **All callers must use identical logic** or the current-slot calculation diverges.

## Algorithm (shared/algorithm.js)

**Dynamic double progression** — purely performance-based, no subjective check-ins.

`nextExerciseTargets(setData, { repMin, repMax, increment, equipment })` — takes all sets for one exercise, returns next per-set targets.

Each set is its own progression track, comparing the user's actual logged reps to the target they were given:

| Condition | Next target |
|-----------|-------------|
| `actual ≥ repMax` | weight + increment, reps → `repMin` |
| `target ≤ actual < repMax` | reps → `min(repMax, actual + 1)`, weight unchanged |
| `repMin ≤ actual < target` | hold (same weight + target reps) |
| `actual < repMin` | weight − increment, reps → `repMin` |
| skipped / unlogged | unchanged |

- Per-set independence gives the "dynamic" pattern — the freshest set climbs and bumps weight first.
- `increment` is the exercise's `default_increment`, capped at 10% of working weight; weights round to 0.5 kg.
- Rep range `[repMin, repMax]` is per exercise (`exercises.rep_min/rep_max`).
- **Bodyweight**: reps-only axis; reps climb toward `repMax` and hold there. When every set reaches `repMax`, `recomputeExercise` adds a set (cap 6).
- `setPerformance(targetReps, actualReps)` → `'up' | 'met' | 'down'` for the UI's per-set glyph.
- **Weight-deviation re-targeting** — `weightAdjustedTarget(target, actualWeight, {repMin,repMax})`. When the logged/entered weight differs from the target's, the rep target is re-scaled to roughly preserve volume (`round(targetReps × targetWeight / actualWeight)`, clamped to the rep range). Within a ±15% band (`WEIGHT_BAND`) this adjusted target drives the hold-vs-climb decision and the UI glyph; beyond it `{inBand:false}` — the client shows `?` and suppresses the glyph, and progression climbs target-free from the logged performance. The client (`TodayPage` `SetRow`) re-evaluates on weight-cell blur.

## Session lifecycle

1. User navigates to a slot (week_num, session_dow) via the TodayPage calendar.
2. Slot endpoint (`GET /sessions/slot`) finds or creates the session; returns `is_current` + `is_locked`.
3. User logs sets via SetRow components → `POST /sessions/:id/sets` (upserts). `DELETE` un-logs.
4. **On every set change** the server runs `recomputeExercise`: when an exercise's sets are all logged/skipped it writes the next session's `set_targets`; when no longer complete it deletes them. `updateCompletion` sets `checked_in` when the whole day's schedule is logged/skipped. No modal, no check-in.
5. The client derives `allDone` from set statuses; a completion effect refreshes the calendar and may surface the end-of-plan modal.
6. **Unlock**: a completed session can be unlocked (`POST /sessions/:id/unlock`) — deletes the next-day targets, sets `unlocked=1, checked_in=0`. It re-becomes "current". Re-logging re-runs progression.

## Known subtleties

- `recomputeExercise` and `updateCompletion` run inside the `POST/DELETE /sessions/:id/sets` transaction — set logging and target recomputation commit atomically.
- The progressive-overload hint (target vs last logged performance) shows only on *in-progress* exercise cards; per-set ▲/=/▼ glyphs show actual vs target on logged sets.
- New exercises start with an empty weight and reps at `rep_min` — there is no starting-weight prompt; the algorithm bootstraps from the first logged session.
- Old `is_suggestion` rows in `set_targets` are still sorted (`ORDER BY is_suggestion ASC`) but nothing writes them anymore.
- In-app update (`POST /admin/update`) runs `git pull && npm install && npm run build` then `process.exit(1)` to trigger a systemd restart.
