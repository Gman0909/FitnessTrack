# Changelog

## [1.1.10] - 2026-05-02

### Changed
- **Top nav mobile usability.** The top-of-app strip (brand, nav tabs, user dropdown) had sub-44px tap targets, especially the user trigger. Workout / Plans / Stats links are now 44px tall, the user dropdown trigger is 44px, dropdown menu items are 48px, the dropdown is wider (140→180px), and the brand strip + barbell mark are slightly larger. No font, color, or border-radius changes.

---

## [1.1.9] - 2026-05-02

Mobile usability pass across every page. Same dark theme, same rounded-corner aesthetic — just bigger taps, less wrapping, and proper vertical rhythm in modals.

### Changed
- **Check-in modal** is now a bottom sheet. Each field's label stacks above its options instead of fighting them for horizontal room — `Never sore` / `Still sore` / `Healed` no longer wrap. All option buttons 46px+ tall. `Pause weight increases` checkbox on its own row. Submit button is now full-width 48px (used to wrap to two lines).
- **Add Exercise modal**: bigger close ✕ (40×40), exercise list rows 52px+ with overflow-elided name and color-coded muscle tag, sets buttons in a 5-col grid at 46px, reps in 4-col at 46px, wider 120px starting-weight input, 48px full-width Add button. Custom-exercise creation chips also bigger.
- **Plan day-card slot rows** went from 36px to 52px with the exercise name on its own line, sub-row containing colored muscle tag + set/weight info, and a dedicated 40×40 delete ✕ tap area. `+ Add` 28→36px. Workout-day toggle (Mon/Tue/Wed…) is now a 7-col grid of 44px chips instead of variable-width chips that wrapped to a second row.
- **Plans list**: `+ New` 28→40px. Per-card action row (Edit / Clone / Delete / Activate) 32→46px. All Cancel/Create/Clone/Delete modal buttons full-width 48px. Clone modal week options 52px tall. New-plan day picker is a 7-col 44px grid.
- **Stats page**: `All time` / `This plan` and `Volume` / `Max weight` toggles 24→38px. Exercise selector 30→46px with 16px font. Export rows show description with proper line-height; the `Download CSV` button shrank to a tidy 40px `CSV` chip. `Reset training data…` 28→44px. Reset modal: 48px buttons, 46px input, larger close ✕.
- **Auth page**: tab buttons 36→48px, submit 38→48px, fields 32→46px with 16px font. Glyph picker: 8 cramped columns of 32px buttons → 6 columns of square aspect-ratio buttons at 44px+.
- **Profile page**: same field/glyph/save treatment as Auth.
- **Setup page**: equipment toggle rows 36→52px with bigger checkboxes. `kg`/`lbs` 32→44px. Training preferences row, the worst offender (label + 3 + 3 squashed buttons all ~24px on one line), restructured into per-muscle-group cards with `REP RANGE` and `PROGRESSION` as separate labelled rows of 3-col 40px buttons. Custom-exercise rows 36→52px with stacked name+meta, color-coded muscle tag, dedicated 40×40 ✕ delete area, bigger Edit chip. Update / Reload / Dismiss buttons all 40+px. Edit-exercise modal restyled to match the new chip standards.
- **Today page**: skip-session and finish-confirm modal buttons full-width 48px. Day-picker plan-length `+`/`−` controls 26→36px square.

---

## [1.1.8] - 2026-05-01

Major robustness pass on the workout-session lifecycle. Per-set state is now lifted into a single parent-managed Map (`setStatuses`) instead of being scattered across SetRow's local state, the `liveValues` ref, `doneSet`, and `initials`. SetRow is now a controlled component. Multiple stale-state-after-reload bugs are gone as a result.

### Fixed
- **Finish Workout silently bypassing the algorithm.** `slotDone` previously considered a session done if `done_sets >= expected_sets`, even with `checked_in = 0`. After Finish-Workout-into-skip, the slot rolled over without check-ins ever firing — the algorithm never ran and `set_targets` were never written. `slotDone` now requires `checked_in === 1` (in both `routes/sessions.js` and `routes/plans.js`).
- **Finish Workout not firing check-in modals on the resulting reload.** `handleConfirmFinish` now clears `dismissedGroups` before the slot reload so the auto-checkin effect picks up immediately.
- **Mixed groups (some logged, some skipped) not consistently triggering check-ins.** The previous `groupHasLoggedSets` predicate read from `liveValues`, a ref that was empty after every reload (SetRow's `onValuesChange` effect didn't re-fire). It now reads from server-truth via `setStatuses`.
- **`onCheckin` reload trigger waiting on every group.** It now waits only on groups that actually need a check-in (i.e., have at least one logged set). All-skipped groups don't block lock-in.
- **Unlock spamming every check-in modal immediately.** `loadSlot` now pre-dismisses done groups when `sess.unlocked === 1`. Modals only fire after the user actively engages with a set.
- **Re-engagement after unlock not opening modals.** `handleLog` and `handleClear` now call `markGroupActive` to remove the affected group from `dismissedGroups`, so re-completing the group fires the modal.
- **Unlock → untick → Finish requiring two Finish presses to lock.** `handleConfirmFinish` now sets a one-shot `skipPreDismissOnceRef` flag so the post-Finish reload does not re-apply the unlocked-session pre-dismiss. Single Finish press now drives the full check-in flow.
- **Logged weight not restored on reload.** Previously SetRow showed the *target* weight after reload even for logged sets. `loadSlot` now overlays the per-set `weight_used` from `logged_sets` into `setStatuses`.
- **Editing one set in a checked-in group unticking the rest.** `onResetCheckin` no longer resets every set in the group — it only deletes the server-side check-in row + clears the group's local check-in flag. Other sets in the group stay logged.

### Changed
- **`SetRow` is now a controlled component.** Its `status` / `weight` / `reps` come from props; it has no local state, no refs, no internal effects. All mutations flow through parent callbacks (`onClickTick`, `onClickUndo`, `onWeightChange`, `onRepsChange`).
- **Internal: `doneSet`, `liveValues`, `exerciseResetCounters`, and the `initials` map are removed** in favour of a single `setStatuses: Map<string, { status, weight, reps }>` in the parent. `groupIsDone` and `groupHasLoggedSets` derive from it.
- **`preDismissed` only runs on past slots or unlocked sessions** (not on the current slot in normal flow).

---

## [1.1.7] - 2026-05-01

### Fixed
- **Check-in modal firing for muscle groups whose sets are all skipped.** Finishing a workout (or manually skipping every set in a group) used to trigger the pain / recovery / pump / intensity modal for that group, even though there was nothing to give feedback on. The modal now only fires for groups with at least one real logged set, and the server's "session fully checked in" condition is correspondingly relaxed to ignore all-skipped groups, so sessions are still marked done after only the trained groups have been checked in.

---

## [1.1.6] - 2026-05-01

### Changed
- **Weekly Volume chart now labels bars with the full week range** (`Apr 27–May 3` instead of `Apr 27`). The bar always was the Monday-anchored week, but the bare Monday date was easy to misread as "the workout was on April 27" when the workout was really on Friday May 1 in the same week.

### Fixed
- **Check-in / unlock date mismatch.** Check-in wrote `set_targets.valid_from = today + 1`, while unlock's cleanup deleted `WHERE valid_from = session.date + 1`. If the session's date had drifted from "today" (possible before 1.1.5), unlock would silently fail to remove the next-day targets and the user would see stale numbers. Both paths now anchor on `session.date + 1 day`, so they always match.

---

## [1.1.5] - 2026-05-01

### Fixed
- **Sets logged today appearing under an old date in Stats.** A session's `date` was stamped when the row was first created — i.e., when you first navigated to that slot — not when sets were actually logged. If you opened a slot on day X and didn't log into it until day Y, every set in that session showed under day X in Stats. The session's date is now stamped on the first real log into it (insert path only — editing an already-logged set won't shift the date).

---

## [1.1.4] - 2026-05-01

### Changed
- **In-app updater is now resilient to local file drift on the deployment box.** The updater previously ran `git pull`, which aborted when files like `client/package-lock.json` had been regenerated locally (typical when `npm install` rebuilds native deps such as `better-sqlite3` on ARM). It now runs `git fetch origin && git reset --hard origin/master`, force-syncing the working tree to remote `master` on every update.

---

## [1.1.3] - 2026-05-01

### Fixed
- **Untick / edit of logged sets not persisted** — clicking a logged set's tick to clear it, or editing its weight/reps after logging, only flipped the row to "idle" in the React state and never told the server. Reloading the page re-hydrated from `logged_sets` and the rows reappeared as logged. The client now calls a new `DELETE /api/sessions/:id/sets/:exercise_id/:set_num` endpoint when transitioning a set out of the logged or skipped state, and serializes any pending unlog before the next log/skip POST so a fast edit-then-retick can't race.

---

## [1.1.2] - 2026-05-01

### Fixed
- **Mobile auto-zoom on Add Exercise modal** — inputs and selects in the modal had no explicit `font-size`, so iOS Safari (and Firefox iOS / mobile browsers with the same heuristic) auto-zoomed the page when the search field gained focus. Inputs now render at 16px, suppressing the focus zoom.

### Added
- **Workout cell shortcuts** — clicking into a weight or reps cell now selects its existing contents so you can immediately overwrite. Pressing **Enter** with both fields filled (or just reps for bodyweight exercises) ticks the corresponding log box.

### Removed
- Unused `client/src/pages/SchedulePage.jsx` — superseded by `PlanDetailPage` and no longer routed.

---

## [1.1.1] - 2026-04-30

### Added
- **CSV export** in the Stats page — four downloads, all scoped to the current All time / This plan filter:
  - **Exercise history** — one row per exercise per session (sets done, max weight, total volume)
  - **Session summary** — one row per workout (exercises, sets, total volume)
  - **Personal bests** — highest weight ever logged per exercise with rep count and date
  - **Weekly volume** — sessions, sets, and total volume by calendar week

### Fixed
- Unmatched `/api/*` paths now return a `404` JSON error instead of falling through to the SPA catch-all. Previously, requests to missing API endpoints silently received `index.html` with a 200 status.

### Changed
- Default weight increment for dumbbell exercises reduced from 2 kg to 1 kg. Existing non-custom dumbbell exercises in the database are updated automatically on next server start.

---

## [1.1.0] - 2026-04-30

### Added
- **Unlock previous session** — the session immediately before the current slot can be unlocked for re-logging. Unlocking removes check-ins and the next-day targets written by those check-ins, so re-logging and re-checking-in produces a fresh set of targets.

### Fixed
- **Finish Workout after unlock** — when a session was unlocked and all sets were already pre-marked as logged, pressing Finish Workout did nothing. It now detects that check-ins are still pending and re-triggers the check-in flow.
- **Session locking after re-check-in** — after completing all check-ins on an unlocked session, the page now correctly transitions to read-only mode. Previously the `isCurrent` flag was stale and the session remained editable.

### Changed
- UI contrast raised to meet WCAG AA minimums: `--dim` lightened from `#777` to `#9a9a9a`; chest/triceps and legs muscle-group accent colours brightened; badge background opacity reduced to improve legibility.

---

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
