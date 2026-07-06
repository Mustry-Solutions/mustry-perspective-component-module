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
