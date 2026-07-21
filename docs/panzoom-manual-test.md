# Pan & Zoom View — manual test checklist

Hands-on checklist for the Pan & Zoom View (`mustrysolutions.ingots.display.panzoomview`).
The geometry (fit, clamping, zoom-at-point, pinch, fly interpolation) is
unit-tested in `panZoomLogic.ts`; this covers rendering, gestures and the
two-way state contract. The committed demo at `/panzoom` (verify project)
embeds `SynopticDemo` (2400×1500) with fly-to buttons.

> Prop sections: `config` = set-and-forget (viewPath/params, content size,
> zoom limits, home, locale, flyToMs), `state` = two-way `zoom`/`center`
> (write to fly), `output` = read-only `viewState`.

## Embed + render (M0)

- [ ] The embedded view renders at the home position (default: fit the whole
      content with a small margin) and the zoom badge matches.
- [ ] `config.viewParams` (`[{name, value}]`) reach the embedded view's input
      params; changing a bound value updates the embedded view in place.
- [ ] A bad `config.viewPath` doesn't break the component; `output.viewState`
      reports it (loading / valid / notFound / error).
- [ ] Text inside the embedded view stays crisp at 100%+ zoom (GPU scale).
- [ ] Known quirk: popups/dropdowns INSIDE the embedded view portal to the
      document and render UNSCALED — expected, documented in the plan.

## Navigation (M1)

- [ ] **Drag-pan**: drag moves the content with the pointer at any zoom; a
      plain CLICK (< 5 px movement) still reaches buttons/inputs inside the
      embedded view (the demo's click-counter proves it); after a real drag,
      no phantom click fires.
- [ ] **Wheel zoom** (`config.wheelZoom`): zooms toward the cursor — the
      content under the pointer stays put; the page never scrolls while
      wheeling over the viewport.
- [ ] **Double-click zoom** (`config.doubleClickZoom`): two zoom steps toward
      the click point.
- [ ] **Controls** (`config.showControls`): + / − step at the viewport center;
      home resets to `config.home` (zoom 0 = fit, x/y −1 = content center);
      fit always fits; tooltips follow `config.locale` (en/fr/de/es/nl/it/pt).
- [ ] **Bounds**: you can't lose the content — panning stops with ≥ 25% of the
      viewport still covered; content smaller than the viewport stays
      centered; zoom clamps to `config.minZoom`/`maxZoom`.
- [ ] **Two-way state**: gestures write `state.zoom`/`state.center` (debounced
      ~200 ms, flushed on gesture end); writing them from a script/binding
      moves the viewport ("Fly to Pump 3" in the demo).

## Polish (M2)

- [ ] **Fly-to smoothing**: an external `state` write animates the viewport
      over `config.flyToMs` (default 350 ms; zoom eases in log space) and
      lands exactly on the target; `flyToMs: 0` snaps; a HIDDEN tab snaps
      (rAF doesn't run there); a gesture mid-flight cancels the animation and
      takes over. The component's own write-echo does NOT re-animate.
- [ ] **Pinch zoom** (touch): two fingers zoom by the distance ratio anchored
      at the midpoint, panning with the midpoint as it moves; lifting one
      finger continues as a pan; the pinch never fires a click. Synthetic
      two-pointer events verified exact (dist ×2 → zoom ×2); ⚠ REAL-DEVICE
      pass pending — joins the standing tablet item with the other
      components.
- [ ] **Dark mode**: viewport background, control buttons and zoom badge
      follow the theme (`--pz-*` vars); verified against the `dark` session
      theme.

## Navigation aids (M3)

- [ ] **POIs** (`data.pois`, `[{name, x, y, zoom, flagged}]`): the localized
      "Go to…" list (`config.showPoiList`) flies to the picked POI at its
      `zoom` (`0` = keep the current zoom); writing a name to `state.target`
      from a script/binding flies there and the component clears the target
      back to `''`, so writing the SAME name later re-flies.
- [ ] **Minimap** (`config.showMinimap`): appears only when part of the
      content is off-screen; shows POI dots (flagged in the alert color) and
      the view rectangle; clicking jumps the view there, dragging pans it
      (zoom unchanged); a press on the minimap never starts a viewport pan.
- [ ] **Flagged POIs** (bind `flagged` to alarm state): a pulse ring at the
      POI while it's visible (never blocks clicks — `pointer-events: none`);
      off-screen, a clickable edge chip (name + arrow rotated toward the real
      location, fully inside the viewport) that flies to it. The demo's
      "Toggle Pump 3 alarm" button exercises both live.

## Feel + robustness (M4)

- [ ] **Trackpad zoom** is smooth (proportional to the pinch), while a mouse
      wheel tick still zooms exactly one `config.zoomStep`.
- [ ] **Flick to glide**: releasing a fast drag keeps the view moving with
      friction; it decelerates smoothly, stops at pan bounds, and a grab
      mid-glide (or mid-fly) freezes it in place. The rest position lands in
      `state.center`.
- [ ] **Rubber-band**: dragging past the pan bound stretches with resistance
      and springs back on release; `state` never holds an out-of-bounds
      value.
- [ ] **Reduced motion** (OS setting): fly/glide/spring all snap; the pulse
      ring is static but visible.
- [ ] **Auto content size** (`contentWidth/Height` 0 — the default): the
      component adopts the embedded view's own size; fit/home/minimap/POI
      coordinates all agree with it. Explicit sizes still win.
- [ ] **No destination flash**: a fly-to (Go to / target write / indicator
      click) starts from the current position — the target must never blink
      in before the flight.
- [ ] **Interrupted pan doesn't eat the next tap** (touch): start a one-finger
      pan and let the system CANCEL it (notification shade pull, palm touch,
      app switcher) — the very next tap on a control inside the embedded view
      must register. The click-swallower a pan arms on release is skipped on
      `pointercancel` and disarmed by the next pointerdown (native capture, so
      an embedded widget stopping propagation can't defeat it); DOM-level
      verified synthetically 2026-07-12, ⚠ REAL-DEVICE pass pending — a real
      touch cancel is exactly the case a desktop can't produce.

## Verified 2026-07-06 (dev gateway, Chrome)

M4 measured 2026-07-07: micro-delta wheel factor exact to 5 decimals (mouse
tick still exactly 1.25); glide travelled 1102 px with textbook exponential
decay (per-250 ms deltas 584/290/128/60/27/13); drag stretched 187 px past
the bound and settled back exactly onto it; auto size adopted the reported
2400×1500 (fit 34% unchanged); the fly-to destination flash was caught by a
MutationObserver trace (target painted at t=4 ms) and is fixed — first DOM
write is now an interpolated frame.

Everything above except the real-hardware touch pass: fit render 34%,
embedded click-counter through the transform, wheel 43→53% toward cursor,
double-click 53→83%, drag/home/fit, scripted fly (snap in hidden tab; frame
interpolation confirmed via instrumented rAF), synthetic pinch 34→68% exact,
EN tooltips, dark chrome + pinned demo label colors. M3: Go-to list flies at
POI zoom (120%), indicator click flies back (150% + pulse), `zoom: 0` keeps
current zoom, `state.target` re-trigger after self-clear, alarm toggle
pulse on/off, minimap jump/drag exact (predicted rect (9,20)/(73,49.5) →
measured (9,19)/(73,49)), minimap auto-hide at fit, chip fully inside the
viewport at the edge.
