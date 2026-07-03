# Resource Timeline — component plan

**Status: planned (2026-07-03). Nothing built yet.** Third component of the module:
`mustrysolutions.display.resourcetimeline`. Decisions below were settled with Sam;
change them here first if they change.

## What & why

Rows are resources (machines, lines, crews), the horizontal axis is continuous
time with stepped zoom, bars are events/states. **V1 design driver: a scheduling
board** — plan and move work per resource with drag/reassign/resize — with
read-only state display (downtime/OEE bands) supported but not the focus.

Demand anchors (researched 2026-07-02): Equipment Schedule improvement threads
(drag-between-rows reassign, zoom levels, richer click payloads, dataset binding),
the "New Perspective Status Chart" idea (19 votes), the 6-year Gantt thread, and
the shift-boundary/15-min-zoom asks. Dependency arrows (true Gantt) are explicitly
a different product and stay out.

## Settled decisions

1. **Separate component**, not calendar lanes: different geometry (horizontal
   continuous axis vs date grid), different schema surface, keeps the calendar's
   schema stable. Shared code goes into a common layer instead.
2. **V1 focus: scheduling board** (edit-heavy). M2 gestures are the point.
3. **Row model: flat list + optional `group` field** rendered as sticky section
   headers. No collapse in v1 (addable later without schema changes).
4. **Recurrence: display-only in v1** — events accept `rrule`, expanded by the
   shared engine, so recurring shift patterns render. Repeat-editing UI and
   occurrence-detach come later.
5. **Epoch-linear time scale** with zone-aware tick labels (DST days are 23/25 h;
   the axis must not tear at the seam). Ticks/labels via the shared zone math.
6. **Stepped zoom presets** (`config.zoom`, two-way: e.g. `hour | shift | day |
   week`), each defining px-per-hour, snap granularity and header tiers — not
   continuous zoom.

## Data contract (calendar-proven, controlled)

- `config.resources` — `[{id, label, group?, color?, icon?}]`; row order = array order.
- `config.data.events` — `[{id, resourceId, start, end, title, category?, color?,
  status?, display?: 'bar'|'state'|'background', description?, rrule?}]`.
  `state` = full-height contiguous band (no lane packing); `background` = shaded span.
- Windowed binding recipe identical to the calendar: `output.visibleStart/visibleEnd`
  (half-open), `config.loading`, `config.refetchDebounceMs`, plus
  `config.data.recurringEvents` for always-loaded series.
- **One change event**: `onChange {action: create|edit|delete|move|resize, event}`;
  `event` always carries the final `resourceId`; `extra.fromResourceId` set when a
  drag crossed rows (reassign = a move that changed rows).
- Intent events: `onEventClick`, `onSelect` (`{resourceId, start, end}`),
  `onResourceClick`.

## Geometry & UX

Two-tier sticky time header; sticky left resource column (group headers sticky
too); vertical row scroll; horizontal pan (drag header, nav buttons, Today);
now-line reusing `refreshSeconds`; per-row lane packing for overlapping bars
(calendar's cluster algorithm transposed) with capped auto row height; hover
popover; categories + legend; CSS-var theming (`--rtl-*` prefix) following the
Perspective theme.

## Architecture & reuse

- **M0 extracts the shared layer** (`web/typescript/shared/`): dateUtils,
  recurrence engine (`expandEvents`), labelPacks + label plumbing, propReader,
  DocDismiss, EnterTracker, eventStyle/Legend, hover popover. Calendar keeps its
  own views/controllers; the future grid consumes the same layer.
- New timeline code: `timelineLogic.ts` (pure, Jest-tested: epoch↔px scale, tick
  generation, per-row packing, window math), `timelineGestureController` (same
  host-interface pattern as the calendar's), subviews (TimeAxis, ResourceColumn,
  RowTrack, Bar, Toolbar), props mapper.
- **Schema lessons from 2026-07-02 baked in from day one**: no per-key label
  defaults in props.json (they materialize into the tree and shadow locale packs),
  array defaults `[]`, English-default shadowing guard in the mapper, all 7
  languages in the first milestone, schema designed to freeze.
- Perf posture: row virtualization from M1; `TimelineStress` verify view
  (~100 resources × 2,000 events) early.

## Milestones

- **M0** — purge + recommission the dev gateway (approved); shared-layer
  extraction (calendar keeps passing all tests); scaffold: descriptor + schema +
  component renders resource rows + time axis.
- **M1 read-only** — bars/states/backgrounds, zoom presets + pan + Today +
  now-line, hover, categories/legend, windowed outputs, recurrence display,
  localization, virtualization, stress view.
- **M2 editing** — drag-retime with snapping, cross-row reassign, both-edge
  resize, drag-empty-to-create, reused editor (+ resource dropdown), full
  onChange contract.
- **M3 polish** — perf pass, CSV export, manual-test checklist, README recipes
  (windowed query + one-handler write-back), TimelineDemo/TimelineDbDemo views.

## Out of scope (v1)

Dependency arrows/links, collapsible hierarchy, repeat-editing UI, printing,
ICS, continuous zoom, per-event locks (calendar shares this gap — revisit
together).

## Risks

Dense state data perf (mitigate: windowing + virtualization + early stress
view); horizontal pan/zoom on touch (device test still pending for the calendar
too — same checklist discipline); DST seams in the scale (settled: epoch-linear).
