# Calendar / Scheduler component — build plan

Researched June 2026 (IA forum + Ideas/Canny portal + FullCalendar). This is the
strongest validated gap in Perspective: the "Perspective Calendar" idea is at
**44 votes, status "Planned"**, IA surveyed users in 2023, and there is still no
first-party general calendar — only the Equipment Schedule (a horizontal timeline
users repeatedly say is *not* a calendar).

## The three pains every existing option fails on

1. **Month-only.** The Exchange calendar "works for the month view, but not for
   scheduling operations by time during a day or week." → **time-based Week/Day
   grids are non-negotiable.**
2. **Read-only.** Users want Outlook-style **create + drag-to-move + resize-for-
   duration**, not a static display.
3. **Performance.** The founding complaint: the Exchange version does "35 requests
   to make the thing… tends to gum up." → render from **one bound dataset in a
   single pass**, never per-event requests.

A fourth, learned from the native Equipment Schedule: its edit events carried only
`eventId`/`itemId`, forcing a second lookup. → **fire complete event payloads.**

## Library: FullCalendar

Wrap **FullCalendar** via `@fullcalendar/react` (v6 — peer-supports React 16.14,
which is Perspective's React). It is the de-facto parity bar; the most-adopted
third-party calendar module is a FullCalendar wrapper. Building from scratch (as we
did the date picker) is the wrong call here — the surface (month/week/day/list +
drag/resize/recurrence/overlap) is exactly what FullCalendar already solves well.

**Licensing caveat (important):**
- Standard views (`daygrid`, `timegrid`, `list`, `interaction`, `rrule`) are **MIT
  — free.** The MVP and most asks live entirely here.
- **Resource/Timeline views (the room/equipment/production differentiator) are
  FullCalendar Premium** — a paid commercial license (GPLv3 option exists only for
  open-source distribution). So resource-timeline is a deliberate later phase gated
  on a licensing decision; the free build covers the bulk of demand.

## Feature set (phased)

**MVP (read + interact):** Month / TimeGrid Week / TimeGrid Day / List views; nav +
today + view-switcher toolbar; events from one bound JSON array (single pass);
per-event color; click + visible-range-changed events; timezone / locale /
week-start.

**v1 (editable):** `editable`/`selectable`; drag-to-move, resize-for-duration,
select-to-create; rich component events with complete payloads.

**v1.x (scheduling polish):** RRule recurrence (`@fullcalendar/rrule`); all-day /
multi-day events; background events (downtime/availability overlays); business
hours; sub-hour `slotDuration` (5/10/15 min — production asked for this);
`dayMaxEvents` "+ more" overflow; `slotEventOverlap`.

**v2 (licensed, optional):** resource-timeline view (resources as rows, time
horizontal) for room/equipment booking and production scheduling — requires a
FullCalendar Scheduler license decision.

## Draft prop schema

Following our established `config` / `data` / `output` / `style` grouping with rich
inline descriptions. Component id e.g. `mustrysolutions.display.calendar`.

**`config`**
- `view` — `month` | `week` | `day` | `list` (initial view)
- `toolbar` — `{ showNav, showToday, showViewSwitcher }`
- `editable` — master toggle for drag/resize
- `selectable` — allow select-to-create
- `weekStart` — `monday` | `sunday` (reuse our existing helper)
- `locale`, `timezone` — empty = session default (reuse our resolveZoned approach)
- `dayWindow` — `{ slotMinTime, slotMaxTime }` (visible hours)
- `slotDuration` — e.g. `00:15:00`
- `allDaySlot`, `nowIndicator`, `showWeekends`, `slotEventOverlap` — booleans
- `dayMaxEvents` — number | `true`
- `businessHours` — optional

**`data`**
- `events` — JSON array of FullCalendar-shaped event objects:
  `{ id, title, start, end, allDay, color | backgroundColor | borderColor | textColor, rrule?, ...extendedProps }`
- `backgroundEvents` — optional (downtime/availability overlays)
- `resources` — optional (v2 resource-timeline)

**`output`** (read-only, drives lazy-loading)
- `currentView`
- `visibleRange` — `{ start, end }` of what's shown — **bind your named query to
  this** so the calendar only ever fetches the window in view (kills the request-
  storm problem)
- `lastSelectedEvent` — full payload of the last clicked event

**`style`** — standard Perspective style + theming via CSS variables (see below).

## Data-binding contract

- **In:** author binds `config.data.events` to a named query / dataset returning the
  events for the **visible window** (`output.visibleRange`). One array → one render
  pass. No per-event requests.
- **Out:** the component **does not persist.** It fires component events with
  complete payloads; the author writes back via their own scripts/queries — exactly
  the Equipment Schedule contract, but with full event data so no second lookup is
  needed.

## Component events (all payloads complete)

- `onEventClick` — the full event object
- `onDateClick` — `{ date, allDay }`
- `onSelect` — `{ start, end, allDay }` (create intent → author opens their editor)
- `onEventDrop` — `{ event, oldStart, oldEnd, newStart, newEnd }`
- `onEventResize` — `{ event, oldEnd, newEnd }`
- `onDatesSet` — `{ view, start, end }` (visible range changed → refetch window)

## Technical integration notes

- **React 16.14:** pin `@fullcalendar/react` v6 (peer supports 16.14). Verify at the
  M0 spike.
- **Bundle:** FullCalendar + plugins adds a few hundred KB to `MustryComponents.js`
  — acceptable one-time load; confirm webpack build/size at M0.
- **Theming:** FullCalendar v6 exposes `--fc-*` CSS variables. Map them to our
  Perspective-theme-driven vars (the same pattern as the date picker's `--dtrp-*`
  → `--callToAction`/`--neutral-*`), so the calendar auto-themes light/dark.
- **Timezone:** feed `config.timezone` to FullCalendar's `timeZone`; reuse our
  DST-correct resolution for any wall-clock ↔ instant conversion in payloads.
- **Pure-logic + tests:** event normalization (prop array → FC events), timezone
  mapping, and recurrence/visible-range math go in a `calendarLogic.ts` pure module
  with Jest tests — same pattern as `pickerLogic.ts`.

## Risks

- **FullCalendar Premium** for resource-timeline (v2) — licensing decision required.
- **IA's "Planned" calendar** may eventually ship first-party — longevity risk.
  Mitigate by shipping now and differentiating on industrial bindings, the
  resource-timeline, and performance.
- **Bundle size** and **React 16.14** compatibility — both de-risked at the M0 spike.

## Reuse from the existing module

Build/sign/deploy ops scripts; CSS-variable theming → Perspective theme; component-
events pattern; pure-logic + Jest pattern; the `/verify-component` live harness;
the `config/data/output/style` schema conventions with rich descriptions.

## Milestones

- **M0 — Spike:** wrap `@fullcalendar/react`, render Month from a static events
  array, deploy + live-verify. De-risks React-16 compat, bundle, theming.
- **M1 — MVP:** the four views + toolbar + bound events (single pass) + color +
  `onEventClick`/`onDatesSet` + timezone/locale/week-start.
- **M2 — Editable:** drag/resize/select-to-create + rich component events.
- **M3 — Scheduling polish:** RRule, all-day/multi-day, background events, business
  hours, slot granularity, overflow/overlap, theming polish.
- **M4 — (optional, licensed):** resource-timeline view.

Each milestone: pure-logic tested where applicable, and live-verified in a real
Perspective session before "done".

## Sources

- Perspective Calendar idea (44 votes, Planned): https://inductiveautomation.canny.io/ignition-features-and-ideas/p/perspective-calendar
- Calendar like Vision (feature thread): https://forum.inductiveautomation.com/t/feature-14919-calendar-components-on-perspective-like-in-vision/27558
- Third-party FullCalendar wrapper threads: https://forum.inductiveautomation.com/t/perspective-calendar-component/56156 , https://forum.inductiveautomation.com/t/perspective-calendar/39543
- Equipment Schedule improvements (payload/drag complaints): https://forum.inductiveautomation.com/t/perspective-equipment-schedule-component-improvements/64141
- Equipment Schedule granularity: https://forum.inductiveautomation.com/t/new-feature-perspective-equipment-schedule/52473
- PM scheduler (data-binding mental model): https://forum.inductiveautomation.com/t/preventative-maintenance-scheduler/3464
- FullCalendar docs: https://fullcalendar.io/docs , https://fullcalendar.io/docs/timeline-view
