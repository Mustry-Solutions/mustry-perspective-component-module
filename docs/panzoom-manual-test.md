# Pan & Zoom View — manual test checklist

Hands-on checklist for the Pan & Zoom View (`mustrysolutions.display.panzoomview`).
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

## Verified 2026-07-06 (dev gateway, Chrome)

Everything above except the real-hardware touch pass: fit render 34%,
embedded click-counter through the transform, wheel 43→53% toward cursor,
double-click 53→83%, drag/home/fit, scripted fly (snap in hidden tab; frame
interpolation confirmed via instrumented rAF), synthetic pinch 34→68% exact,
EN tooltips, dark chrome + pinned demo label colors.
