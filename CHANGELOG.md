# Changelog

All notable changes to the Mustry Solutions Perspective Components module.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow
semver. **Pre-1.0, the prop schemas may still change** — the CI schema guard
(`ops/schema-guard.sh`) flags any removed/renamed key so breakage is always a
deliberate decision, never an accident.

## [0.1.0] — 2026-07-05

First versioned cut: three components, feature-complete for their v1 scope.

### Date/Time Range Picker (`mustrysolutions.input.datetimerangepicker`)
- Range selection with hover preview; `compact` / `oneMonth` / `twoMonths` /
  size-driven `auto` layouts; inline or popover display.
- Granularity day/hour/minute/second; selectable-range constraints
  (past/future, date bounds, min/max span) with explanatory tooltips.
- Rolling + calendar presets; opt-in **realtime mode** (a rolling preset arms
  a live window re-derived from "now" every `refreshSeconds`).
- Timezone/locale aware; built-in UI text in en/fr/de/es/nl/it/pt with per-key
  `config.labels` overrides; CSS-variable theming (`--dtrp-*`).

### Calendar / Scheduler (`mustrysolutions.display.calendar`)
- Month / Week / Day / List views; overlap packing; auto-fit month cells with
  "+N more" day popover; multi-day spanning bars; background bands; statuses.
- Editing: drag-move / edge-resize / drag-to-create (week/day), month-view
  day-to-day drag; built-in editor with validation (end-after-start blocks
  Save) and complete payloads (untouched fields carried through).
- Recurrence (`rrule` daily/weekly/monthly/yearly + interval/count/until/
  byweekday/exdate), expanded per visible window; editor creates/edits rules;
  occurrence edits detach (override + exdate) or target the whole series;
  one `onChange` contract with `scope`/`seriesId`/`occurrenceDate`.
- Windowed data binding (`output.visibleStart/End` + always-loaded
  `recurringEvents`), loading bar, categories/icons/legend filter, CSV export,
  timezone/DST-correct rendering, 7-language UI text, theming (`--cal-*`).

### Resource Timeline (`mustrysolutions.display.resourcetimeline`)
- Scheduling board: resources as rows (collapsible groups), epoch-linear time
  scale with hour/day/**shift**/week zoom presets, DST-true axis (23/25h days),
  bar/state/background display kinds, lane packing, now-line, mini month
  navigator, hover detail, categories/legend, CSV export.
- Editing: drag-retime, cross-row reassign (`fromResourceId`), both-edge
  resize, drag-to-create, built-in editor (grouped resource dropdown,
  validation, recurrence rule editing); recurring occurrences carry a ↻
  marker and drag/edit with calendar parity (detach + series scope).
- Windowed binding contract identical to the calendar; 7-language UI text;
  theming (`--tml-*`).

### Hardening in this cut
- DST-safe windows/paging/ticks; instant-true ISO emission in the fall-back
  hour; delta-snapped drags (off-grid events keep their offset); noop-move
  guards (a sloppy click never silently retimes); primary-button-only
  gestures with pointer capture.
- Memoized timeline layout (drags no longer relayout every row per pointer
  move); hover popovers suppressed during gestures; minimum grabbable bar
  geometry; CSV exports get a UTF-8 BOM and a formula-injection guard.
- Designer palette + project-browser icons for all three components.
- CI: gradle build + 280-odd Jest tests + the prop-schema guard.

### Known gaps (tracked)
- Touch is implemented (Pointer Events + `touch-action`) but **not yet
  verified on real touch hardware** — see the manual-test checklists.
- Prop-schema versioning/migration is deliberately deferred until first real
  deployment (see README "Roadmap / deferred work").
- Bundled translations are pragmatic, not native-reviewed (per-key overrides
  exist for corrections).
