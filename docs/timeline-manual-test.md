# Resource Timeline — manual test checklist

Hands-on checklist for the Resource Timeline (`mustrysolutions.display.resourcetimeline`).
The pure logic (scale, ticks, packing, gesture math, specs) is unit-tested; this covers
rendering, interaction and the binding contract. The committed demo at `/timeline`
(verify project) has everything enabled with a write-back `onChange` script.

## Read-only board

- [ ] Rows render in `config.resources` order; consecutive equal `group` values share
      one sticky section header; **clicking a header collapses/expands its section**
      (chevron flips, hidden-row count appears, `config.collapsedGroups` updates
      two-way — pre-setting it opens the view collapsed); the label column and axis stay aligned while
      scrolling both directions.
- [ ] Zoom presets (Hour / Day / Week) change tick tiers + density; `config.zoom` is
      two-way. Prev / Today / Next page by the zoom span.
- [ ] **Shift zoom** — with `config.shifts` set (the `/timeline` demo has
      Early/Late/Night), a Shift button appears; its lower ticks + gridlines sit on
      the shift boundaries labelled "06:00 Early" etc. Without shifts the button is
      hidden and `zoom: 'shift'` falls back to Day.
- [ ] Bars pack into lanes when overlapping; `state` bands are full-height and
      contiguous (no end = runs to the window edge); `background` spans sit behind
      everything.
- [ ] Category colours/icons apply; `status` restyles (tentative striped, cancelled
      struck-through, done faded); a bar clamped at a window edge squares that edge.
- [ ] **Very short events** still render as a visible, clickable pill (~12px floor);
      below ~24px the edge-resize handles disappear (move/click still work).
- [ ] Vertical gridlines line up exactly under the lower axis ticks — including on
      a 23/25h DST day (set `config.timezone` and navigate across a transition).
- [ ] Hover shows the detail popover with the event's real (unclamped) extent in the
      configured timezone — but **not while a drag is in flight**. Legend click
      filters a category (mirrors to `output.hiddenCategories`).
- [ ] Recurring events (`rrule`) render per window; occurrences carry a ↻ marker.
- [ ] `output.visibleStart/visibleEnd` update (debounced) when navigating/zooming —
      ISO-8601 UTC instants, half-open.

## Editing (`editable` / `selectable` / `builtInEditor`)

- [ ] **Drag a bar horizontally** — ghost previews with zoom-preset snapping; release
      fires `onChange` (`action = "move"`); the bar snaps back unless your handler
      writes back.
- [ ] **Drag a bar onto another row** — the ghost follows the pointer's row; release
      fires `onChange` with the new `resourceId` and `fromResourceId` set (reassign).
- [ ] **Drag either edge** — resizes with snapping and a minimum of one snap step;
      fires `onChange` (`action = "resize"`).
- [ ] **Drag empty track** — selection rectangle; release opens the editor
      (with `builtInEditor`) or fires `onSelect`.
- [ ] **Plain click on empty track** (with `builtInEditor` + `selectable`) — editor
      with a default one-hour slot at the click point.
- [ ] **Click a bar** — opens the editor pre-filled (resource dropdown shows
      "Group — Label"); Save fires `edit`, Delete fires `delete`. Without
      `builtInEditor`, clicks fire `onEventClick`.
- [ ] **Drag a recurring occurrence (↻)** — it detaches: `onChange` carries
      `scope: "occurrence"` + `seriesId` + `occurrenceDate`; the write-back adds an
      `exdate` to the series and upserts a standalone override. Later occurrences
      keep recurring.
- [ ] **Click a recurring occurrence** — the editor opens with a
      "This event / All events" choice: *This event* saves a detached override;
      *All events* edits the base series (re-anchored on its own start date).
      Delete honours the same scope.
- [ ] **Repeat controls** — under *All events* (or on any non-occurrence event) the
      editor shows the calendar's Repeat block: frequency, every-N, weekly weekday
      picker, Ends never/on/after. Editing the rule updates the series (exdates
      kept); "Does not repeat" removes it; a new event can be created recurring.
- [ ] Editor times are in the configured timezone (hint under the fields).
- [ ] **Editor validation** — set End at or before Start: a red "End must be after
      start" hint appears and Save/Create disables; fixing the range re-enables it.
- [ ] **Sloppy click** — press a bar and wiggle less than half a snap step: no move
      fires; it commits as a click (editor / `onEventClick`). Right-click never
      starts a drag.

## CSV export

- [ ] `config.showExport` shows the toolbar download button; clicking downloads
      `timeline-events.csv` (header + one row per loaded event incl. recurring
      definitions).
- [ ] Opens cleanly in Excel (UTF-8 BOM — accents intact); cells starting with
      `=`, `+`, `-`, `@` are apostrophe-guarded (no formula execution).

## Keyboard / a11y

- [ ] Tab reaches every control: toolbar, group headers, bars, state bands, legend —
      each shows an accent focus ring.
- [ ] **Enter/Space on a bar** opens the editor (or fires `onEventClick`); on a
      group header it collapses/expands; the editor auto-focuses Title and closes
      on Escape.

## Touch (⚠️ must be verified on a real touch device — not just desktop/emulation)

> **Status: PENDING — never run on real hardware** (same standing item as the
> calendar; see `calendar-manual-test.md`). Timeline gestures were added
> 2026-07-03 with the same Pointer Events + `touch-action` design.

- [ ] **Finger-drag a bar** → it moves/reassigns (doesn't pan the board);
      `touch-action: none` on movable bars.
- [ ] **Drag an edge handle** (enlarged to 16px on coarse pointers) → resizes.
- [ ] **Drag empty track** → the board PANS (drag-to-create is disabled on touch);
      a `pointercancel` aborts any started gesture without committing.
- [ ] **Tap empty track** (with the editor on) → create editor opens.
- [ ] **Tap a bar** → editor / `onEventClick`.
- [ ] No stuck gestures, no scroll-steals-the-drag.

## Stress

- [ ] `/timeline-stress` (60 resources × ~3,500 events): Day and Week zoom render
      and scroll smoothly; legend filtering stays responsive.
