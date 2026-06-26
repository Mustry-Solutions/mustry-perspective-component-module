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

## Month view

- [ ] Renders the current month; today has an accent circular badge; other-month days dimmed.
- [ ] `weekStart` = monday vs sunday shifts the columns and weekday headers.
- [ ] `showWeekends = false` hides Sat/Sun (5-day weeks).
- [ ] Events show as coloured chips on the right day(s); `color` is honoured.
- [ ] A day with many events shows `maxEventsPerDay` then a **"+N more"** line.
- [ ] Multi-day all-day "Audit" appears on 22/23/24 but **not** 25 (exclusive end).
- [ ] Prev / next / **Today** navigate months; the title updates.
- [ ] `output.visibleStart` / `visibleEnd` update on navigation (check the props).

## Recurrence

- [ ] Weekly "Standup" appears on **Mon/Wed/Fri** through June, then stops (after `until`).
- [ ] Monthly "Safety review" lands on the 15th; navigate months → it follows.
- [ ] Switch a rule to `daily` with `interval` / `count` and confirm spacing & cap.
- [ ] Recurrence shows consistently in **month, week, and list** views.

## Week / Day views

- [ ] Toolbar switches Month / Week / Day / List; the title adapts (range vs single day).
- [ ] Time axis labels; the grid auto-scrolls to `scrollToHour`.
- [ ] `dayStartHour` / `dayEndHour` bound the visible hours.
- [ ] Timed events sit at the right time and height; **overlapping events split into side-by-side lanes** (Inspection + Design review on the 24th).
- [ ] All-day events appear in the top **all-day strip**; multi-day spans it.
- [ ] A **now-indicator** (red line) shows on today's column.
- [ ] Background "Maint downtime" renders as a translucent band **behind** events (02:00–05:00).
- [ ] Day view shows a single column for the cursor day; nav steps by one day.

## Editing (set `config.editable = true`)

- [ ] Hovering an event shows a grab cursor; a resize handle sits at its bottom edge.
- [ ] **Drag** an event — a ghost follows, snapping to 15 min; release fires `onEventDrop` (log it).
- [ ] Drag across day columns changes the day in the payload (`newStart`).
- [ ] **Resize** from the bottom edge changes the end; release fires `onEventResize`.
- [ ] Because it's controlled, the event **snaps back** on release unless your handler writes back.
- [ ] A plain **click** (no drag) fires `onEventClick`, not drop.

## Selecting / creating (set `config.selectable = true`)

- [ ] **Drag over empty time** shows a selection box; release fires `onSelect` (`{start, end}`).
- [ ] Clicking empty time (no drag) fires `onDateClick`.
- [ ] Wire `onSelect` to append to `config.data.events` → the new event appears.

## Theming & i18n

- [ ] Set a project-stylesheet rule `.mustry-calendar { --cal-accent: #2e7d32; }` → accents change.
- [ ] Switch the gateway between a light and a dark Perspective theme → text/border/background follow.
- [ ] Set `config.locale` (e.g. `nl-NL`, `fr-FR`) → month / weekday / time labels localise.

## Layout & edge cases

- [ ] Resize the component small/large → month grid fills; week/day grid scrolls.
- [ ] Empty `events` → clean empty calendar (list view shows "No events").
- [ ] Toggle `showToolbar = false` → header hidden, grid still works.
- [ ] Bind `config.data.events` to a Named Query keyed on `output.visibleStart`/`visibleEnd` → navigating refetches only the visible window (no request storm).

## Known limitations (by design / future)

- Multi-day events show as **per-day chips**, not continuous spanning **bars** (future polish).
- Editing recurring events fires the event for the **occurrence** (id `base::date`) — handle it as an exception in your own data.
- The component **does not persist** — all writes are your responsibility via the events.
