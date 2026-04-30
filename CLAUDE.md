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
shared/algorithm.js          # progressive overload logic — edit here for algorithm changes
server/
  db.js                      # schema + column migrations (run directly to re-migrate)
  seed.js                    # exercise library seed data (~55 exercises)
  index.js                   # Express entry point + route mounting
  middleware/auth.js          # JWT cookie middleware
  routes/
    auth.js                  # register, login, logout, /me
    exercises.js             # exercise CRUD + equipment filter
    schedule.js              # legacy schedule slots (mostly superseded by plans)
    plans.js                 # workout plans CRUD, plan days, plan schedule, calendar
    sessions.js              # session creation, set logging, check-in, unlock, history
    stats.js                 # aggregate stats + data reset
    settings.js              # per-muscle-group training preferences
    admin.js                 # in-app git pull + rebuild update endpoint
client/src/
  api/index.js               # all fetch wrappers — add new endpoints here first
  App.jsx                    # shell, nav, auth gate, routing
  auth.jsx                   # AuthProvider + useAuth hook
  units.js                   # kg/lbs unit context
  pages/
    TodayPage.jsx            # main workout logging screen (~1300 lines)
    PlansPage.jsx            # plan list
    PlanDetailPage.jsx       # plan schedule editor + calendar
    SchedulePage.jsx         # exercise search + add-to-plan UI
    StatsPage.jsx            # volume charts, stat cards, data reset
    ProfilePage.jsx          # profile + unit toggle
    AuthPage.jsx             # register / login (redirects new users to /setup)
    stubs.jsx                # SetupPage (equipment + training prefs) + in-app updater
```

## Database schema (key tables)

- `users` — accounts with hashed passwords + JWT secret in `config`
- `workout_plans` — named plans per user; `is_active` (one active at a time), `week_count`, `started_at`
- `plan_days` — which days of week (0=Mon…6=Sun) belong to a plan
- `schedule` — exercises per plan per day; `set_count`, `position` for ordering
- `set_targets` — target weight + reps per exercise per set; `valid_from` date + `plan_id`; always query most recent row `WHERE valid_from <= date('now')`
- `sessions` — identified by `(plan_id, week_num, session_dow, user_id)` UNIQUE; `checked_in`, `unlocked` flags
- `logged_sets` — actual logged weight/reps per set; `skipped` flag; `reps_done` NULL when skipped
- `session_checkins` — per muscle group feedback (pain, recovery, pump, intensity, pause_weight) per session
- `muscle_group_settings` — per-user rep_range + aggressiveness per muscle group

## Important conventions

- `day_of_week` is **0=Monday … 6=Sunday** throughout (not JS convention where 0=Sunday)
- After check-in, algorithm writes new `set_targets` rows with `valid_from = date('now', '+1 day')`
- `set_targets` is append-only — never update, always insert new row
- Sessions are position-based (week_num, session_dow), not date-based
- `slotDone(s)` — the key predicate used in both `sessions.js` and `plans.js`: `s && !s.unlocked && (s.checked_in === 1 || (s.expected_sets > 0 && s.done_sets >= s.expected_sets))`. **Both files must use identical logic** or the current-slot calculation diverges.

## Algorithm (shared/algorithm.js)

`nextExerciseTargets(setData, modifier, options)` — takes all sets for one exercise, returns next targets.

- **modifier**: computed by `computeCheckinModifier` from pain/recovery/pump/intensity ratings (-3 to +3, or `null` for high pain = hold everything)
- **Heaviest active set** drives the weight-bump decision
- **Worst-performing set** drives the hold decision
- Weight changes applied **proportionally** to all sets (preserves pyramid/drop structure)
- Weight rounded to nearest 0.5 kg; capped at 10% of working weight per jump
- `repRange` setting (powerlifting 5–8, standard 8–12, volume 12–15) controls ceiling/floor
- `aggressiveness` multiplier (0.5/1.0/1.5) scales positive modifier signals only
- `pauseWeight` flag blocks weight increases (only reps progress)
- Bodyweight exercises: reps-only axis, same logic but no weight changes

## Session lifecycle

1. User navigates to a slot (week_num, session_dow) via TodayPage calendar
2. Slot endpoint (`GET /sessions/slot`) finds or creates the session; returns `is_current` + `is_locked`
3. User logs sets via SetRow components → `POST /sessions/:id/sets` (upserts)
4. When all sets for a muscle group are logged, check-in modal fires automatically
5. Check-in (`POST /sessions/:id/checkin`) runs algorithm, writes new set_targets, marks `checked_in=1`
6. When all muscle groups are checked in, session is done; TodayPage reloads slot to get fresh `is_current`
7. **Unlock**: completed sessions can be unlocked (`POST /sessions/:id/unlock`) — deletes checkins + next-day targets, sets `unlocked=1`. The session re-becomes "current" (`slotDone` returns false). After re-logging + re-checking-in, checkin endpoint sets `checked_in=1, unlocked=0`.

## Known subtleties

- `allDone` in TodayPage has three paths: `checked_in===1`, all groups in `checkedInGroups`, OR (read-only session with `done_sets >= expected_sets`). The third path is needed for sessions completed without explicit check-in.
- `handleFinishWorkout` clears `dismissedGroups` when all sets are already logged but no check-in — this re-triggers the auto-checkin effect (needed after unlock).
- `preDismissed` suppresses check-in modals when navigating to past sessions; built from `initDone` at slot load time.
- In-app update (`POST /admin/update`) runs `git pull && npm install && npm run build` then `process.exit(1)` to trigger systemd restart.
