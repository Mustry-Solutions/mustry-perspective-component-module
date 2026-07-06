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
