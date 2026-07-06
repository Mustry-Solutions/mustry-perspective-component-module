# Mustry Solutions Perspective Components

An Ignition **8.3.6** module that adds custom [Perspective](https://www.inductiveautomation.com/) components, written as React/TypeScript module components. It currently ships three components — a **Date/Time Range Picker**, a **Calendar / Scheduler** and a **Resource Timeline** (scheduling board) — with more to follow.

- **Module ID:** `com.mustrysolutions.perspective.components`
- **Palette category:** `Mustry Solutions`

---

## Date/Time Range Picker

A Booking.com-style start/end date-time range picker. Component id `mustrysolutions.input.datetimerangepicker`.

### Features

- **Range selection** with a hover preview band and a two-click (anchor → endpoint) state machine.
- **Responsive layouts** — `compact`, `oneMonth`, `twoMonths`, or `auto` (size-driven via breakpoints).
- **Inline or popover** display (`config.display`) — popover shows a trigger field and floats the calendar in a portal.
- **Time precision** via `config.granularity` (`day` / `hour` / `minute` / `second`).
- **Selectable-range constraints** — `disableDates` (past/future/none), `dateBounds`, and `spanDays` min/max, with tooltips explaining why a day or preset is disabled.
- **Presets** — `rolling` (amount × unit from now) and `calendar` (today, this/last week/month/year…); conflicting presets are auto-disabled.
- **Realtime mode** (opt-in, `config.realtime`) — clicking a *rolling* preset arms a **live window** that re-derives from "now" every `refreshSeconds` (default **300**; the Alarm-Journal-style "last 8 hours, live"); the armed preset shows a pulsing dot, any manual selection stops it, and `output.isRealtime` reports the state. The armed window lives in `selection.rollingAmount`/`rollingUnit` (writable), so a dashboard can open already-live without a click. Each tick rewrites the selection, so bound queries re-run at that rate — lower `refreshSeconds` deliberately. **Designer note:** while a window is armed, the ticking selection writes will keep marking an open view as modified in the Designer; disarm (set `selection.rollingAmount` to 0) or leave `config.realtime.enabled` off while designing.
- **Localisation** — `config.timezone`, `config.locale` (dates **and** the built-in UI-text language: en, fr, de, es, nl, it, pt), `config.weekStart`, and per-key UI-string overrides via `config.labels`.
- **Theming** — every colour is a CSS variable defaulting to the active Perspective theme (see [Theming](#theming)).
- **Component events** — `onRangeChanged`, `onPresetSelected`.

### Property reference

All public props are grouped under `config` / `selection` / `output` (+ standard `style`). Each prop carries an inline description visible in the Designer; this is the high-level map.

**`config`** — behaviour & appearance
| Prop | Notes |
|---|---|
| `enabled` | When false, display-only and dimmed. |
| `display` | `inline` \| `popover`. |
| `popover` | `{ placeholder, closeOnSelect, dateFormat }` (popover trigger). `dateFormat` tokens: `YYYY YY MM M DD D`; 24h time auto-appended per granularity. |
| `disableDates` | `past` \| `future` \| `none`. |
| `dateBounds` | `{ earliest, latest }` (YYYY-MM-DD). |
| `spanDays` | `{ min, max }` allowed range length. |
| `granularity` | `day` \| `hour` \| `minute` \| `second`. |
| `durationLabelThresholdHours` | Below this span, the label shows time units instead of days. |
| `weekStart` | `monday` \| `sunday`. |
| `timezone`, `locale` | Empty = browser/session default. |
| `layout` | `auto` \| `compact` \| `oneMonth` \| `twoMonths`. |
| `breakpoints` | `{ compactBelowWidth, compactBelowHeight, twoMonthsAboveWidth }` (drive `auto`). |
| `showClear`, `showPresets` | Toggle the Clear button / preset row. |
| `presets` | `[{ label, type, rolling:{amount,unit}, calendar:{period} }]`. |
| `realtime` | `{ enabled, refreshSeconds }` (default off / 300 s) — rolling presets arm a live window that re-derives from now (see Features; note the Designer caveat there). |
| `labels` | Override UI text: `startTime, endTime, startDate, endDate, clear, selectRange, invalidRange, sameDay, previousMonth, nextMonth`. |

**`selection`** — two-way; set to pre-select
`startDate`, `endDate` (YYYY-MM-DD); `startTimeSec`, `endTimeSec` (seconds since midnight); `rollingAmount`, `rollingUnit` (the armed live window when `config.realtime.enabled`; `rollingAmount: 0` = not armed — write these to open a view already-live).

**`output`** — read-only, derived
`startDateTime` / `endDateTime` (ISO 8601 + offset), `startEpochMs` / `endEpochMs` (UTC ms), `durationDays`, `durationHours`, `durationLabel`, `isValid`, `isRealtime`.

### Events

- **`onRangeChanged`** — fires when the selection or its derived outputs change. Payload mirrors `output.*`.
- **`onPresetSelected`** — fires on a preset click. Payload: `{ label, type, amount, unit, period }`.

### Theming

Colours come from CSS custom properties that default to the active Perspective theme (the `--neutral-*` scale for text/border/background, `--callToAction` for the accent), each with a hex fallback. Override them — without rebuilding — via a Perspective style class on the component or the project stylesheet:

```css
.mustry-datetime-range-picker { --dtrp-accent: #2e7d32; --dtrp-range: #c8e6c9; }
```

Variables: `--dtrp-accent`, `--dtrp-accent-text`, `--dtrp-range`, `--dtrp-text`, `--dtrp-muted`, `--dtrp-border`, `--dtrp-bg`.

---

## Calendar / Scheduler

A month / week / day / list calendar bound to a list of events. Component id `mustrysolutions.display.calendar`. Built from scratch (no FullCalendar / no third-party licence).

### Features

- **Views** — Month, time-based Week & Day (with overlap-packed events), and a List/agenda view; switchable from the toolbar.
- **Busy days** — month cells **auto-fit** as many events as the cell height allows, then collapse to "+N more"; clicking it (or the date number) opens a popover listing **all** that day's events (each clickable to open/edit).
- **Data-bound** — renders `config.data.events` (a JSON array) in a single pass; emits the visible window so bindings fetch only what's shown.
- **Multi-day events** — multi-day **all-day** events render as continuous **spanning bars** (month grid + week/day all-day strip), lane-packed so they stack; multi-day **timed** events show a clamped segment on each day they cross (week/day grid).
- **Editable** (`config.editable`) — drag an event to move it, drag its bottom edge to resize (week/day); in **month view, drag a chip or spanning bar onto another day** to move it by whole days (time of day kept, drop target highlighted); **selectable** (`config.selectable`) — drag empty time to create.
- **Built-in editor** (`config.builtInEditor`) — create via a popup form (with `selectable`), and **click an event to edit or delete it** (with `editable`).
- **One change event** — `onChange` fires for *every* data mutation (create / edit / delete / move / resize) with `{ action, event }`, so a single script persists the change and triggers any downstream logic.
- **Categories, icons & legend** — define `config.categories` (`{id, label, color, icon}`); an event's `category` supplies its colour and an optional **icon** (any Ignition icon path, e.g. `material/build`), shown on every event and in the bottom **legend**. The legend is interactive — click an item to **filter** that category in/out (`state.hiddenCategories`, two-way: pre-set or bind it to open pre-filtered); hide the whole legend with `config.showLegend = false`.
- **Event status** — an optional `event.status` (`tentative` / `cancelled` / `done`) restyles the event (striped/faded, struck-through); unset renders as a normal solid event.
- **Mini-month navigator** — the toolbar title opens a compact month picker to jump anywhere (`config.showMiniNav`).
- **CSV export** — `config.showExport` adds a toolbar button that downloads the loaded events as a CSV (`calendar-events.csv`).
- **Recurrence** — events can carry an `rrule` (daily / weekly-by-weekday / monthly / yearly), expanded per visible window. The built-in editor **creates and edits** recurring events: a Repeat control (frequency · every-N · weekly weekday picker · ends never/on-date/after-N), and when editing an occurrence an **apply-to** choice — *This event* (a per-occurrence exception via `rrule.exdate` + a standalone override) or *All events* (the whole series). Dragging a single occurrence detaches it the same way. `onChange` carries `scope` (`series`/`occurrence`) + `seriesId`/`occurrenceDate` so your write-back can persist the right thing.
- **Background overlays** — events with `display: "background"` render as translucent bands (e.g. downtime / availability) behind the time grid.
- **Localisation & theming** — `weekStart`, `locale` (drives all date/weekday/month names **and** picks the built-in UI-text language: en, fr, de, es, nl, it, pt), and **`config.labels`** to override any individual UI string (toolbar views, Today, the editor, "+N more", "all-day"…) for translation or branding; CSS-variable theming that follows the Perspective theme. The bundled translations are pragmatic, not native-reviewed — override per key where wording matters.

### How events work — important

The calendar is a **controlled, read-from-data component. It never changes `config.data.events` itself.** To show events, you populate that array (statically, or by binding it to a Named Query / dataset). Editing gestures **only fire component events** — to actually add/move/resize an event you handle the event and write back to your own source:

There are two kinds of events. **Intent** events (`onEventClick`, `onDateClick`, `onSelect`) say *"the user did something"* — wire them when you build your own editing UI. The **change** event (`onChange`) says *"the data should change"* — it's the single hook for persistence.

| To… | Do this |
|---|---|
| **Show** events | Set / bind `config.data.events`. For DB-backed calendars, fetch **only the visible window**: bind it to a query scoped by `output.visibleStart`/`visibleEnd` (use an *overlap* predicate: `start < :end AND end >= :start`), and bind `config.data.recurringEvents` to a small **always-loaded** query (`WHERE rrule IS NOT NULL`) so a windowed query never silently drops a series. Bind `config.loading` to the query state for a stale-while-revalidate bar. See the recipe + `/calendar-db` fixture. |
| **Persist any change** | Handle **`onChange`** — it fires for create / edit / delete / move / resize with `{ action, event }`, where `event` always carries the final start/end. Upsert on every action except `delete`, where you remove by id. This is the one handler you need. |
| **Edit / delete in-place** | Set `config.editable = true` **and** `config.builtInEditor = true`; clicking an event opens the editor pre-filled (Save / Delete → `onChange`). |
| **Use your own editor** | Leave `builtInEditor` off; handle `onSelect` (create) and `onEventClick` (open your form). Moves/resizes still fire `onChange`. |

So if you drag on the calendar and "nothing happens", that's expected — the gesture fired `onChange` (or `onSelect`); the event appears only once your handler writes it back into `config.data.events`.

**The one-handler recipe** (`onChange`) — upsert-or-delete by id, covering every mutation. (This is the minimal version for non-recurring data; if you use `rrule`, use the scope-aware version in [`docs/calendar-manual-test.md`](docs/calendar-manual-test.md#write-back-recipes-paste-into-the-components-event-config-in-the-designer), which also honours `scope`/`seriesId`/`occurrenceDate`.)

```python
ev = event.event
row = {"id": ev.id, "title": ev.title, "start": ev.start, "end": ev.end,
       "allDay": ev.allDay, "category": ev.category, "color": ev.color,
       "status": getattr(ev, "status", ""), "display": getattr(ev, "display", ""),
       "description": ev.description}
events, found = [], False
for e in self.props.data.events:
    cur = dict(e)
    if cur.get("id") == ev.id:
        found = True
        if event.action == "delete":
            continue
        cur = row
    events.append(cur)
if event.action != "delete" and not found:
    events.append(row)
self.props.data.events = events
```

### Property reference

**`config`** | `view` (`month`/`week`/`day`/`list`, two-way) · `showToolbar` · `showMiniNav` (title opens a mini-month picker) · `showExport` (toolbar CSV-download button) · `editable` · `selectable` · `builtInEditor` (built-in editor popover — for **create** with `selectable`, and **edit/delete** with `editable`) · `weekStart` (`monday`/`sunday`) · `locale` · `timezone` (IANA zone, e.g. `America/Chicago`; converts event instants and today/now to that zone, empty = browser-local) · `showWeekends` · `dayStartHour` / `dayEndHour` / `scrollToHour` (week/day time axis) · `slotMinutes` (week/day grid resolution + snapping — a divisor of 60: 60/30/15/10/5; finer = sub-hour gridlines, taller scrollable grid) · `scrollToNow` (centre week/day on the current time when today is in view) · `refreshSeconds` (re-render every N seconds so the now-indicator ticks live; 0 = off) · `loading` (bind to your query state → thin loading bar + stale-while-revalidate) · `refetchDebounceMs` (coalesce rapid navigation into one visibleStart/End write; default 150, 0 = immediate) · `showLegend` · `emptyMessage` (subtle header badge + list message when no events are configured; empty string = off) · `categories` (`[{id, label, color, icon}]`; `icon` = Ignition icon path) · `labels` (override any built-in UI string — defaults follow `locale` for bundled languages, else English; `{n}`/`{tz}` are substituted).

**`config.data.events`** — array of event objects:

| Field | Notes |
|---|---|
| `id` | echoed back in events (use for write-back) |
| `title` | label |
| `start` | ISO `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss` |
| `end` | optional; exclusive for all-day multi-day |
| `allDay` | boolean |
| `color` | any CSS colour (overrides the category colour) |
| `category` | category id (see `config.categories`) — supplies the colour, icon + legend grouping unless `color` is set |
| `status` | optional `tentative` / `cancelled` / `done` — restyles the chip (striped/faded, struck-through) |
| `description` | optional text shown in the hover popover |
| `display` | `"background"` for a downtime/availability band |
| `rrule` | `{ freq: daily\|weekly\|monthly\|yearly, interval?, count?, until?, byweekday?[], exdate?[] }` (byweekday: 0=Sun..6=Sat; exdate: `YYYY-MM-DD` occurrences to skip) |

**`state`** (two-way) | `view` (the toolbar writes the user's choice back; setting it switches the view) · `followNow` (the Live toggle) · `hiddenCategories` (legend filter — pre-settable/bindable). \n**`output`** (read-only) | `visibleStart`, `visibleEnd` (half-open `[start, end)` — bind your query: `date >= visibleStart AND date < visibleEnd`) plus the epoch-ms twins `visibleStartMs`/`visibleEndMs`.

### Events

**Intent** (the user did something): `onEventClick` (full event) · `onDateClick` (`{date}`) · `onSelect` (`{start, end, allDay}` — dragged-out empty range).

**Change** (the data should change): **`onChange`** (`{ action: create|edit|delete|move|resize, event }`) — fires for every mutation; the single hook for persistence and triggering downstream logic. `event` always carries the final start/end, so write-back needs no second lookup.

> When the built-in editor is on (`builtInEditor` + `editable`), clicking an event opens the editor instead of firing `onEventClick`, and create/edit/delete all surface through `onChange`.

### Theming

Override the `--cal-*` CSS variables via a style class / project stylesheet: `--cal-accent`, `--cal-accent-text`, `--cal-text`, `--cal-muted`, `--cal-border`, `--cal-bg`, `--cal-weekend-bg`. They default to the active Perspective theme.

> Manual test checklist: [`docs/calendar-manual-test.md`](docs/calendar-manual-test.md).

---

## Resource Timeline

A scheduling board: resources (machines, lines, crews) as rows on a zoomable horizontal time axis. Component id `mustrysolutions.display.resourcetimeline`. Design doc: [`docs/resource-timeline-plan.md`](docs/resource-timeline-plan.md).

### Features

- **Rows & groups** — `config.resources` renders in array order; consecutive equal `group` values share a sticky section header. **Click a header to collapse/expand its section** (chevron + hidden-row count; `state.collapsedGroups` is two-way, so a view can open pre-collapsed or drive it from a binding). The label column, time axis and corner are all sticky, so both scroll directions stay aligned.
- **Epoch-linear time scale** with stepped **zoom presets** (`state.zoom`: `hour` / `day` / `shift` / `week`, two-way) — each preset sets density, paging span and gesture snapping. The **`shift` preset** appears when `config.shifts` is set (`[{label, start: 'HH:mm'}]`): a day-wide window whose lower ticks and gridlines sit on the shift boundaries, labelled with the shift names. DST days render as their real 23/25 hours; tick labels follow `config.timezone` + `config.locale`.
- **Three display kinds** per event: `bar` (default — lane-packed when overlapping), `state` (full-height contiguous band, e.g. machine states; no end = ongoing, runs to the window edge) and `background` (translucent span behind everything).
- **Editable** (`config.editable`) — drag a bar to retime it (ghost preview, snap per zoom preset), **drag it onto another row to reassign**, drag either edge to resize; **selectable** (`config.selectable`) — drag empty track to create.
- **Built-in editor** (`config.builtInEditor`) — create/edit/delete via a popup with a grouped resource dropdown and the same **Repeat controls as the calendar** (frequency, every-N, weekly weekday picker, ends never/on-date/after-N); editing a recurring occurrence offers the "This event / All events" choice.
- **One change event** — `onChange` fires for every mutation (`create`/`edit`/`delete`/`move`/`resize`) with the resulting event carrying its final `start`/`end`/`resourceId`; a cross-row drag adds `fromResourceId`. Recurring mutations add the calendar's `scope`/`seriesId`/`occurrenceDate` context. One script persists everything.
- **Mini month navigator** — the toolbar title opens a compact month picker to jump the window anywhere (`config.weekStart` sets its first day).
- **Categories, icons & legend** — same contract as the calendar (`config.categories`, `event.category`, `event.status` restyling, interactive legend on two-way `state.hiddenCategories`).
- **Recurrence** — events with an `rrule` expand per visible window (bind `config.data.recurringEvents` to an always-loaded query so windowed fetches never drop a series). Occurrences carry a ↻ marker and edit like the calendar's: dragging or editing one detaches it into a standalone override plus an `exdate` on the series; the editor can target the whole series instead.
- **Windowed data binding** — `output.visibleStart`/`visibleEnd` are ISO-8601 UTC instants (half-open); bind your query `ts >= :start AND ts < :end` and `config.loading` to its state. See the live recipe at `/timeline-db` in the verify project.
- **CSV export** (`config.showExport`), now-line (`config.refreshSeconds`), localization (same 7 languages + `config.labels` overrides), CSS-variable theming (`--tml-*`).

### How events work

Identical philosophy to the calendar: **controlled, read-from-data**. The timeline never mutates `config.data.events`; gestures fire `onChange` and your handler writes back (upsert-or-delete by `id` — the event always carries its final `resourceId`, so a reassign needs no special casing). The demo view at `/timeline` ships a complete one-handler write-back script, including the recurring branches (`scope`/`seriesId`/`occurrenceDate` → series `exdate` + standalone override) across both `data.events` and `data.recurringEvents`.

### Theming

Override the `--tml-*` variables via a style class / project stylesheet: `--tml-accent`, `--tml-accent-text`, `--tml-text`, `--tml-muted`, `--tml-border`, `--tml-line`, `--tml-bg`, `--tml-group-bg`, `--tml-now`.

> Manual test checklist: [`docs/timeline-manual-test.md`](docs/timeline-manual-test.md).

---

## Project layout

| Path | Scope |
|---|---|
| `common/` | Component descriptor + the props/event JSON schemas (`src/main/resources`). |
| `gateway/` | Gateway hook (registers components, mounts web resources). |
| `designer/` | Designer hook (registers components in the Designer). |
| `web/` | React/TypeScript front-end + styles, built by webpack. |
| `ops/` | Local dev gateway (Docker) + scripts — see [`ops/README.md`](ops/README.md). |
| `ops/verify/` | Live browser-verification harness — see [`ops/verify/README.md`](ops/verify/README.md). |

---

## Build, test, deploy

Requires JDK 17 (`JAVA_HOME`). Node 18.20.4 is downloaded automatically by the build.

```bash
# Build the signed-or-unsigned .modl (web bundle + Java)
./gradlew build

# Run the TypeScript unit tests (also part of `gradlew check` / `build`)
./gradlew :web:jestTest        # or: cd web && npm test

# Local dev gateway + deploy (see ops/README.md)
ops/setup.sh                   # first-time: signed gateway on http://localhost:9088
ops/deploy.sh                  # rebuild + redeploy after code changes
```

Signing is conditional: a self-signed keystore is generated by the ops scripts; `./gradlew build` without signing properties produces an unsigned module.

### Tests

Unit tests use **Jest + ts-jest** (`web/jest.config.js`, `web/tsconfig.test.json`) and run in a plain node environment — all the non-trivial logic lives in pure, DOM-free modules. The suites cover: shared date/timezone math incl. DST resolution (`dateUtils`), recurrence expansion, label packs, the CSV serialiser (quoting + injection guard); picker logic + prop mapping; calendar grid/packing/gesture/editor logic (incl. recurring detach & series scope) + prop mapping; and timeline scale/tick/layout/gesture/editor logic + prop mapping, with a dedicated DST regression suite pinned on the 2026 US transitions. The React components' rendering isn't directly unit-tested — that's exercised via the live verification harness.

### Live verification

After changing a component, render it in a real Perspective session rather than trusting a gateway 200 — use `ops/verify/` (or the `/verify-component` skill). See [`ops/verify/README.md`](ops/verify/README.md).

### Accessibility

Every interactive surface is keyboard-reachable: toolbar/legend/navigator controls are real buttons, and events (calendar chips and time blocks, timeline bars and state bands, group headers) are focusable with a visible accent focus ring — **Enter/Space activates them like a click** (opens the editor / fires the event; dragging remains pointer-only). The built-in editors are `role="dialog"` (`aria-modal`), auto-focus their first field, and close on Escape. Full grid arrow-key navigation and keyboard drag are not implemented.

---

## Roadmap / deferred work

**Next components to build** (ranked by validated demand): see [`docs/component-ideas.md`](docs/component-ideas.md).

### Prop-schema versioning & migration (deferred)

**Status: not started — deliberately deferred until the component is in real use.**

Perspective serializes each instance's configured **prop values** into the view's JSON, not a live link to `props.json`. So when the schema changes across a module upgrade (a renamed or re-nested prop), old saved values are orphaned and the affected settings **silently reset to defaults**. During development that's a non-issue — the only instances are the few in `ops/verify/` and we just re-create them — but once real views are built on this component, the prop schema becomes a contract that can't be freely broken.

**Do this before a v1.0 release / first real deployment:**

1. **Freeze the schema** and stop renaming/re-nesting published props.
2. **Additive-only policy** thereafter — new props are optional with defaults (non-breaking); renames/moves require a converter.
3. **Versioned converters** — confirm the exact Perspective 8.3 SDK hook (component descriptor version + prop converter; verify via `javap`) and register migrations that rewrite old prop trees forward. As a cheaper interim, the reducer can read legacy paths as fallbacks.
4. **Document the policy** here and in `CLAUDE.md`.
5. ~~*(Optional)* a CI guard that flags a removed/renamed key in `props.json` versus the previous commit.~~ **Done:** `ops/schema-guard.sh`, wired into CI.

Until the component is actively used, breaking schema changes remain acceptable.
