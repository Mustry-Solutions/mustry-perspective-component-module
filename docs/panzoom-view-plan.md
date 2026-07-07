# Pan & Zoom View — component plan

**Status (2026-07-06): M0–M3 BUILT and verified** (embed, drag-pan with
click preservation, wheel zoom toward the cursor via a native non-passive
listener — React's delegated `onWheel` is passive and can't
`preventDefault` — double-click zoom, +/−/home/fit controls with
`config.locale` tooltips, two-way `state.zoom`/`state.center` with scripted
fly-to proven, fly-to smoothing over `config.flyToMs`, pinch zoom
(synthetic-verified; real-hardware pass joins the standing tablet item),
`output.viewState`). Checklist: `panzoom-manual-test.md`. Fifth component
of the module: id `mustrysolutions.display.panzoomview`. Sam's own idea
(not from the researched backlog). Demo: `/panzoom` in the verify project.

**M3 (same day): navigation aids** — `data.pois` (named fly-to targets;
write a name to two-way `state.target`, which self-clears so the same name
re-triggers; `zoom` 0 keeps the current zoom), localized "Go to…" list
(`config.showPoiList`), corner **minimap** (`config.showMinimap`: content
box + draggable view rectangle + POI dots; auto-hides while the whole
content is visible), and **flagged POIs** (`flagged: true`, bindable to
alarm state) that pulse when visible and get a clickable edge-indicator
chip pointing at them when off-screen. All live-verified incl. exact
minimap jump/drag math and target re-trigger.

**M4 (2026-07-07): feel + robustness** — proportional trackpad wheel zoom
(a mouse tick stays exactly one zoomStep), inertia panning (flick glides
out with exponential friction; grab-to-stop), rubber-band overpan with
spring-back (writes stay hard-clamped), `prefers-reduced-motion` support
(animations snap, pulse holds still), and **auto content size**
(`contentWidth/Height` 0 = adopt the embedded view's reported size — now
the default). Fixed en route: fly-to flashed the destination for one frame
before animating.

Remaining backlog (M5 candidates, from the improvement review): semantic
zoom (`output.visibleRect` + zoom-param pattern), zoom-to-rectangle
(shift-drag), `limitToFit`, gesture-conflict modes (two-finger-pan /
Ctrl+wheel), edge-indicator clustering, configurable minimap corner,
`poi.color`, keyboard navigation (a11y — previously excluded elsewhere).

## What & why

A viewport that embeds ANY Perspective view (by path + params) and gives the
operator map-style navigation over it: drag to pan, wheel/pinch to zoom
toward the cursor, zoom buttons, a configurable **home** (center point +
zoom) for reset, and fit-to-viewport. The use case is large synoptics —
P&IDs, plant-floor layouts, line overviews — authored at natural size and
navigated like a map.

The differentiator beyond navigation: **`state.center` / `state.zoom` are
two-way**, so a script or binding can fly the viewport to a piece of
equipment ("center on Pump 3 when its alarm goes active"). That turns a
viewer into a navigation primitive.

Demand anchors (researched 2026-07-06): the "Perspective zoom and pan for
large view" Ideas-portal entry; the 2019 "container for pan and zoom view"
forum thread (still active); an Ignition Exchange "Pan Zoom Frame" resource
(people hand-roll this with CSS scale hacks); recurring threads fighting
zoom-centering math and scrollbar-free zooming. Nothing native: coordinate
containers don't pan/zoom, the Map component is GIS-only, IA's View Canvas
places views but doesn't navigate them.

## Feasibility (verified 2026-07-06)

`@inductiveautomation/perspective-client` **publicly exports the `View`
React component** (`export { View, ViewStateType }`) with
`resourcePath`, `params`, `mountPath`, `onViewSizeChange`,
`onViewStateChange` — the same machinery IA's Embedded View uses. M0 pins
the two wiring details: obtaining the `ClientStore` from our component's
store, and minting a stable unique `mountPath` per instance.

## Settled decisions (proposed)

1. **Sections per the house contract.**
   - `config`: `viewPath`, `viewParams` (object, passed through),
     `contentWidth`/`contentHeight` (the embedded view's natural size —
     required for fit/limits/centering math), `minZoom`/`maxZoom`/`zoomStep`,
     `wheelZoom` (bool), `doubleClickZoom` (bool), `showControls` (zoom
     in/out, home, fit buttons), `home` `{x, y, zoom}` (content-coordinate
     center + zoom used by reset and initial position; zoom 0 = fit).
   - `state` (two-way): `zoom`, `center {x, y}` (content coordinates) —
     pre-settable, bindable, scriptable (fly-to).
   - `output`: `viewState` (loading / valid / notFound / error — surfaced
     from ViewStateType so authors can react to a bad path).
2. **Rendering**: a clipped viewport div; inside it a content div of
   `contentWidth × contentHeight` carrying one CSS
   `translate(...) scale(...)` transform (GPU-cheap; the embedded view
   stays mounted throughout). The `View` mounts filling the content div.
   Known quirk to document: popups/portals INSIDE the embedded view escape
   the transform (they portal to the document — unscaled).
3. **Gestures reuse the house pattern**: pan starts only past a drag
   threshold with pointer capture, and the click that would follow a pan is
   suppressed — so buttons and inputs INSIDE the embedded view keep working
   normally. Wheel zoom zooms toward the cursor (the math everyone gets
   wrong with plain CSS scale); pinch zoom for touch (joins the standing
   real-hardware test item); double-click zooms a step toward the click.
4. **Bounds**: pan clamped so the content can't be lost off-screen
   (small overpan margin); zoom clamped to min/max; `home` and fit are
   always reachable from the controls.
5. **All coordinate math lives in pure `panZoomLogic.ts`** (screen↔content
   transforms, zoom-at-point, clamping, fit) with Jest coverage — this is
   exactly the kind of geometry the module is good at.
6. **Reuse the stack**: control-button labels via the 7-language packs,
   `--pz-*` theming verified light + dark, evergreen demo at `/panzoom`
   (a large generated synoptic view — and embedding one of our own demos
   proves nesting), manual-test checklist.

## Milestones

- **M0 — embed spike (go/no-go)**: mount a view by path + params inside the
  component (ClientStore + mountPath wiring), pass params through, surface
  ViewStateType, static scale/translate applied by props. Exit: an embedded
  view renders transformed, interactive, on `/panzoom`.
- **M1 — navigation**: drag-pan with click-preservation, wheel zoom toward
  cursor, zoom buttons + home + fit, two-way `state.zoom`/`state.center`
  with clamping and no-op guards, `config.home`, controls + labels +
  theming.
- **M2 — polish**: pinch zoom, double-click zoom, `output.viewState`,
  overpan tuning, fly-to smoothing (animated center/zoom writes), docs +
  checklist + dark-mode pass.

## Risks

- **API surface**: `View` is publicly exported but sparsely documented for
  third parties; M0 pins exact usage. If a future Ignition changes it, the
  break is loud (compile-time), not silent.
- **Gesture conflict** with interactive embedded content — mitigated by the
  threshold + click-suppression pattern proven in the grid/timeline.
- **Transformed-content quirks**: portals escape the transform (document);
  text stays crisp under GPU scale in Chromium but verify in the live pass.
- **Performance**: CSS transforms are compositor-cheap and the embedded
  view doesn't re-render during navigation; heavy embedded views are the
  author's mass to carry (same as IA's Embedded View).
