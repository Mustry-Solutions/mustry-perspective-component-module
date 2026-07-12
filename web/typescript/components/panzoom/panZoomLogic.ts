// Pure viewport geometry for the Pan & Zoom View — no DOM, no React, unit-tested.
// Convention: `center` is the CONTENT point (natural view coordinates) currently
// under the middle of the viewport; `zoom` is the scale factor (1 = natural size).

export interface PzPoint {
    x: number;
    y: number;
}

export interface PzHome {
    x: number;      // content coords; -1 = content center
    y: number;
    zoom: number;   // 0 = fit the whole content in the viewport
}

export interface PzViewport {
    zoom: number;
    center: PzPoint;
}

export const PZ_MIN_ZOOM_FLOOR = 0.01;

/** The zoom that fits the whole content inside the viewport (with a margin). */
export function fitZoom(contentW: number, contentH: number, viewportW: number, viewportH: number, margin: number = 0.95): number {
    if (contentW <= 0 || contentH <= 0 || viewportW <= 0 || viewportH <= 0) {
        return 1;
    }
    return Math.max(PZ_MIN_ZOOM_FLOOR, Math.min(viewportW / contentW, viewportH / contentH) * margin);
}

export function clampZoom(zoom: number, minZoom: number, maxZoom: number): number {
    return Math.max(Math.max(PZ_MIN_ZOOM_FLOOR, minZoom), Math.min(maxZoom, zoom));
}

/** Clamp the center so the viewport can't wander far off the content: each axis
 *  keeps at least `keep` (fraction of the viewport) covered by content. When the
 *  content is smaller than the viewport on an axis, it stays centered instead. */
export function clampCenter(center: PzPoint, zoom: number, contentW: number, contentH: number,
                            viewportW: number, viewportH: number, keep: number = 0.25): PzPoint {
    const clampAxis = (c: number, content: number, viewport: number): number => {
        const half = viewport / (2 * zoom);
        if (content <= viewport / zoom) {
            return content / 2;   // smaller than the viewport: keep centered
        }
        const slack = half * 2 * (1 - keep);
        return Math.max(half - slack, Math.min(content - half + slack, c));
    };
    return {
        x: clampAxis(center.x, contentW, viewportW),
        y: clampAxis(center.y, contentH, viewportH)
    };
}

/** The effective viewport for the current two-way state: an unset zoom (<= 0)
 *  resolves to home (whose zoom 0 = fit, x/y -1 = content center). */
export function resolveViewport(
    stateZoom: number, stateCenter: PzPoint, home: PzHome,
    contentW: number, contentH: number, viewportW: number, viewportH: number,
    minZoom: number, maxZoom: number
): PzViewport {
    if (stateZoom > 0) {
        const zoom = clampZoom(stateZoom, minZoom, maxZoom);
        return { zoom, center: clampCenter(stateCenter, zoom, contentW, contentH, viewportW, viewportH) };
    }
    return homeViewport(home, contentW, contentH, viewportW, viewportH, minZoom, maxZoom);
}

/** The `config.home` viewport (also the reset target). */
export function homeViewport(home: PzHome, contentW: number, contentH: number,
                             viewportW: number, viewportH: number, minZoom: number, maxZoom: number): PzViewport {
    const zoom = home.zoom > 0
        ? clampZoom(home.zoom, minZoom, maxZoom)
        : clampZoom(fitZoom(contentW, contentH, viewportW, viewportH), minZoom, maxZoom);
    const center = {
        x: home.x >= 0 ? home.x : contentW / 2,
        y: home.y >= 0 ? home.y : contentH / 2
    };
    return { zoom, center: clampCenter(center, zoom, contentW, contentH, viewportW, viewportH) };
}

/** The CSS transform for a viewport (transform-origin 0 0). */
export function viewTransform(vp: PzViewport, viewportW: number, viewportH: number): { tx: number; ty: number; scale: number } {
    return {
        tx: viewportW / 2 - vp.center.x * vp.zoom,
        ty: viewportH / 2 - vp.center.y * vp.zoom,
        scale: vp.zoom
    };
}

/** Zoom toward a viewport point (wheel / double-click target), keeping the content
 *  under that point stationary: the anchor's content position is preserved. */
export function zoomAt(vp: PzViewport, viewportPt: PzPoint, nextZoom: number,
                       viewportW: number, viewportH: number): PzViewport {
    const t = viewTransform(vp, viewportW, viewportH);
    const contentPt = { x: (viewportPt.x - t.tx) / vp.zoom, y: (viewportPt.y - t.ty) / vp.zoom };
    // solve center so contentPt stays under viewportPt at nextZoom
    return {
        zoom: nextZoom,
        center: {
            x: contentPt.x + (viewportW / 2 - viewportPt.x) / nextZoom,
            y: contentPt.y + (viewportH / 2 - viewportPt.y) / nextZoom
        }
    };
}

/** Pan by a viewport-pixel delta (drag): the content follows the pointer. */
export function panBy(vp: PzViewport, dxPx: number, dyPx: number): PzViewport {
    return {
        zoom: vp.zoom,
        center: { x: vp.center.x - dxPx / vp.zoom, y: vp.center.y - dyPx / vp.zoom }
    };
}

/** Multiplicative zoom factor for a wheel event. One standard mouse tick
 *  (|deltaY| ≈ 100 px) is exactly one zoomStep — unchanged mouse behaviour —
 *  while trackpad pinches (many small deltas, ctrl+wheel in Chromium) zoom
 *  proportionally and feel smooth. deltaMode 1 = lines (Firefox mice). */
export function wheelZoomFactor(deltaY: number, deltaMode: number, zoomStep: number): number {
    const dy = deltaMode === 1 ? deltaY * 33 : deltaY;
    return Math.pow(zoomStep, -dy / 100);
}

export interface PzDragSample {
    t: number;    // ms timestamp
    x: number;    // viewport px
    y: number;
}

/** Pointer velocity (px/ms) over the trailing `windowMs` of drag samples —
 *  the flick speed at release, for inertia. */
export function dragVelocity(samples: PzDragSample[], windowMs: number = 100): PzPoint {
    if (samples.length < 2) {
        return { x: 0, y: 0 };
    }
    const last = samples[samples.length - 1];
    let first = samples[0];
    for (const s of samples) {
        if (last.t - s.t <= windowMs) {
            first = s;
            break;
        }
    }
    const dt = last.t - first.t;
    if (dt <= 0) {
        return { x: 0, y: 0 };
    }
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/** One frame of glide physics: the distance travelled during dtMs of exponential
 *  velocity decay (time constant tauMs) and the velocity left afterwards.
 *  Total glide distance from v0 asymptotes to v0 * tauMs. */
export function glideFrame(v: number, dtMs: number, tauMs: number = 325): { dist: number; v: number } {
    const decay = Math.exp(-dtMs / tauMs);
    return { dist: v * tauMs * (1 - decay), v: v * decay };
}

/** clampCenter with iOS-style rubber-band overshoot for live drags: outside the
 *  pan bounds the excess is compressed hyperbolically (soft, asymptoting to one
 *  viewport), so the view tugs past the edge and springs back on release. */
export function rubberBandCenter(center: PzPoint, zoom: number, contentW: number, contentH: number,
                                 viewportW: number, viewportH: number, keep: number = 0.25,
                                 c: number = 0.55): PzPoint {
    const soft = (over: number, d: number): number => (1 - 1 / ((over * c) / d + 1)) * d;
    const axis = (v: number, content: number, viewport: number): number => {
        const d = viewport / zoom;                    // one viewport, in content units
        const half = d / 2;
        if (content <= d) {
            // smaller than the viewport: tug around the centered anchor
            const anchor = content / 2;
            const over = v - anchor;
            return anchor + Math.sign(over) * soft(Math.abs(over), d);
        }
        const slack = half * 2 * (1 - keep);
        const min = half - slack;
        const max = content - half + slack;
        if (v < min) {
            return min - soft(min - v, d);
        }
        if (v > max) {
            return max + soft(v - max, d);
        }
        return v;
    };
    return { x: axis(center.x, contentW, viewportW), y: axis(center.y, contentH, viewportH) };
}

/** How a pan release resolves — an overpanned drag springs back, a fast enough
 *  flick glides out, anything else just comes to rest. */
export interface PzRelease {
    kind: 'spring' | 'glide' | 'rest';
    hard: PzViewport;   // the clamped position (always the one written)
    soft: PzViewport;   // the rubber-banded draft to spring back from (== hard unless 'spring')
}

/** Resolve the end of a pan drag: `un` is the unclamped drag result at release.
 *  Overpan is checked first so a flick past the edge springs back instead of
 *  gliding into the void. Velocity is px/ms (from dragVelocity). */
export function panRelease(un: PzViewport, velocity: PzPoint,
                           contentW: number, contentH: number,
                           viewportW: number, viewportH: number,
                           minZoom: number, maxZoom: number,
                           glideMinV: number = 0.25): PzRelease {
    const zoom = clampZoom(un.zoom, minZoom, maxZoom);
    const hard: PzViewport = {
        zoom,
        center: clampCenter(un.center, zoom, contentW, contentH, viewportW, viewportH)
    };
    const overpanned = Math.abs(hard.center.x - un.center.x) > 0.5
        || Math.abs(hard.center.y - un.center.y) > 0.5;
    if (overpanned) {
        return {
            kind: 'spring', hard,
            soft: { zoom, center: rubberBandCenter(un.center, zoom, contentW, contentH, viewportW, viewportH) }
        };
    }
    return { kind: Math.hypot(velocity.x, velocity.y) > glideMinV ? 'glide' : 'rest', hard, soft: hard };
}

/** Two-finger pinch, relative to the GESTURE START: scale by the finger-distance
 *  ratio and keep the content point that began under the fingers' midpoint under
 *  the (possibly moving) midpoint — so a pinch both zooms and pans naturally. */
export function pinchViewport(startVp: PzViewport, startMid: PzPoint, mid: PzPoint,
                              startDist: number, dist: number,
                              viewportW: number, viewportH: number,
                              minZoom: number, maxZoom: number): PzViewport {
    const zoom = clampZoom(startVp.zoom * (startDist > 0 ? dist / startDist : 1), minZoom, maxZoom);
    const t = viewTransform(startVp, viewportW, viewportH);
    const contentMid = { x: (startMid.x - t.tx) / startVp.zoom, y: (startMid.y - t.ty) / startVp.zoom };
    return {
        zoom,
        center: {
            x: contentMid.x + (viewportW / 2 - mid.x) / zoom,
            y: contentMid.y + (viewportH / 2 - mid.y) / zoom
        }
    };
}

/** A named point of interest (data.pois): a fly-to target by name; `zoom` 0 keeps
 *  the current zoom when flying; `flagged` drives edge indicators + pulse ring. */
export interface PzPoi {
    name: string;
    x: number;
    y: number;
    zoom: number;
    flagged: boolean;
}

/** A content point in viewport pixels under the given viewport. */
export function contentToViewportPt(pt: PzPoint, vp: PzViewport, viewportW: number, viewportH: number): PzPoint {
    const t = viewTransform(vp, viewportW, viewportH);
    return { x: pt.x * vp.zoom + t.tx, y: pt.y * vp.zoom + t.ty };
}

/** True when the whole content fits inside the viewport (nothing to navigate —
 *  the minimap hides itself). */
export function contentFullyVisible(vp: PzViewport, contentW: number, contentH: number,
                                    viewportW: number, viewportH: number): boolean {
    return contentW * vp.zoom <= viewportW + 0.5 && contentH * vp.zoom <= viewportH + 0.5;
}

/** Minimap geometry: the content scaled into a maxW×maxH box (aspect preserved). */
export function minimapLayout(contentW: number, contentH: number, maxW: number, maxH: number):
    { w: number; h: number; scale: number } {
    if (contentW <= 0 || contentH <= 0) {
        return { w: maxW, h: maxH, scale: 1 };
    }
    const scale = Math.min(maxW / contentW, maxH / contentH);
    return { w: Math.max(1, Math.round(contentW * scale)), h: Math.max(1, Math.round(contentH * scale)), scale };
}

/** The current viewport as a rectangle in minimap pixels. */
export function minimapViewRect(vp: PzViewport, viewportW: number, viewportH: number, scale: number):
    { x: number; y: number; w: number; h: number } {
    const w = (viewportW / vp.zoom) * scale;
    const h = (viewportH / vp.zoom) * scale;
    return {
        x: vp.center.x * scale - w / 2,
        y: vp.center.y * scale - h / 2,
        w,
        h
    };
}

/** Where a (possibly off-screen) point's edge indicator sits: the point clamped
 *  into the viewport with an inset margin per axis (the chip is wider than
 *  tall), plus the angle (deg, 0 = right) from the indicator toward the real
 *  point. `onScreen` = no indicator needed. */
export function edgeIndicator(poiPt: PzPoint, viewportW: number, viewportH: number,
                              insetX: number, insetY: number):
    { onScreen: boolean; x: number; y: number; angle: number } {
    const onScreen = poiPt.x >= 0 && poiPt.x <= viewportW && poiPt.y >= 0 && poiPt.y <= viewportH;
    const x = Math.max(insetX, Math.min(viewportW - insetX, poiPt.x));
    const y = Math.max(insetY, Math.min(viewportH - insetY, poiPt.y));
    return { onScreen, x, y, angle: Math.atan2(poiPt.y - y, poiPt.x - x) * 180 / Math.PI };
}

/** The viewport at progress k (0..1) of a fly-to animation: ease-in-out, with the
 *  zoom interpolated in log space (a constant zoom-FACTOR per step feels linear). */
export function flyStep(from: PzViewport, target: PzViewport, k: number): PzViewport {
    const kk = Math.max(0, Math.min(1, k));
    const e = kk < 0.5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2;
    return {
        zoom: from.zoom * Math.pow(target.zoom / from.zoom, e),
        center: {
            x: from.center.x + (target.center.x - from.center.x) * e,
            y: from.center.y + (target.center.y - from.center.y) * e
        }
    };
}
