# Mustry Solutions Ingots

An Ignition **8.3.6** module that adds custom [Perspective](https://www.inductiveautomation.com/) components, written as React/TypeScript module components. It ships thirteen components: a **Date/Time Range Picker**, a **Calendar / Scheduler**, a **Resource Timeline** (scheduling board), an editable **Data Grid**, a **Pan & Zoom View**, a **Rich Text Editor**, a **Code/JSON Editor**, a **Color Picker**, an **On-Screen Keyboard**, and the complete admin family: **Schedule Manager**, **Roster Manager**, **User Manager** and **Holiday Manager**.

- **Module ID:** `com.mustrysolutions.ingots`
- **Palette category:** `Mustry Solutions`

---

## Date/Time Range Picker

A Booking.com-style start/end date-time range picker. Component id `mustrysolutions.ingots.input.datetimerangepicker`.

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

A month / week / day / list calendar bound to a list of events. Component id `mustrysolutions.ingots.display.calendar`. Built from scratch (no FullCalendar / no third-party licence).

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

A scheduling board: resources (machines, lines, crews) as rows on a zoomable horizontal time axis. Component id `mustrysolutions.ingots.display.resourcetimeline`.

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

## Data Grid

An editable virtualized data grid. Component id `mustrysolutions.ingots.input.datagrid`.

### Features

- **Virtualized rendering** — fixed `config.rowHeight` makes row windowing exact; the client-side model is intended for up to ~50k rows (see `/grid-stress` in the verify project). Sticky header, one scroll container, **frozen (pinned) columns**.
- **Columns** (`config.columns`, rendered in array order) — each reads `field` from every row: `header`, `type` (`text`/`number`/`boolean`/`date`/`datetime`), `align`, `width`, `pin`, typed `format`, dropdown `options`, per-column `editable`, declarative validation (`required`/`min`/`max`/`pattern`) and **conditional styling** (`cellStyles` rules matched on the value).
- **Column gestures, two-way** — drag a header to reorder, drag its edge handle to resize, hide/show via the toolbar column chooser; the user's adjustments persist in `state.columnLayout`.
- **Read interactions, two-way** — `state.sort` (header click cycles asc → desc → off), `state.quickFilter` (case-insensitive contains across configured columns; instant local echo while the prop write round-trips), `state.selection` (`config.rowSelect`: `none` / `single` / `multi`, with Ctrl/Cmd-toggle and Shift-range over the *visible* view). CSV export of the current view (filtered + sorted, configured columns).
- **Controlled editing** (`config.editable` + per-column `editable`) — double-click/Enter/F2/typing opens a **typed editor** (text, decimal, date, datetime-local, dropdown-in-cell; booleans render as live checkboxes). Validation runs before commit; Escape reverts. The grid **never mutates `data.rows`**: a commit fires `onCellEdit` (old/new value + full row) and overlays the value as *pending* until your write-back rebinds the rows.
- **Batch mode** (`config.editMode: 'batch'`) — edits accumulate as dirty cells (italic + dot + "{n} unsaved" badge, `output.dirtyCount`); **Save fires one `onBatchSave`** with every dirty cell and each changed row, Discard reverts them all.
- **Excel range paste** — paste a TSV range from a spreadsheet onto the focused cell; each landing cell validates individually.
- **Aggregate footers** — per-column `aggregate` summarised over the current view.
- **Keyboard model** — arrows move the focused cell, Enter/Tab commit + move, Escape reverts.
- **Add / delete rows** — toolbar buttons (`config.allowAdd` / `config.allowDelete`) fire `onRowAdd` / `onRowsDelete`; you create/delete and rebind.
- Empty-state badge (`config.emptyMessage`), loading bar (`config.loading`), localization (same 7 languages via `config.locale` + `config.labels` overrides).

### How editing works

Same philosophy as the calendar/timeline: **controlled, read-from-data**. Committed edits overlay the display (`pending`) and clear as soon as any `data.rows` change arrives — your `onCellEdit`/`onBatchSave` script persists and rebinds; the demo at `/grid` in the verify project ships a complete write-back script for both modes.

### Theming

Override the `--dg-*` variables via a style class / project stylesheet: `--dg-accent`, `--dg-text`, `--dg-muted`, `--dg-border`, `--dg-line`, `--dg-bg`, `--dg-head-bg`, `--dg-row-odd`.

> Manual test checklist: [`docs/grid-manual-test.md`](docs/grid-manual-test.md).

---

## Pan & Zoom View

Embeds any Perspective view and navigates it like a map. Component id `mustrysolutions.ingots.display.panzoomview`.

### Features

- **Embed any view** — `config.viewPath` + `config.viewParams` (`[{name, value}]`); the embedded view stays **fully interactive** (clicks inside it survive pan/zoom gestures). `output.viewState` reports `loading` / `valid` / `notFound` / `error` / `access-denied`.
- **Map-feel navigation** — drag to pan with inertia glide on release, iOS-style rubber-band overpan with spring-back at the bounds, wheel zoom toward the cursor (`config.wheelZoom`, proportional for trackpad pinches), double-click zoom (`config.doubleClickZoom`), **pinch zoom on touch** (one finger hands over to two and back), and +/−/home/fit controls with `config.locale` tooltips (`config.showControls`).
- **Scriptable viewport, two-way** — `state.zoom` / `state.center` (content coordinates): write either from a script or binding and the viewport **animates there** over `config.flyToMs` (log-space easing). `config.home` is the reset target and initial position; zoom is clamped to `config.minZoom`/`maxZoom`.
- **POIs** (`data.pois`) — named fly-to targets: write a name to `state.target` to fly there (the component clears it back to `''`), or pick from the **"Go to…" dropdown** (`config.showPoiList`). Off-screen POIs show **edge indicators**; clicking one flies to it.
- **Minimap** (`config.showMinimap`) — corner overview with a draggable view rectangle and POI dots; hides itself while the whole content fits.
- **Auto content size** — `config.contentWidth`/`contentHeight` set the coordinate space; `0` (default) measures the embedded view automatically.

### Theming

Override the `--pz-*` variables via a style class / project stylesheet: `--pz-accent`, `--pz-alert`, `--pz-text`, `--pz-muted`, `--pz-border`, `--pz-bg`, `--pz-canvas`.

> Manual test checklist: [`docs/panzoom-manual-test.md`](docs/panzoom-manual-test.md).

---

## Rich Text Editor

True WYSIWYG editing — and safe read-only display — of rich text: operator instructions, SOPs, shift notes, work orders. Component id `mustrysolutions.ingots.input.richtexteditor`. Built on TipTap core (vanilla, no React binding).

### Features

- **Two modes, one component** — `config.mode: 'edit'` is the full editor (toolbar, dirty badge, Save); `'display'` renders the same document read-only with clickable links: the safe way to *show* rich content anywhere (native Markdown can't render arbitrary HTML safely).
- **Controlled write-back** — `data.content` (HTML) is the bound truth. Edits stay a local draft (dirty badge, grid batch semantics) until **Save fires `onSave`** `{content, plainText, wordCount}`; your script persists and rebinds, and the round-trip clears the dirty state. Discard returns to the bound value; external changes while dirty keep the draft.
- **Sanitization is the schema** — only allowlisted node/mark types can exist in the document: unknown markup (scripts, event handlers) is dropped on parse, link hrefs pass a protocol allowlist (`http/https/mailto/tel`; `javascript:`/`data:` rejected), image sources additionally allow `data:image/*`.
- **Formatting allowlist** (`config.features`) — bold/italic/underline/strike, H1–H3, bullet/numbered lists, links, **tables** (insert 3×3 with header; contextual add-row/add-column/delete while inside one), **images** (by URL, or pasted as data URIs capped by `config.maxImageKb`), **checklists**. A disabled feature disappears from the toolbar *and* the schema.
- **Interactive checklists in display mode** — operators check off steps of the displayed procedure; each toggle fires **`onTaskToggle`** (same payload as `onSave`) so one write-back script keeps the state.
- **Undo/redo** — toolbar buttons (touch-friendly) plus Ctrl+Z/Ctrl+Y; bound-content arrivals are history-exempt, so undo can never blank the document.
- **Image library picker** — bind `data.imageLibrary` (`[{label, src}]`) to offer a dropdown of known images; gateway Image Management paths (`/system/images/...`) work directly and stay session-authenticated.
- **Font allowlist** (`config.fonts`, default off) — list the families operators may apply (e.g. a monospace for part numbers); display mode always renders saved fonts.
- `config.charLimit` (0 = unlimited) enforced while typing; `config.placeholder`; localization (same 7 languages + `config.labels` overrides); print stylesheet (toolbar and chrome drop out).
- **Outputs**: `output.isDirty`, `output.plainText` (for DB search/indexing), `output.wordCount`, `output.charCount` — updated on save/rebind, not per keystroke.

### How editing works

Same philosophy as every component in this module: **controlled, read-from-data**. The editor never mutates `data.content`; `onSave`/`onTaskToggle` fire and your handler writes back. The demo at `/rte` in the verify project ships both handlers (three lines each) and a display instance bound to the same value.

### Theming

Override the `--rte-*` variables via a style class / project stylesheet: `--rte-accent`, `--rte-accent-text`, `--rte-text`, `--rte-muted`, `--rte-border`, `--rte-bg`, `--rte-toolbar-bg`.

---

## Code / JSON Editor

A CodeMirror-6-based code editor — and read-only viewer — for structured text: JSON config blobs, SQL, Python snippets, XML. Component id `mustrysolutions.ingots.input.codeeditor`.

### Features

- **Languages** (`config.language`) — `json` / `python` / `sql` / `xml` / `text`, with syntax highlighting driven by CSS variables so every Perspective theme restyles it.
- **Live JSON validation** — parse errors mark the gutter, an "Invalid JSON" badge appears while the draft is broken, and `output.isValid` / `output.errorMessage` describe the bound document — **gate your commit button on `output.isValid`** and config-driven apps stop accepting broken configs.
- **Controlled write-back** — the same model as every editor in this module: `data.code` is the bound truth, edits are a local draft (dirty badge) until **Save fires `onSave`** `{code, isValid, errorMessage}`; the round-trip clears dirty, Discard reverts, external changes while dirty keep the draft.
- **Editor comforts** — line numbers + **code folding**, bracket matching, auto-indent, search (Ctrl+F), selection-match highlighting, undo/redo buttons (bound-content arrivals are history-exempt), **Format JSON** (pretty-print at `config.tabSize`).
- **`mode: 'display'`** — a read-only structured-data viewer with folding and search; `config.lineWrapping`, `config.placeholder`, `output.lineCount`; labels in the same 7 languages.

### Theming

Override the `--code-*` variables via a style class / project stylesheet: chrome (`--code-accent`, `--code-text`, `--code-muted`, `--code-border`, `--code-bg`, `--code-toolbar-bg`, `--code-gutter-bg`, `--code-active-line`, `--code-error`) and the syntax palette (`--code-property`, `--code-string`, `--code-number`, `--code-keyword`, `--code-comment`, `--code-function`, `--code-type`).


---

## Color Picker

A colour input for the runtime — the piece Perspective has only at design time (the property-editor colour selector). Component id `mustrysolutions.ingots.input.colorpicker`.

### Features

- **HSV selection** — a saturation/value area plus hue and (optional) alpha bars, dragged continuously; the working colour keeps its hue while passing through greys and black.
- **Formats** (`config.format`) — `hex` / `rgb` / `hsl`, switchable at runtime from a segmented toggle. Parses any `#hex` (3/4/6/8-digit), `rgb()/rgba()` or `hsl()/hsla()` string typed into the field; `config.showAlpha` adds the alpha channel (`#RRGGBBAA` / `rgba()`).
- **Three presentations** — `config.mode: inline` gives the full panel in place; `config.mode: popover` with `config.showInput: true` is a swatch + hex/rgb/hsl field that opens the panel; `config.mode: popover` with `config.showInput: false` is a compact icon button. Popover triggers carry an eyedropper glyph (contrast-aware over the current colour) so they clearly read as a control; the panel is portalled, flips on overflow, and closes on outside-click / Escape. `config.popoverScrim` (off by default) dims the page behind an open popover so it stands out over busy content.
- **Swatches & recent** — a **bound** palette (`data.swatches`) of quick picks plus a per-session recent-colours row; `config.showSwatches` / `config.showRecent`.
- **Eyedropper** (`config.showEyedropper`) — sample any on-screen pixel where the browser supports the [EyeDropper API](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper) (Chromium); hidden otherwise.
- **Controlled write-back** — `value.color` is the bound truth; a pick fires **`onChange`** `{value, hex, rgb, hsl, alpha}` and the author's script persists it (same model as the editors). Read-only `output.*` mirror the bound colour: `output.hex`, `output.rgb`, `output.hsl`, `output.alpha`, `output.isValid`. Labels in the same 7 languages.

### Theming

Override the `--cp-*` variables via a style class / project stylesheet: `--cp-accent`, `--cp-text`, `--cp-muted`, `--cp-border`, `--cp-bg`, `--cp-field-bg`, `--cp-error`, and the alpha-checkerboard tiles `--cp-check-a` / `--cp-check-b`.


---

## On-Screen Keyboard

A touch keyboard for the runtime — the piece Perspective leaves to the OS keyboard (Windows TabTip, Linux Squeekboard), which fails in Perspective Browser/mobile and causes the "double-keyboard" problem. Component id `mustrysolutions.ingots.input.keyboard`.

### Features

- **No OS keyboard** — the value display is a **`<div>`, not an `<input>`**, so tapping it never summons the operating system's on-screen keyboard. This is the core edge over the [Exchange keypad views](https://inductiveautomation.com/exchange/2380/overview), whose documented workaround is "don't use real input fields."
- **Numeric keypad** (`config.layout: numpad`) — edits `value.value` (number): `config.min`/`max` with `enforceRange` clamping + an out-of-range badge, `config.decimals`, `config.units` suffix, `allowNegative`. Setpoint-style entry (the first key starts fresh).
- **QWERTY keyboard** (`config.layout: text` / `email` / `url`) — edits `value.text` (string): one-shot shift, a `?123` symbols/numbers layer, `config.maxLength`; email/url add `@`, `.com`, `/` convenience keys.
- **Inline or popover** (`config.mode`) — the keyboard in place, or a field trigger (with a keyboard glyph + `config.placeholder`) that opens it in a portalled panel; Enter commits **and** closes, outside-click / Escape discards.
- **Controlled write-back** — Enter fires **`onCommit`** `{value, text, isValid}` (`value` is a number for numpad, a string for text) and writes `value.value` / `value.text`; live `onChange` `{draft, value}` on every key (`config.liveUpdate` also writes live). Read-only `output.*`: `value`, `text`, `isValid`, `length`, `draft`. 7-language labels. All editing rules are pure + node-tested.

### Theming

Override the `--kbd-*` variables via a style class / project stylesheet: `--kbd-accent` / `--kbd-accent-text`, `--kbd-text`, `--kbd-muted`, `--kbd-border`, `--kbd-bg`, `--kbd-key-bg`, `--kbd-key-active`, `--kbd-error`.


---

## Schedule Manager

A runtime UI over the gateway's **user schedules** — Vision's Schedule Management component, which Perspective lacks (the Ideas-portal "Admin Components" request has been open since 2019; only copy-in Exchange view templates fill the gap). First of the planned **admin family** (see [`docs/admin-components-plan.md`](docs/admin-components-plan.md)). Component id `mustrysolutions.ingots.admin.schedulemanager`.

### Features

- **Master-detail** — a schedule list (live *active-now* dots) plus a 7-day week grid where availability is painted as blocks; a red now-line marks the current time in today's column. `config.dayStartHour`/`dayEndHour` clip the axis, `config.firstDayOfWeek` orders it.
- **Paint editing** (`config.editable`) — drag empty grid space to add an availability range (snapped to `config.snapMinutes`), drag a block's top/bottom edge to resize, click a block to remove. Name (rename), description and the *All days* / *Observes holidays* flags edit inline; `+ New schedule` (`config.allowCreate`) starts a blank draft; Delete (`config.allowDelete`) asks twice.
- **Draft discipline** — edits are draft-only with the shared Save/Discard tail; a polling binding never clobbers an in-progress draft; name validation (required/unique) blocks Save and surfaces in `output.validationErrors`.
- **Preview strip** — answers "active now? until when?": *Active now — until Fri 17:00* / *Inactive — next Mon 8:00*, re-evaluated every 30s (also exposed as `output.isActiveNow`). Midnight-touching ranges count as continuous; weekly wrap-around is handled.
- **Controlled write-back** — `data.schedules` is a **flat mirror of Ignition's `BasicScheduleModel`** (per-day enabled flags + 24h range strings), typically bound via a script transform over `system.user.getSchedules()`. Save fires **`onScheduleSave`** `{schedule, isNew, oldName?}` and Delete fires **`onScheduleDelete`** `{name}`; the author's script persists via `system.user.addSchedule` / `editSchedule` / `removeSchedule` and refreshes the binding (the `/schedule` demo ships reference scripts, including the rename add-then-remove dance). Read-only `output.*`: `count`, `isDirty`, `isActiveNow`, `validationErrors`. Labels in the same 7 languages.
- **Deliberate limits (pre-1.0)** — alternating A/B schedules render week A and show a badge but aren't editable (the A/B bean layout is unverified; flipping it blind could corrupt saves); composite schedules and holiday calendars render as plain read-only entries.

### Theming

Override the `--adm-*` variables via a style class / project stylesheet (shared by the whole admin family): `--adm-accent` / `--adm-accent-soft`, `--adm-text`, `--adm-muted`, `--adm-border`, `--adm-bg`, `--adm-panel-bg`, `--adm-active`, `--adm-danger`.


---

## Roster Manager

A runtime UI over the gateway's **alarm-notification rosters** — Vision's Roster Management, which Perspective lacks. Second of the **admin family** (see [`docs/admin-components-plan.md`](docs/admin-components-plan.md)). Component id `mustrysolutions.ingots.admin.rostermanager`.

### Features

- **Order is the point** — a roster is the escalation sequence alarm pipelines walk, so rows carry *Contact 1 / Contact 2 / …* ordinals and reorder by **dragging a row's grip**.
- **Typeahead directory picker** (`+ Add user`) over the bound `data.availableUsers` directory; rows resolve display names and contact points from it, and **warn when a user has no contact info** — the failure mode roster admins are actually hunting.
- **Create / delete** (`config.allowCreate` / `allowDelete`), draft-only edits with the shared Save/Discard tail, name validation, `output.count` / `isDirty` / `validationErrors`, two-way `state.selectedRoster`. Labels in the same 7 languages, `--adm-*` family theming.
- **Controlled write-back** — `system.roster` is **append-only** (no reorder primitive), so Save fires **`onRosterSave`** `{name, users, isNew}` with the FULL desired ordered list and the author's script reconciles: `createRoster` when new, `removeUsers(current)`, then `addUsers(users)` in order. Delete fires **`onRosterDelete`** `{name}`. The `/roster` demo ships the reconcile script and seeds a demo directory.

### Theming

The shared admin-family `--adm-*` variables (see Schedule Manager).


---

## User Manager

A runtime UI over a gateway **user source** — Vision's User Management, which Perspective lacks. Third and final component of the **admin family** (see [`docs/admin-components-plan.md`](docs/admin-components-plan.md)). Component id `mustrysolutions.ingots.admin.usermanager`.

### Features

- **Master-detail** — a filterable user rail (client-side typeahead over username/name) and a detail form editing first/last name, schedule (dropdown from `data.availableSchedules`), language, notes, **role chips** (from `data.availableRoles`) and **contact-info rows** (email/sms/phone type + value, add/remove).
- **Role-catalog management, opt-in** — `config.allowRoleManagement` (default **off**) adds a manage mode to the Roles section: add, inline-rename and two-step-delete roles, firing **`onRoleSave`** `{name, oldName?}` / **`onRoleDelete`** `{name}` immediately (persist via `system.user.addRole`/`editRole`/`removeRole`). Renames keep user assignments — the source stores role ids — but security policies reference roles **by name**, which the UI warns about.
- **Passwords are opt-in and payload-only** — `config.allowPasswordChange` (default **off**) reveals a staged-password field; the value travels ONLY in the `onUserSave` payload, never through props, state or `output.*`. Put the component behind Perspective security levels and TLS before enabling.
- **Create / delete** (`config.allowCreate` / `allowDelete`) with username validation; draft-only edits with the shared Save/Discard tail; `output.count` / `isDirty` / `validationErrors`; two-way `state.selectedUser`. Labels in the same 7 languages, `--adm-*` family theming.
- **Availability adjustments** — per-user schedule overrides (vacation, extra on-call cover) edited as rows (from/until instants, available toggle, note) inside the detail form; partially filled or inverted rows block Save (`'adjustmentInvalid'` in `output.validationErrors`); persisted wholesale via `system.user.createScheduleAdjustment` in the reference script.
- **Read-only degrade** — AD/LDAP-backed sources can't be written through `system.user`; set `config.editable: false` and the component becomes a directory viewer (it cannot detect writability itself).
- **Controlled write-back** — `data.users` mirrors PyUser (bind via `system.user.getUsers()`); Save fires **`onUserSave`** `{user, isNew, password?}` and Delete fires **`onUserDelete`** `{username}`; the author's script persists via `system.user.addUser`/`editUser`/`removeUser`. The `/users` demo ships reference scripts (including the roles/contacts wholesale rebuild and a guard that refuses to delete `admin`) — note the user source's password complexity policy applies to staged passwords.

### Theming

The shared admin-family `--adm-*` variables (see Schedule Manager).

---

## Holiday Manager

A runtime UI over the gateway's **holiday list** — the missing quarter of the schedule story: schedules can *observe holidays* (they're inactive on those dates), but nothing in the runtime showed or edited which dates those are. Fourth component of the **admin family**. Component id `mustrysolutions.ingots.admin.holidaymanager`.

### Features

- **Master-detail** — a rail sorted by **next occurrence** (annual repeats compute their next date, Feb-29 repeats observe Feb 28 off-leap-years, past one-offs sink and dim with a *past* badge) and a small detail form: name (rename via `oldName`), date, repeat-annually.
- **Strict date validation** — calendar-checked `YYYY-MM-DD` (no silent Date-object rollover of Feb 31 into March); an invalid or missing date blocks Save and surfaces in `output.validationErrors`.
- **Create / delete** (`config.allowCreate` / `allowDelete`), draft-only edits with the shared Save/Discard tail, two-way `state.selectedHoliday`, `output.count` / `isDirty` / `validationErrors`. Labels in the same 7 languages, `--adm-*` family theming.
- **Controlled write-back** — `data.holidays` mirrors Ignition's `HolidayModel` (bind via `system.user.getHolidays()`); Save fires **`onHolidaySave`** `{holiday, isNew, oldName?}` and Delete fires **`onHolidayDelete`** `{name}`; the author's script persists via `system.user.addHoliday`/`editHoliday`/`removeHoliday`. The `/holidays` demo ships the reference scripts; the Admin Console gains a fourth tab.

### Theming

The shared admin-family `--adm-*` variables (see Schedule Manager).

### Composing an Admin Console

The three admin components are deliberately separate — tabs and page routing are the platform's job, and page-level **security levels** are the robust boundary between "can edit shift schedules" and "can edit users". To get a single admin panel, compose them in a native **Tab Container** and use each component's capability flags (`editable`, `allowCreate`, `allowDelete`, `allowPasswordChange`, `allowRoleManagement`) to dial each tab. The committed [`AdminConsole` view](ops/verify/project/com.inductiveautomation.perspective/views/AdminConsole) (route `/admin` in the verify project) is the reference: all four components live in tabs, sharing one refresh tick so a save in one tab refreshes the others.


---

## Project layout

| Path | Scope |
|---|---|
| `common/` | Component descriptors (one `Components.ALL` registry) + the props/event JSON schemas (`src/main/resources`). |
| `gateway/` | Gateway hook (registers components, mounts web resources). |
| `designer/` | Designer hook (registers components in the Designer). |
| `web/` | React/TypeScript front-end + styles, built by webpack (production bundle by default). |
| `e2e/` | Playwright smoke suite rendering every component in a live session — run via `ops/e2e.sh`. |
| `ops/` | Local dev gateway (Docker) + scripts — see [`ops/README.md`](ops/README.md). |
| `ops/verify/` | Committed Perspective "verify" project (demo views per component) — see [`ops/verify/README.md`](ops/verify/README.md). |
| `docs/` | Manual-test checklists (deep gesture/touch flows the e2e suite doesn't automate). |

---

## Build, test, deploy

Requires JDK 17 (`JAVA_HOME`). Node 18.20.4 is downloaded automatically by the build.

```bash
# Build the signed-or-unsigned .modl (web bundle + Java).
# The web bundle is a production webpack build (minified, no source maps);
# add -PwebDev for an unminified development bundle with source maps.
./gradlew build

# Run the TypeScript unit tests (also part of `gradlew check` / `build`)
./gradlew :web:jestTest        # or: cd web && npm test

# Local dev gateway + deploy (see ops/README.md)
ops/setup.sh                   # first-time: signed gateway on http://localhost:9088
ops/deploy.sh                  # rebuild + redeploy after code changes
```

Signing is conditional: a self-signed keystore is generated by the ops scripts; `./gradlew build` without signing properties produces an unsigned module.

**Releases** are tag-driven (push `vX.Y.Z` → CI builds, signs, and publishes a GitHub Release with the `.modl`). Contributions go through PRs into `main` with required CI. See [`RELEASING.md`](RELEASING.md).

### Tests

Unit tests use **Jest + ts-jest** (`web/jest.config.js`, `web/tsconfig.test.json`) and run in a plain node environment — all the non-trivial logic lives in pure, DOM-free modules. The suites cover: shared date/timezone math incl. DST resolution (`dateUtils`), recurrence expansion, label packs, the CSV serialiser (quoting + injection guard); picker logic + prop mapping; calendar grid/packing/gesture/editor logic (incl. recurring detach & series scope) + prop mapping; and timeline scale/tick/layout/gesture/editor logic + prop mapping, with a dedicated DST regression suite pinned on the 2026 US transitions.

Rendering is covered by the **Playwright e2e smoke suite** (`e2e/`, run via `ops/e2e.sh`): each spec opens a route of the committed verify project in a real Perspective session, asserts the component mounts and behaves (preset write-back, view switch, group collapse, quick filter, 50k-row virtualization, embedded-view interactivity, fly-to), and fails on any console error. CI runs it on every push against a freshly bootstrapped gateway (`ops/e2e.sh --fresh`). The manual checklists in `docs/*-manual-test.md` remain for the deep gesture/editor flows that need a human hand.

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
