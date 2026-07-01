# Calendar component — manual test checklist

A hands-on checklist for the Calendar / Scheduler (`mustrysolutions.display.calendar`).
Drop the component on a view, then work through the sections. The pure logic (grid,
packing, recurrence, gesture math) is unit-tested; this list covers the things only a
human can judge — rendering, interaction, and the binding contract.

## Setup

Paste this into `config.data.events` (dates are around June 2026 — adjust to a month
you can see, or to today's month). It exercises single, multi-day, recurring,
background, and overlapping events:

```json
[
  { "id": "1", "title": "Standup", "start": "2026-06-01T09:00:00", "end": "2026-06-01T09:30:00", "color": "#0c7bb3",
    "rrule": { "freq": "weekly", "byweekday": [1, 3, 5], "until": "2026-06-30" } },
  { "id": "2", "title": "Safety review", "start": "2026-06-15", "allDay": true, "color": "#e67e22",
    "rrule": { "freq": "monthly" } },
  { "id": "3", "title": "Audit", "start": "2026-06-22", "end": "2026-06-25", "allDay": true, "color": "#27ae60" },
  { "id": "4", "title": "Inspection", "start": "2026-06-24T10:00:00", "end": "2026-06-24T11:00:00", "color": "#0c7bb3" },
  { "id": "5", "title": "Design review", "start": "2026-06-24T10:15:00", "end": "2026-06-24T11:15:00", "color": "#e67e22" },
  { "id": "6", "title": "Maint downtime", "start": "2026-06-24T02:00:00", "end": "2026-06-24T05:00:00", "color": "#fbd5d5", "display": "background" }
]
```

> **Important — how to "add" an event.** The calendar **never changes
> `config.data.events` itself**; it's controlled. Editing gestures only *fire events*.
> To add: set `config.selectable = true`, add an **`onSelect`** event handler that
> appends to / persists the event, then update `config.data.events`. If you drag and
> "nothing sticks", that's expected until a handler writes it back.

## Ready-made working demo

A complete, **working** example view (editable calendar with the write-back handlers
already wired) lives in the dev project at:

```
ops/verify/project/com.inductiveautomation.perspective/views/CalendarDemo/
```

- **In the dev gateway** it's served at `http://localhost:9088/data/perspective/client/verify/demo`.
- **To use it in your own project:** copy that `CalendarDemo/` folder into your
  project's `com.inductiveautomation.perspective/views/` directory, then open the
  `CalendarDemo` view in the Designer (Preview mode). Drag empty time to create,
  drag an event to move, drag its bottom edge to resize — and the changes stick.

**How it works (the whole trick):**

1. The calendar renders `config.data.events`.
2. The demo has `builtInEditor = true`, so creating (drag empty time) and clicking an
   event open a built-in editor popup; and it wires a **single `onChange`** script
   that fires for **every** mutation (create / edit / delete / move / resize) with
   `{ action, event }`. The script upserts-or-deletes by `id` into
   `self.props.data.events`.
3. Because `data.events` changed, the calendar **re-renders** and the change appears.

That's the entire pattern: *the component asks "what changed?", your script decides
"what to store", and the calendar just displays whatever's in `data.events`.* In
production you'd write to a database and re-query instead of mutating the prop, but
the loop is identical.

> `onChange` is the one place to persist **and** to **trigger downstream logic**
> (notify, refresh, audit). The only other events are the *intent* events —
> `onSelect` (drag empty range) and `onEventClick` (click an event) — which you use
> when you build your own editing UI instead of the built-in editor.

## Why "nothing happens" when I drag / create (read this first)

The gestures **do** fire — verified in a live session: dragging or resizing an event
fires `onChange`, dragging empty time fires `onChange` (built-in editor) or `onSelect`,
all with correct payloads. If it *looks* like nothing happens, it's one of two things:

1. **You're in the Designer's design/edit mode.** There, mouse drags select and move
   the *component*, not its contents. Switch to **Preview mode** (or open a real
   session) to interact with the calendar.
2. **It's a controlled component** — it never edits `config.data.events` itself. A
   move/resize visually **snaps back**, and a create adds **nothing**, until *you*
   handle the event and write the change back into your data.

### Write-back recipes (paste into the component's event config in the Designer)

Select the calendar → **Events** → add the component event → **Script** action.
These mutate `data.events` directly (simplest for testing; in production you'd
persist to a DB and re-query instead). Requires `config.editable` / `config.selectable`.

**`onChange`** — the single handler for every mutation (create / edit / delete / move /
resize), including recurring-event **scope**. The payload is
`{ action, event, scope?, seriesId?, occurrenceDate? }`:

- no `scope` → a plain event: upsert / delete by `event.id`.
- `scope = "series"` → the whole series: upsert / delete by `seriesId` (the event carries the rule).
- `scope = "occurrence"` → one instance: add `occurrenceDate` to the series' `rrule.exdate`, then upsert (edit) or drop (delete) a standalone **override** event.

```python
ev = event.event
action = event.action
scope = getattr(event, "scope", None)
seriesId = getattr(event, "seriesId", None)
occDate = getattr(event, "occurrenceDate", None)
events = [dict(e) for e in self.props.data.events]

def idx_of(eid):
    for i in range(len(events)):
        if events[i].get("id") == eid:
            return i
    return -1

def row_from(e):
    return {"id": e.id, "title": e.title, "start": e.start, "end": e.end,
            "allDay": e.allDay, "category": e.category,
            "description": e.description, "rrule": getattr(e, "rrule", None)}

def upsert(row):
    i = idx_of(row.get("id"))
    if i >= 0: events[i] = row
    else: events.append(row)

def add_exdate(sid, d):
    i = idx_of(sid)
    if i < 0: return
    base = dict(events[i]); rr = dict(base.get("rrule") or {})
    ex = list(rr.get("exdate") or [])
    if d not in ex: ex.append(d)
    rr["exdate"] = ex; base["rrule"] = rr; events[i] = base

if scope == "occurrence":
    add_exdate(seriesId, occDate)
    if action == "delete":
        events = [e for e in events if e.get("id") != ev.id]
    else:
        upsert(row_from(ev))
elif scope == "series":
    if action == "delete":
        events = [e for e in events if e.get("id") != seriesId]
    else:
        upsert(row_from(ev))
else:
    if action == "delete":
        events = [e for e in events if e.get("id") != ev.id]
    else:
        upsert(row_from(ev))
self.props.data.events = events
```

**`onSelect`** — only if you skip the built-in editor and create with your own UI
(a dragged-out range gives you `start` / `end`; you assign an id and append):

```python
events = list(self.props.data.events)
events.append({
    "id": "evt-" + str(system.date.toMillis(system.date.now())),
    "title": "New event",
    "start": event.start,
    "end": event.end
})
self.props.data.events = events
```

## Month view

- [ ] Renders the current month; today has an accent circular badge; other-month days dimmed.
- [ ] `weekStart` = monday vs sunday shifts the columns and weekday headers.
- [ ] `showWeekends = false` hides Sat/Sun (5-day weeks).
- [ ] Events show as coloured chips on the right day(s); `color` is honoured.
- [ ] A day's cell **auto-fits** as many event chips as its height allows, then shows a **"+N more"** line (resize the component / row → the count adjusts).
- [ ] Clicking **"+N more"** (or the **date number**) opens a popover listing **all** that day's events; clicking one opens/edits it; click-outside / Esc closes it.
- [ ] Multi-day all-day events render as one **continuous spanning bar** across their days (22/23/24, **not** 25 — exclusive end), not separate per-day chips; overlapping bars stack on lanes.
- [ ] In **week/day** view, a multi-day all-day event is a single spanning bar in the **all-day strip**; an overnight timed event shows on both days (start day → bottom, next day top → end) with dashed continuation edges.
- [ ] Prev / next / **Today** navigate months; the title updates.
- [ ] `output.visibleStart` / `visibleEnd` update on navigation (check the props).

## Recurrence

- [ ] Weekly "Standup" appears on **Mon/Wed/Fri** through June, then stops (after `until`).
- [ ] Monthly "Safety review" lands on the 15th; navigate months → it follows.
- [ ] Switch a rule to `daily` with `interval` / `count` and confirm spacing & cap.
- [ ] `yearly` keeps the month/day (Feb 29 only lands in leap years).
- [ ] Recurrence shows consistently in **month, week, and list** views.

### Creating & editing recurring events (built-in editor)

- [ ] **Create:** the editor's **Repeat** control offers Daily/Weekly/Monthly/Yearly + "every N" + (weekly) a weekday picker + Ends Never/On-date/After-N. Saving produces an event with an `rrule`; the occurrences appear.
- [ ] **Open an occurrence:** the editor shows an **apply-to** choice (*This event* / *All events*) and recovers the series' rule (visible under *All events*).
- [ ] **This event** (edit): only the opened day changes; it detaches into a standalone override and the series skips that date (via `rrule.exdate`). Others are unchanged.
- [ ] **All events** (edit): every occurrence updates (title/time/category/rule); the series keeps its anchor date; previously-detached overrides are left alone.
- [ ] **Delete → This event:** only that occurrence disappears (exdate); the rest remain.
- [ ] **Delete → All events:** the whole series goes.
- [ ] **Drag/resize one occurrence:** detaches it (override + exdate), like "This event".
- [ ] These rely on the write-back honouring `event.scope` / `seriesId` / `occurrenceDate` — see the recipe below and the working demo view.

## Week / Day views

- [ ] Toolbar switches Month / Week / Day / List; the title adapts (range vs single day).
- [ ] Time axis labels; the grid auto-scrolls to `scrollToHour`.
- [ ] With `scrollToNow = true`: on open / view-switch / **Today**, the grid centres on the current time when today is in view; on other weeks it falls back to `scrollToHour`.
- [ ] `dayStartHour` / `dayEndHour` bound the visible hours.
- [ ] `slotMinutes` (e.g. 15) draws faint sub-hour gridlines between the bold hour lines, makes the grid taller/scrollable, and snaps drag/create/resize to that resolution; `60` = the classic hour grid (unchanged). Hour labels stay hourly. Invalid values fall back to 60.
- [ ] Timed events sit at the right time and height; **overlapping events split into side-by-side lanes** (Inspection + Design review on the 24th).
- [ ] All-day events appear in the top **all-day strip**; multi-day spans it.
- [ ] A **now-indicator** (red line) shows on today's column.
- [ ] With `refreshSeconds > 0` (e.g. 60), the now-indicator ticks down on its own over time (the calendar re-renders on that interval) without changing the scroll position.
- [ ] Background "Maint downtime" renders as a translucent band **behind** events (02:00–05:00).
- [ ] Day view shows a single column for the cursor day; nav steps by one day.

## Editing (set `config.editable = true`)

- [ ] Hovering an event shows a grab cursor; a resize handle sits at its bottom edge.
- [ ] **Drag** an event — a ghost follows, snapping to 15 min; release fires `onChange` (`action = "move"`).
- [ ] Drag across day columns changes the day in the payload (`event.start`).
- [ ] **Resize** from the bottom edge changes the end; release fires `onChange` (`action = "resize"`).
- [ ] Because it's controlled, the event **snaps back** on release unless your handler writes back.
- [ ] A plain **click** (no drag) fires `onEventClick` — **unless** `builtInEditor` is on, where it opens the editor (see below).

## Touch (⚠️ must be verified on a real touch device — not just desktop/emulation)

Gestures use Pointer Events + `touch-action`, so mouse and touch share one path. On a tablet:
- [ ] **Drag an event** with a finger → it moves (doesn't scroll the grid).
- [ ] **Drag the bottom edge** (enlarged to ~18px on coarse pointers) → it resizes.
- [ ] **Tap an event** → opens the editor / fires `onEventClick`.
- [ ] **Tap empty time** → opens the create editor (or fires `onDateClick`/`onSelect`).
- [ ] **Vertical drag on empty time → the grid SCROLLS** (drag-to-create is disabled on touch; a `pointercancel` aborts the gesture). No create rectangle should appear or stick.
- [ ] Mini-nav / day-popover / editor **close on an outside tap**.
- [ ] No stuck gesture, no "scroll steals the drag," no accidental create while scrolling.

## Built-in editor: edit & delete (set `config.editable = true` + `config.builtInEditor = true`)

- [ ] **Click an event** — the editor opens **pre-filled** ("Edit event" header, title/start/end/category/notes populated, the event's category pre-selected). The **Category** field appears only when `config.categories` are defined; the colour follows the category.
- [ ] Change a field and **Save** — fires `onChange` (`action = "edit"`); with the demo's write-back the event **updates in place** (no duplicate).
- [ ] **Delete** removes the event — fires `onChange` (`action = "delete"`); with write-back it disappears.
- [ ] Move/resize an event — fires `onChange` (`action = "move"` / `"resize"`).

## Selecting / creating (set `config.selectable = true`)

- [ ] **Drag over empty time** shows a selection box; release fires `onSelect` (or, with `builtInEditor`, opens the editor → **Create** fires `onChange` `action = "create"`).
- [ ] Clicking empty time (no drag) fires `onDateClick`.
- [ ] Wire `onChange` (or `onSelect`) to update `config.data.events` → the new event appears.

## Categories, icons & status

- [ ] Define `config.categories` with `icon` (e.g. `material/build`) → events of that category show the icon (in the category colour) on every view, and the legend shows it.
- [ ] An event with `status: "tentative"` renders striped/faded; `"done"` / `"cancelled"` render struck-through + dimmed; unset renders normal.
- [ ] Icons + status appear consistently across month bars, week/day blocks, the all-day strip, the day-overflow popover, the list view, and the hover popover.

## CSV export

- [ ] Set `config.showExport = true` → a download button appears in the toolbar.
- [ ] Clicking it downloads `calendar-events.csv` with a header row + one row per loaded event (id, title, start, end, allDay, category, status, color, description, rrule).
- [ ] Fields with commas / quotes / newlines are quoted/escaped correctly.

## Theming & i18n

- [ ] Set a project-stylesheet rule `.mustry-calendar { --cal-accent: #2e7d32; }` → accents change.
- [ ] Switch the gateway between a light and a dark Perspective theme → text/border/background follow.
- [ ] Set `config.locale` (e.g. `nl-NL`, `fr-FR`) → month / weekday / time labels localise.

## Layout & edge cases

- [ ] Resize the component small/large → month grid fills; week/day grid scrolls.
- [ ] Empty `events` (nothing configured) → a subtle **`emptyMessage`** badge appears next to the title in every view (and as the list-view message); the grid stays clean and usable (you can still drag to create). A populated calendar shows no badge — even when paging to an empty week. `emptyMessage = ""` hides it. (Fixture: the `/empty` verify view.)
- [ ] Hovering the empty-state badge shows a tooltip explaining the component in a nutshell — and, when the calendar is editable/selectable, how to add an event (drag empty time in Week/Day); a read-only calendar's tooltip instead points to the data binding.
- [ ] Toggle `showToolbar = false` → header hidden, grid still works.
- [ ] Bind `config.data.events` to a Named Query keyed on `output.visibleStart`/`visibleEnd` → navigating refetches only the visible window (no request storm).

## Timezone (set `config.timezone`, e.g. `America/Chicago`)

- [ ] Event times given as **absolute instants** — ISO with offset (`...-05:00`), UTC (`...Z`), or epoch ms — render at their wall clock **in `config.timezone`**, regardless of the browser's own zone (e.g. a `14:00Z` event shows at 09:00 in `America/Chicago`).
- [ ] DST is handled: the same UTC hour lands an hour apart in summer vs winter.
- [ ] **today**, the **now-indicator**, and `scrollToNow` use `config.timezone` (a remote operator sees plant-local, not their browser clock).
- [ ] **All-day** / date-only events are floating — shown on their date, not shifted by the zone.
- [ ] The built-in editor prefills and edits in plant-local wall clock and shows a **"Times in <zone>"** hint (the native picker itself is browser-local).
- [ ] Create / edit / move / resize emit **offset-bearing ISO instants** (e.g. `2026-07-01T11:30:00-05:00`); the change round-trips and the event stays put.
- [ ] Empty `timezone` = browser/session-local (unchanged legacy behavior).

## Known limitations (by design / future)

- Multi-day **all-day** events render as continuous **spanning bars** (month grid + week/day all-day strip); multi-day **timed** events render a clamped segment on each day they cross (week/day grid).
- Recurring edits use a **series + single-occurrence** model (no "this and following"): a per-occurrence change detaches into a standalone override (id `seriesId-x-date`) plus an `rrule.exdate` on the series. Deleting the **whole series** does not auto-remove previously-detached overrides — sweep `seriesId-x-*` in your write-back if you want that.
- Recurrence expansion runs in the display timezone (occurrences are placed by their zone-local date); a single rule spanning a DST change is fine for display.
- Recurrence is expanded per visible window (never the whole infinite series), so a never-ending rule is safe — it renders only the occurrences in view, at any distance from the start. A single window is still capped at `MAX_OCC` (1000) occurrences as a backstop.
- The component **does not persist** — all writes are your responsibility via the events.
