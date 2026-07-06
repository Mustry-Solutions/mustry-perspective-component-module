# Changelog

All notable changes to the Mustry Solutions Perspective Components module.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow
semver. **Pre-1.0, the prop schemas may still change** — the CI schema guard
(`ops/schema-guard.sh`) flags any removed/renamed key so breakage is always a
deliberate decision, never an accident.

## [Unreleased]

Cross-component parity pass: each component's best ideas ported to the others
where they add real value.

### BREAKING — prop sections harmonized (sanctioned pre-1.0, no deployments)
Both display components now follow one sections convention (the picker's
`selection` already embodied it): **`config`** = set-and-forget configuration,
**`data`** = bound content, **`state`** = two-way runtime state (the component
writes user interactions back; everything pre-settable/bindable), **`output`**
= read-only derived values. Moved keys (names unchanged):
- Calendar: `config.view` → `state.view`, `config.followNow` →
  `state.followNow`, `output.hiddenCategories` → `state.hiddenCategories`.
- Timeline: `config.zoom` → `state.zoom`, `config.followNow` →
  `state.followNow`, `config.collapsedGroups` → `state.collapsedGroups`,
  `output.hiddenCategories` → `state.hiddenCategories`.
- `hiddenCategories` is now **genuinely two-way** on both: pre-set or bind it
  to open with categories pre-filtered (it was a read-only output mirror).

### Calendar / Scheduler
- CSV export now includes `data.recurringEvents` (series definitions, deduped
  by id) — previously recurring series were silently missing from exports.
- Recurring occurrences carry the same ↻ marker as the timeline (month chips,
  week/day chips and all-day bars, list view, day popover).
- Both-edge resize in week/day views (timeline parity): a top handle moves the
  start, the bottom handle the end; multi-day segments get their one legal
  handle; handles suppressed on chips too short to also grab-move.
- **Fixed:** resize had no noop guard — a snapped-back resize fired a phantom
  `onChange`. Both edges are now guarded (moves already were).
- New `config.shifts` (`[{label, start: 'HH:mm'}]`): dashed shift-boundary
  lines with gutter labels in week/day views; shared parser in
  `shared/shifts.ts` (timeline can adopt it later). Themeable via
  `--cal-shift-line`.
- `onChange` event schema now documents the recurrence context
  (`scope`/`seriesId`/`occurrenceDate`) the payload already carried.
- **Follow-now live mode** (timeline parity): two-way `config.followNow` +
  toolbar "Live" toggle with pulsing dot; re-anchors on today every
  `refreshSeconds` (else 60s); paused mid-edit/drag; paging or a mini-nav pick
  disarms, Today and view switches do not.
- `output.visibleStartMs` / `visibleEndMs`: the window as DST-correct epoch
  instants (zone-local midnights), for binding `t_stamp` queries directly.
- Hover popover status badge and "All day" text are now localized via the
  label packs (`labels.statusTentative/statusCancelled/statusDone`) — they
  were hardcoded English.
- **Fixed (both display components):** the `emptyMessage` default ("No
  events") is now treated as "unset" and follows the locale packs
  (`labels.noEvents`) — previously a French calendar showed an English badge.
  Any other value overrides; `''` still hides the badge.

### Resource Timeline
- Empty-state badge with context-aware how-to tooltip (calendar parity) +
  `config.emptyMessage`.
- **Follow-now live mode** (ported from the picker's realtime mode): two-way
  `config.followNow` + toolbar "Live" toggle with pulsing dot; re-anchors the
  window so the now-line stays in view (tick = `refreshSeconds`, else 60s);
  paused while editing/dragging; manual paging or a mini-nav pick disarms,
  Today does not. Same Designer-dirty caveat as the picker's realtime mode.
- Resource `color`/`icon` (already in the schema) are now rendered on row
  labels (icon-else-dot, matching the legend).
- `onChange` event schema documents `scope`/`seriesId`/`occurrenceDate`.
- **Fixed:** the toolbar CSV-export icon rendered at zero size (the SVG was
  never given dimensions — calendar parity); surfaced by the first fixture to
  enable `showExport` on a timeline.
- `output.visibleStartMs` / `visibleEndMs`: the window as raw epoch ms, for
  binding `t_stamp` queries directly.
- Hover popover shows a localized status badge (tentative/cancelled/done),
  calendar parity — new `labels.status*` keys in all 7 languages.
- Enter animation on newly-appearing bars/state bands (calendar parity, shared
  `EnterTracker`); never animates mid-drag; respects `prefers-reduced-motion`.
- `config.snapMinutes`: one snap override for drag-move, both resizes,
  drag-create and click-to-create at every zoom (0 = per-zoom default).
- Internal: shift parsing now uses the shared `shared/shifts.ts` module
  (calendar parity, duplicate deleted).
- **Fixed:** with Live armed, a zoom (or timezone) change didn't re-anchor
  until the next tick — at Hour zoom the window could sit up to `refreshSeconds`
  without the now-line, making Live look broken. Zoom/timezone changes now
  re-anchor immediately (calendar gets the same immediate re-anchor on a
  timezone change).
- `config.showMiniNav` (calendar parity): `false` renders a plain title with
  no mini month navigator.
- **Fixed (the real "Live looks dead" bug):** the board scrolls horizontally
  within the window, and arming Live never scrolled the now-line into view —
  a correct window could still show 00:00–14:00 at 20:00. Follow ticks now
  scroll the now-line to ~60% of the viewport whenever it drifts off screen
  (and only then, so manual scrolling isn't fought while it's visible). The
  calendar equivalently re-centres its week/day grid on the now indicator
  while armed when `scrollToNow` is on.

### Date/Time Range Picker
- Popover is now a real dialog: `role="dialog"`, `aria-modal`, localized
  `aria-label` (new `labels.dialogLabel`, all 7 languages), focus moves in on
  open, Tab is trapped, and focus returns to the trigger on close (except
  after an outside click, which keeps focus where the user clicked).

### Data Grid (new component, M0 — `mustrysolutions.input.datagrid`)
- First cut of the fourth component (custom build, no library — see
  docs/data-grid-plan.md): a read-only virtualized grid. Columns from
  `config.columns` ({field, header, width, pinned, align}); fixed
  `config.rowHeight` (the virtualization contract); frozen columns +
  sticky header via the timeline's one-scroll-container layout; zebra
  rows, hover, per-column alignment, ellipsis + title tooltips; loading
  bar + localized empty badge (7-language `labels.noRows`); `--dg-*`
  theming verified light + dark. ~24 DOM rows regardless of data size
  (2,500-row demo at `/grid`).
- M1 core interactions, all two-way via the grid's `state` section:
  header-click **sorting** (asc/desc/off; type-aware compare, empties last,
  stable), a toolbar **quick filter** (contains across all columns, match
  count, local-draft typing so gateway round-trips never eat keystrokes),
  **row selection** (`config.rowSelect` none/single/multi with Ctrl-toggle +
  Shift-range over the visible order, ids via `config.idField`, count badge),
  and **CSV export of the current view** (filtered + sorted, BOM +
  injection-guarded).
- M1 complete — column layout as two-way `state.columnLayout`: **drag a
  header to reorder**, **drag its edge handle to resize**, **hide/show via
  the toolbar column chooser** (config.columns stays the authoring truth;
  the state layers on top, pre-settable/bindable). **Typed columns**
  (number with locale grouping + fixed decimals, date/datetime localized,
  boolean check/dash) — the quick filter and CSV match the displayed text.
  **Conditional cell styling** (per-column rules: equals / gt / lt /
  contains -> color/background, first match wins).
- **M2 — the editing core** (the reason this component exists; controlled
  like the calendar/timeline — the grid never mutates its own data):
  - Typed cell editors: text, number, date, datetime, and
    **dropdown-in-cell** (`column.options`) — the native Table's most
    hacked-around gap. Boolean columns render a live checkbox.
  - Declarative validation before commit (`required`/`min`/`max`/
    `pattern`/options): invalid drafts show a red editor + localized
    message and never fire; Escape reverts; blur commits-or-reverts.
  - **`onCellEdit`** `{rowId, field, oldValue, newValue, row}` after
    validation; the value overlays optimistically (italic + dot) until
    the author's write-back rebinds `data.rows`. `config.editable`
    master switch + per-column `editable`.
  - **`onRowAdd`** / **`onRowsDelete`** with toolbar buttons
    (`config.allowAdd`/`allowDelete`; delete acts on the selection).
  - **Excel keyboard model**: arrows/PageUp/Down/Home/End move the
    focused cell (auto-scrolled into view), Enter/F2/type-to-edit open
    the editor, Enter/Tab commit + move (Shift-Tab left), all localized
    (8 new label keys x 7 languages).

### Verify harness
- The three demo views are now **evergreen**: `now(0)` expression bindings with
  script transforms seed the data relative to today on every view load
  (in-session edits still stick), so the demos never go stale.
- `Main` (`/`) is a picker showcase: a twoMonths instance with rolling +
  calendar presets and realtime enabled, live output readouts
  (`startDateTime`/`endDateTime`/`durationLabel`/`isRealtime`), plus the
  labelled oneMonth / compact / popover gallery.
- `/calendar` (calendar demo, was `/demo`) gained shifts, a Quality category, recurring series in
  `data.recurringEvents`, and the dual-list write-back script (events +
  recurringEvents, matching the timeline's).
- `/timeline` gained `showExport`, resource icons/colors, and the same
  evergreen treatment; new `/timeline-empty` fixture (empty-state badge).
- Removed the 1.4 MB `CalendarStress`/`TimelineStress` fixtures (P2 perf pass
  is signed off; restore from git history if ever needed).
- Routes renamed component-first: `/picker` (alias of `/`), `/calendar`,
  `/calendar-db`, `/calendar-empty`, `/timeline`, `/timeline-db`,
  `/timeline-empty` (docs + skill updated).
- Each demo has a **session-theme dropdown** (light/dark + warm/cool variants)
  that writes `session.props.theme` — all three components verified rendering
  correctly in dark. Note: a full page reload starts a fresh Perspective
  session, which resets the theme to the project default.

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
