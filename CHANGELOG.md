# Changelog

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
