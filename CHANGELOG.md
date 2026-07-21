# Changelog

All notable changes to the Mustry Solutions Ingots module.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow
semver. **Pre-1.0, the prop schemas may still change** — the CI schema guard
(`ops/schema-guard.sh`) flags any removed/renamed key so breakage is always a
deliberate decision, never an accident.

## [Unreleased]

### On-Screen Keyboard (new component)
Ninth component: `mustrysolutions.ingots.input.keyboard` — a touch keyboard for
the runtime, the gap Perspective leaves to the OS keyboard (Windows
TabTip / Linux Squeekboard), which breaks in Perspective Browser/mobile
and causes the "double-keyboard" problem; the Exchange only offers view
templates that can't stop the OS keyboard. Its value display is a `<div>`,
not an `<input>`, so tapping it never raises the OS keyboard — the actual
fix, not a workaround. Two families sharing one controlled shell: a
**numeric keypad** (`layout: numpad`, editing value.value — min/max clamp
with an out-of-range badge, decimals, units, allowNegative, setpoint-style
fresh entry) and a **QWERTY keyboard** (`layout: text`/`email`/`url`,
editing value.text — one-shot shift, a ?123 symbols layer, maxLength,
@/.com// convenience keys). `mode: inline` or `popover` (a field trigger
that opens a portalled panel; Enter commits + closes, outside-click/Escape
discards). Enter fires `onCommit {value, text, isValid}` (value is a number
or string by layout); live `onChange`; read-only `output.*`
(value/text/isValid/length/draft); 7-language labels, `--kbd-*` theming.
All editing rules pure + node-tested. Demo at `/keyboard`; 8 e2e tests +
26 pure-logic jest cases.

### Color Picker (new component)
Eighth component: `mustrysolutions.ingots.input.colorpicker` — a runtime colour
input, the gap Perspective only fills at design time (the property-editor
selector) and that the Exchange covers only with copy-in views (#112,
#2388, #2691), not a compiled component. HSV area + hue/alpha bars
(continuous drag; hue survives greys/black via a working copy),
hex/rgb/hsl formats switchable at runtime, optional alpha
(`#RRGGBBAA`/`rgba()`), three presentations from `mode` + `showInput`
(full inline panel / swatch+code popover / compact icon button) whose
popover triggers carry a contrast-aware eyedropper glyph so they read as a
control, portalled panel (flips on overflow, outside-click/Escape close,
optional `config.popoverScrim` backdrop), a **bound** swatch palette
(`data.swatches`) + recent-colours row, and an eyedropper (EyeDropper API
where available). Controlled write-back: `value.color` is the bound truth,
a pick fires `onChange` `{value, hex, rgb, hsl, alpha}` and mirrors
read-only `output.*` (hex/rgb/hsl/alpha/isValid); 7-language labels,
`--cp-*` theming. All colour maths is pure + node-tested. Demo at
`/color`; 6 e2e tests + 30 pure-logic jest cases.


## [0.2.0] - 2026-07-18

### Code / JSON Editor (new component)
Seventh component: `mustrysolutions.ingots.input.codeeditor` — CodeMirror-6
editing and read-only viewing of JSON / Python / SQL / XML / plain text
for config-driven apps (an open gap: only a read-only JSON viewer
existed third-party; nothing native through 8.3.8). Live JSON parse
validation (lint gutter + toolbar badge + output.isValid/errorMessage
to gate commit buttons on), Format JSON, folding, search, bracket
matching, undo/redo (bound content history-exempt), the module's
standard controlled save/dirty model (`onSave`), display mode,
7-language labels, `--code-*` theming incl. a CSS-variable syntax
palette. Demo at `/code`; 5 e2e tests + pure-logic jest suite.
Bundle 656K→1.25M minified (~350K gz) — CodeMirror + 4 grammars;
lazy-loading language chunks is the noted follow-up trim.

### Rich Text Editor (new component)
Sixth component: `mustrysolutions.ingots.input.richtexteditor` — true WYSIWYG
editing and safe read-only display of operator instructions/SOPs/notes
(the top remaining validated Perspective gap; research July 2026). Built
on TipTap core (vanilla — Perspective pins React 16, so the editor
mounts imperatively, gesture-controller style). Controlled write-back
(`onSave`), schema-constrained sanitization with URL allowlists,
feature-flagged formatting (headings/lists/links/tables/images/
checklists), interactive display-mode checklists (`onTaskToggle`),
char limit, plainText/wordCount/charCount outputs, 7-language labels,
`--rte-*` theming, print stylesheet. Undo/redo toolbar
buttons (bound content is history-exempt — Ctrl-Z can never blank the
document), an image-library picker fed by bound `data.imageLibrary`
(gateway Image Management paths like `/system/images/...` work
directly), and a `config.fonts` allowlist font picker (display mode
always renders saved fonts). Demo at `/rte` incl. theme toggle; 10 e2e
tests + pure logic jest suites. Bundle grows 245K→656K minified (~180K gz) — first
runtime dependency, trim pass noted for later.

### Build & CI
- The web bundle is now a **production webpack build** by default: minified JS
  + CSS, no source maps (JS 508K → 240K, CSS 68K → 55K, `.modl` ~391K → ~110K).
  `./gradlew build -PwebDev` restores the unminified dev bundle with source maps.
- New **Playwright e2e smoke suite** (`e2e/`, `ops/e2e.sh`): renders every
  component route of the verify project in a real Perspective session — mount,
  key interactions (preset write-back, view switch, group collapse, quick
  filter, 50k-row virtualization, embedded-view click, fly-to), zero console
  errors. Runs in CI on every push/PR.
- **Unattended gateway bring-up** (`ops/e2e.sh --fresh`): headless
  commissioning + module-cert pre-acceptance by merging the dev cert's SHA-1
  into `data/modules.json` — no browser wizard. Used by CI; locally it's also
  the quickest fix for an expired Perspective trial.

### Internal
- **CSS classes namespaced**: every `.cal-`/`.tml-`/`.dg-`/`.pz-`/`.dtrp-`
  class is now `mustry-`-prefixed (845 renames), eliminating collision risk
  with other third-party modules' global styles on a shared Perspective page.
  The documented theming CSS *variables* (`--cal-*`, `--tml-*`, …) are
  unchanged. Class names were never a documented API; anyone who targeted
  them in a project stylesheet must add the `mustry-` prefix.
- **Build modernized**: Gradle 7.6 → 8.14.3 (zero deprecations),
  `io.ia.sdk.modl` 0.4.0 → 0.5.0, node-gradle plugin 3.5.1 → 7.1.0,
  `settings.gradle` → Kotlin DSL (dropping the meaningless root include),
  deprecated `$buildDir` → `layout.buildDirectory`, and the `:web` cross-project
  task mutation removed. The web bundle's double scope declaration resolved:
  `modlImplementation(project(":web"))` in the gateway is the load-bearing one
  (verified: `projectScopes` alone drops the jar from module.xml), so the
  redundant `projectScopes` entry is gone.
- **TypeScript full `strict`** (adds strictFunctionTypes/BindCallApply/
  PropertyInitialization/noImplicitThis over the previous partial flags), plus
  `noImplicitReturns` and target es6 → es2019. Only five errors surfaced — all
  the Perspective `PComponent`/`PlainObject` boundary variance, now explicit
  casts at `getViewComponent()` with the props reducer as the runtime guarantee.
- **One Java component registry** (`comp/Components.ALL`): both hooks iterate a
  single list for register/remove, and descriptor assembly moved into one
  factory — the per-scope hand-maintained lists (and their drift) are gone.
- **Uniform props-schema strictness**: every schema root and section now
  rejects unknown keys (`additionalProperties: false`), matching the picker's
  standard; the resourcetimeline also gained the `style` section the other
  components already declared.
- **God components decomposed** following the calendar's pattern: picker
  (1120→972 + CalendarPane/Presets/Inputs/Trigger), timeline (1019→863 +
  Toolbar/Legend/Track), grid (843→741 + Toolbar/Cells); `labelPacks.ts`
  (789) became a barrel over per-component modules in `shared/labels/`.
- **Shared drag-gesture lifecycle** (`shared/dragGestureController.ts`): the
  calendar and timeline gesture controllers now extend one base owning pointer
  capture, document listeners, the click-vs-drag threshold (incl. the larger
  touch threshold), cancel semantics and commit dispatch — previously
  copy-pasted per component and already drifting (the timeline had re-inlined
  the movement threshold). Controllers keep only their geometry. No behavior
  change; covered by new drag/click e2e tests. Pan & zoom deliberately stays
  separate — its continuous multi-pointer model shares no lifecycle with the
  preview/commit gestures.

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

### Data Grid (new component, M0 — `mustrysolutions.ingots.input.datagrid`)
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
- **M3 core**: `config.editMode: 'batch'` — commits accumulate (italic +
  dot, "{n} unsaved" badge, read-only `output.dirtyCount`), **Save** fires
  ONE `onBatchSave` {edits, rows}, **Discard** reverts; overlays reconcile
  away when the write-back rebinds matching values (identity checks are
  useless — the reducer rebuilds rows on every prop write). **Excel range
  paste** onto the focused cell (TSV matrix over visible columns, skipping
  non-editable/invalid cells; accumulates in batch, fires per-cell in cell
  mode). **Aggregate footers** (`column.aggregate`: sum/avg/min/max/count)
  over the current view, sticky + locale-formatted; empty cells are absent,
  not zero. Manual checklist: docs/grid-manual-test.md.
- **50k-row claim validated** (`/grid-stress`, generated fixture — 5.6 KB
  committed): sort ~140 ms, quick filter ≤ 55 ms/keystroke, selection ~2 ms,
  exact virtualization at any depth. The honest constraint is the initial
  ~6 MB props sync (25–40 s; background tabs can drop the session websocket)
  — guidance documented: prefer query-side filtering above ~10k rows.
  **Fixed** (found by the stress test): filtering while scrolled deep left a
  blank grid — the virtualization window now clamps both ends into the
  dataset and renders the tail.

### Pan & Zoom View (new component, M0/M1 — `mustrysolutions.ingots.display.panzoomview`)
Fifth component: embeds ANY Perspective view (`config.viewPath` +
`config.viewParams`) inside a clipped viewport and navigates it like a map.
Custom build on perspective-client's publicly exported `View` component (no
third-party libs); plan: docs/panzoom-view-plan.md.
- **Navigation**: drag to pan (house threshold + click-suppression pattern, so
  buttons/inputs INSIDE the embedded view keep working — verified live with a
  click-counter inside the transformed view), wheel zoom **toward the cursor**
  (native non-passive listener; React's delegated `onWheel` is passive and
  can't `preventDefault`), double-click zoom, +/−/home/fit control buttons,
  live zoom badge.
- **Two-way `state.zoom`/`state.center`** (content coordinates): bind or
  script them to fly the viewport ("center on Pump 3 on alarm") — verified
  live from a demo button script. Gestures write back debounced with the
  house draft/echo-reconciliation pattern; zoom `0` = unset (resolves to
  home).
- **`config.home`** `{x, y, zoom}` is the reset/initial target (`zoom` 0 =
  fit content, `x`/`y` -1 = content center); pan clamped so ≥25% of the
  viewport always shows content (smaller-than-viewport content stays
  centered); zoom clamped to `config.minZoom`/`maxZoom`.
- **`output.viewState`** surfaces the embedded view's ViewStateType so
  authors can react to a bad `viewPath`.
- All geometry in pure `panZoomLogic.ts` (fit/clamp/resolve/transform/
  zoom-at-point/pan) with Jest coverage; `--pz-*` theming; palette icon.
- Known quirk (documented in the plan): popups/portals inside the embedded
  view portal to the document and escape the transform (unscaled).

M2 polish (same cut):
- **Pinch zoom**: two fingers zoom by the distance ratio anchored at the
  moving midpoint (pure `pinchViewport`, unit-tested; synthetic two-pointer
  events verified exact — real-hardware pass joins the standing tablet
  item); lifting one finger hands over to a pan; a pinch never fires a
  click into the embedded view.
- **Fly-to smoothing**: an external `state.zoom`/`center` write animates the
  viewport over new `config.flyToMs` (default 350 ms, 0 = snap; zoom eases
  in log space via pure `flyStep`). Visual-only (no state writes), snaps in
  hidden tabs (rAF doesn't run there) with a safety-net timer, cancels the
  moment a gesture takes over, and the component's own write-echo never
  re-animates.
- **Localized control tooltips** via new `config.locale` (en/fr/de/es/nl/it/pt).
- Gesture internals reworked for multi-pointer: up/cancel listen on window so
  a release outside the viewport can't leak a tracked pointer.
- Manual checklist: docs/panzoom-manual-test.md; dark-mode pass done
  (`--pz-*` chrome verified against the dark session theme).

M3 navigation aids (same cut):
- **POIs** (`data.pois`, `[{name, x, y, zoom, flagged}]`): named fly-to
  targets. Write a name to new two-way **`state.target`** to fly there from
  any script/binding — no coordinates needed; the component clears the
  target back to `''` so the same name re-triggers. `zoom` 0 keeps the
  current zoom. A localized **"Go to…" list** over the viewport
  (`config.showPoiList`) offers them to the operator.
- **Minimap** (`config.showMinimap`): corner overview with the content box,
  POI dots and the current view rectangle — click to jump, drag to pan
  (zoom unchanged). Auto-hides while the whole content is visible.
- **Flagged POIs** (`flagged: true` — bind it to alarm state): a pulse ring
  marks the POI while visible (click-transparent), and when it's off-screen
  a clickable **edge indicator** chip (name + arrow toward the real
  location) flies to it — the viewport tells the operator where to look.
- `pinchViewport`/`edgeIndicator`/minimap geometry all pure + unit-tested
  (387 tests); demo gained POIs, a `state.target` fly button and an alarm
  toggle.

M4 feel + robustness polish (same cut):
- **Proportional wheel zoom**: the zoom factor now scales with the wheel
  delta (`wheelZoomFactor`) — a mouse tick is still exactly one
  `config.zoomStep`, but trackpad pinches (many small deltas) zoom smoothly
  instead of notching.
- **Inertia panning**: releasing a flick glides the view out with
  exponential friction (`dragVelocity`/`glideFrame`, τ = 325 ms); hitting a
  pan bound stops that axis; the rest position is written once at the end;
  grabbing mid-glide (or mid-fly) freezes the view where it is.
- **Rubber-band overpan**: live drags stretch past the pan bounds with
  iOS-style hyperbolic resistance (`rubberBandCenter`) and spring back to
  the hard clamp on release; the written state is always the clamped
  position.
- **`prefers-reduced-motion`**: fly/glide/spring animations snap and the
  POI pulse ring holds still (the marker itself stays visible).
- **Auto content size**: `config.contentWidth/Height` default to **0 =
  auto** — the component adopts the size the embedded view reports, so the
  most error-prone config is now optional. Explicit sizes still win.
- **Fixed:** fly-to painted the DESTINATION for one frame before the
  flight began (the props write lands synchronously before the first
  animation frame) — the draft now pins the starting position through the
  write, so flights start from where the view actually is.

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
- New `/panzoom` route (PanZoomDemo): hosts the Pan & Zoom View embedding
  `SynopticDemo` — a 2400×1500 plant-floor coordinate view with an interactive
  click-counter proving embedded interactivity survives the transform — plus
  "Fly to Pump 3" / "Fly home (fit)" buttons scripting the two-way state.
- Each demo has a **session-theme dropdown** (light/dark + warm/cool variants)
  that writes `session.props.theme` — all three components verified rendering
  correctly in dark. Note: a full page reload starts a fresh Perspective
  session, which resets the theme to the project default.

## [0.1.0] — 2026-07-05

First versioned cut: three components, feature-complete for their v1 scope.

### Date/Time Range Picker (`mustrysolutions.ingots.input.datetimerangepicker`)
- Range selection with hover preview; `compact` / `oneMonth` / `twoMonths` /
  size-driven `auto` layouts; inline or popover display.
- Granularity day/hour/minute/second; selectable-range constraints
  (past/future, date bounds, min/max span) with explanatory tooltips.
- Rolling + calendar presets; opt-in **realtime mode** (a rolling preset arms
  a live window re-derived from "now" every `refreshSeconds`).
- Timezone/locale aware; built-in UI text in en/fr/de/es/nl/it/pt with per-key
  `config.labels` overrides; CSS-variable theming (`--dtrp-*`).

### Calendar / Scheduler (`mustrysolutions.ingots.display.calendar`)
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

### Resource Timeline (`mustrysolutions.ingots.display.resourcetimeline`)
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
