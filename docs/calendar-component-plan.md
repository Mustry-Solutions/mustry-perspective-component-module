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

## Approach: custom build (no third-party calendar library)

Decision: **build it ourselves**, no FullCalendar — explicitly to avoid FullCalendar
Premium (the resource-timeline view is a paid commercial license) and to keep full
control of theming, behaviour, and dependencies.

Honest scoping (this is the trade-off we accept): the *easy* slice of a calendar
(the month grid) is close to what we already built for the date picker, but the
*valuable* slice (time-based week/day, overlap packing, drag/resize, recurrence) is
genuinely hard — that's the ~8–10× effort where a library would have saved months.
So we build **read-first and in milestones**, landing real value early (month +
data binding + events) and treating drag/recurrence/resource-timeline as a long
tail. We do NOT try to reach full "Outlook-style scheduler" parity in one shot.

Where a focused, MIT-licensed helper makes sense we may pull it for a single hard
sub-problem (e.g. the `rrule` library purely for recurrence *expansion*) — that's
not a calendar framework and carries no premium licensing.

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

## Technical notes (custom build)

- **Second component in the module:** registration is additive — a new
  `Calendar.java` descriptor, `registerComponent(...)` in both the gateway and
  designer hooks, and a new entry in `web/typescript/index.ts`'s component array.
  The bundle (`MustryComponents.js/.css`) and `BROWSER_RESOURCES` are shared.
- **Reuse `dateUtils`:** month-grid construction (`startOfMonth`, `firstCellOffset`,
  `addDays`, `weekdayHeaders`), week math (`startOfWeek`), and DST-correct timezone
  resolution (`resolveZoned`) already exist and carry straight over.
- **Pure-logic + tests:** all the non-trivial math goes in a `calendarLogic.ts` pure
  module with Jest tests (same pattern as `pickerLogic.ts`): month-grid weeks, event
  placement into day cells + "+N more" overflow, multi-day segmentation, and (later)
  the time-grid **overlap-packing** algorithm and recurrence expansion.
- **Theming:** define `--cal-*` CSS variables defaulting to the Perspective theme
  (`--callToAction` / `--neutral-*`) with hex fallbacks — the exact pattern proven on
  the date picker.
- **Performance contract:** render the whole visible window from the single bound
  `events` array in one pass; never per-event work. Emit `output.visibleRange` so the
  author refetches only the window in view.

## Risks (custom build)

- **Effort tail:** time-grid week/day (overlap packing), drag/resize (pointer math),
  and recurrence are the hard ~80%. Mitigation: ship read-first, milestone by
  milestone; don't promise scheduler parity early.
- **Overlap-packing & drag correctness** are algorithmic — keep them in pure,
  unit-tested functions so edge cases are pinned down without a browser.
- **DST on a time grid** — trickier than the picker (which only touched timezone at
  output). Handle wall-clock ↔ instant carefully in the week/day renderer.
- **IA's "Planned" calendar** may eventually ship first-party — longevity risk.
  Mitigate by shipping now and differentiating on industrial bindings + performance.

## Reuse from the existing module

Build/sign/deploy ops scripts; `dateUtils` (grid/week/timezone math); CSS-variable
theming → Perspective theme; component-events pattern; pure-logic + Jest pattern;
the `/verify-component` live harness; `config/data/output/style` schema conventions.

## Milestones (custom)

- **M0 — Scaffold + Month view (read):** second component registered end-to-end;
  month grid (reusing `dateUtils`) with events from a bound JSON array placed into
  day cells + "+N more" overflow; toolbar (prev/next/today + title); `output`
  visibleRange/currentView; `onEventClick` + `onDateClick`; theming; pure
  `calendarLogic.ts` + tests. Deploy + live-verify. **← starting here.**
- **M1 — Week/Day time-grid (read):** the hard renderer — time axis, day columns,
  events positioned by time, **overlap-packing** (pure, tested); view switcher.
- **M2 — Editable:** select-to-create, drag-to-move, resize; rich component events
  (`onSelect`/`onEventDrop`/`onEventResize`) with complete payloads.
- **M3 — Scheduling polish:** recurrence (RRule expansion), all-day/multi-day
  segments, background events (downtime overlays), business hours, slot granularity,
  list view.

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
