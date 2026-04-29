# Fitness Tracker

Progressive overload fitness tracker. Node.js + Express backend, SQLite database, React + Vite frontend.

## Stack

- **Backend**: Node.js, Express, better-sqlite3 (runs on port 3001)
- **Frontend**: React 18, Vite, react-router-dom (runs on port 5173, proxies /api to 3001)
- **Database**: SQLite via `fitness.db` in the project root
- **Shared logic**: `shared/algorithm.js` — pure functions, no DB deps, used by both server and client

## Key commands

```bash
# First-time setup
npm install && cd client && npm install && cd ..
npm run setup          # creates fitness.db + seeds 55 exercises

# Development (two terminals)
npm run dev            # API server on :3001
cd client && npm run dev   # React on :5173

# Production
cd client && npm run build && cd ..
npm start              # serves API + built client on :3001
```

## Project structure

```
shared/algorithm.js          # progressive overload logic — edit this for algorithm changes
server/
  db.js                      # schema + SQLite connection (run directly to re-migrate)
  seed.js                    # exercise library seed data
  index.js                   # Express entry point
  routes/
    exercises.js             # GET/POST exercises, equipment filtering
    schedule.js              # weekly schedule slots + set_targets
    sessions.js              # workout logging + check-in → triggers algorithm
client/src/
  api/index.js               # all fetch wrappers — add new endpoints here first
  pages/TodayPage.jsx        # main logging screen (fully implemented)
  pages/SchedulePage.jsx      # stub — needs building
  pages/stubs.jsx            # History + Setup stubs
```

## Algorithm rules (shared/algorithm.js)

Per set, independently:
- `skipped = true` → frozen, return existing target unchanged
- `reps_done >= 12` → increase weight by one increment; recalculate minimum reps to beat previous volume
- `reps_done < target.reps - 1` → hold target (don't regress below target)
- otherwise → reps + 1 at same weight

Check-in modifier (-3 to +3) applied after base:
- pain: none=0, low=-1, medium=-2, high=-3
- recovery: still_sore=-1, just_in_time=0, healed=+1, never_sore=+1
- pump: poor=+1 (understimulated), ok=0, great=0 (optimal, hold)

Modifier shifts reps within 6–12, or bumps weight if already at ceiling.

## Database notes

- `set_targets` uses `valid_from` date — always query with `MAX(valid_from)` to get current targets
- `logged_sets.reps_done` is NULL for skipped sets; check `skipped` flag too
- `day_of_week` is 0=Monday … 6=Sunday (not JS convention where 0=Sunday)
- After check-in, algorithm writes new `set_targets` rows dated `date('now', '+1 day')`

## What still needs building

- `SchedulePage.jsx` — schedule builder UI (add exercises to days, set starting weights)
- `SetupPage` in stubs.jsx — equipment selection onboarding
- `HistoryPage` in stubs.jsx — volume charts per exercise over time
- Exercise search/filter UI using `?user_equipment=true` query param
- Weight unit toggle (kg ↔ lbs) — store preference, convert at display layer only
