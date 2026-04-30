# Changelog

## [1.0.9] - 2026-04-30

### Changed
- **Exercise-level algorithm** — progression is now decided across the full set cluster rather than independently per set. The heaviest active set drives the weight-bump trigger; the worst-performing set drives the hold/reps decision. Changes are applied proportionally to all sets, preserving pyramid and drop-set structures. Weights rounded to nearest 0.5 kg.
- **`weight_used` as base** — the algorithm now uses the weight the user actually loaded (not the previous target) as the starting point for the next session's recommendation. If a user deviated from the target, that deviation carries forward.
- **Volume display** — the per-set progression hint is replaced with a single exercise-level volume indicator at the bottom of each card: `▲ 2475 kg·reps (+3%)` or `▼` in red for a reduction. Computed as `Σ(weight × reps)` across all sets, current targets vs previous.

## [1.0.8] - 2026-04-30

### Added
- **Per-muscle-group training preferences** in the Setup page — each muscle group now has two independent settings:
  - **Rep range**: 5–8 (powerlifting) / 8–12 (standard, default) / 12–15 (volume) — controls when weight progression triggers and the deload reset floor
  - **Speed**: Slow / Normal / Fast — scales how strongly positive check-in signals (too easy, never sore, good pump) amplify progression; negative signals (pain, too much, still sore) always apply at full strength
- `muscle_group_settings` DB table (auto-migrated); defaults to standard / moderate for all muscle groups

### Changed
- Rep range and aggressiveness are now orthogonal settings — low reps no longer implies fast progression or vice versa
- Algorithm previously used a single `aggressiveness` enum that conflated rep range with progression speed; these are now separate dimensions

## [1.0.7] - 2026-04-30

### Added
- **Intensity check-in row** — "Too easy / Just right / Too much" replaces guesswork about load; feeds directly into the next-session modifier (+2 / 0 / –2).
- **"Pause weight increases" checkbox** in the check-in modal — locks the weight for that muscle group's sets while still allowing rep/set adjustments.
- **Percentage-aware weight increments** — the effective increment is now capped at 10% of working weight (floor 1.25 kg), so light isolation exercises no longer jump by unrealistic amounts.
- **Pain as a safety gate** — high pain now holds all targets unchanged (no progression at all); medium pain blocks weight increases while still allowing rep adjustments.
- **Deload trigger** — a combined modifier of ≤ –3 (e.g. too_much + still_sore + low pain) drops weight 10% and resets to the bottom of the rep range instead of just holding.
- **Per-call aggressiveness tier** — `nextSetTarget` now accepts `aggressiveness: 'conservative' | 'moderate' | 'aggressive'`, changing the rep range (10–15 / 6–12 / 5–8) and therefore when weight progression triggers.

### Changed
- **Recovery buttons reordered** — now: Never sore → Still sore → Healed (removed "Just in time").
- **Recovery scoring updated** — "Healed" now scores 0 (was +1); "Never sore" stays +1. Healed is expected recovery; never sore signals under-stimulation.

## [1.0.6] - 2026-04-30

### Fixed
- In-app update no longer hangs on "pulling and rebuilding" after a successful build. The polling loop now handles `state=idle` (server restarted with fresh in-memory state) as a completion signal, and `waitForRestart` no longer requires a version change — it just waits for the server to respond, so updating when already on the latest version works correctly.

## [1.0.5] - 2026-04-30

### Fixed
- In-app update: run `git config --global --add safe.directory <path>` before `git pull` — git ignores `safe.directory` passed via `-c` and only reads it from global/system config

## [1.0.4] - 2026-04-30

### Fixed
- In-app update: pass `-c safe.directory=<path>` to `git pull` so it succeeds when the server process runs as a different user than the repo owner (common on Pi systemd installs)

## [1.0.3] - 2026-04-30

### Fixed
- In-app update now uses the absolute path to `npm` (derived from the running node binary) so it works correctly when started via systemd, which has a minimal PATH that may not include `npm`
- Update UI now polls a `/api/admin/update-status` endpoint during the build phase instead of blindly checking if the server is alive — errors from `git pull` or `npm run build` are shown directly in the UI rather than silently dropped
- "Update complete" message now shows the new version number; error state shows the actual build output and a Dismiss button

## [1.0.2] - 2026-04-30

### Fixed
- In-app update button now correctly restarts the server after rebuilding (`process.exit(0)` → `process.exit(1)` so systemd's `Restart=on-failure` fires)
- Update progress UI now waits for the server to go down and come back with a changed version before declaring success, preventing false "done" on the still-running old process

## [1.0.1] - 2026-04-30

### Added
- **Plan progress bar** — workout plan cards now show a minimalist progress bar with a completed/total day count, giving an at-a-glance view of how far through a plan you are.

### Changed
- **Position-based session model** — sessions are now identified by `(week_num, session_dow)` position within a plan rather than by calendar date. Dates are recorded only when a session is first opened. This allows plans to be paused and resumed without date drift.
- **Sequential workout locking** — a session can only be started once the previous one is workout-complete (every exercise logged or skipped). Future sessions are visible in read-only mode.
- **Workout completion logic** — a session is considered complete for unlocking purposes as soon as every exercise is either logged or skipped, without requiring a check-in.
- **Clone flow** — cloning a plan copies structure and starting weights only; no sessions or logged data carry over. The seed-week picker lets you pick up weights from any completed week of the source plan so progress is not lost between cycles.

### Fixed
- **Calendar session status colours** — sessions where every exercise was skipped now appear orange (partial) rather than green. Sessions where every exercise has real logged data are green; fully-skipped sessions show a red ✗.
- **`is_past` / `is_today` calendar fields removed** — the clone modal week-picker now uses actual session data to detect completed weeks instead of the stale date-based flags.

## [1.0.0] - 2026-04-28

- Initial release.
