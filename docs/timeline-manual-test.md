# Resource Timeline — manual test checklist

Hands-on checklist for the Resource Timeline (`mustrysolutions.display.resourcetimeline`).
The pure logic (scale, ticks, packing, gesture math, specs) is unit-tested; this covers
rendering, interaction and the binding contract. The committed demo at `/timeline`
(verify project) has everything enabled with a write-back `onChange` script.

## Read-only board

- [ ] Rows render in `config.resources` order; consecutive equal `group` values share
      one sticky section header; the label column and axis stay aligned while
      scrolling both directions.
- [ ] Zoom presets (Hour / Day / Week) change tick tiers + density; `config.zoom` is
      two-way. Prev / Today / Next page by the zoom span.
- [ ] Bars pack into lanes when overlapping; `state` bands are full-height and
      contiguous (no end = runs to the window edge); `background` spans sit behind
      everything.
- [ ] Category colours/icons apply; `status` restyles (tentative striped, cancelled
      struck-through, done faded); a bar clamped at a window edge squares that edge.
- [ ] Hover shows the detail popover with the event's real (unclamped) extent in the
      configured timezone. Legend click filters a category (mirrors to
      `output.hiddenCategories`).
- [ ] Recurring events (`rrule`) render per window; occurrences are display-only.
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
- [ ] **Recurring occurrences** are not draggable/editable (v1: recurrence is
      display-only); clicking one fires `onEventClick` even with the editor on.
- [ ] Editor times are in the configured timezone (hint under the fields).

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
