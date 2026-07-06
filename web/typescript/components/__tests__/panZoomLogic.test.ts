import {
    clampCenter, clampZoom, contentFullyVisible, contentToViewportPt, edgeIndicator,
    fitZoom, flyStep, homeViewport, minimapLayout, minimapViewRect, panBy,
    pinchViewport, resolveViewport, viewTransform, zoomAt
} from '../panzoom/panZoomLogic';

// content 2000x1200, viewport 800x600 throughout
const CW = 2000, CH = 1200, VW = 800, VH = 600;

describe('fitZoom / clampZoom', () => {
    it('fits the limiting axis with the margin', () => {
        expect(fitZoom(CW, CH, VW, VH)).toBeCloseTo(Math.min(800 / 2000, 600 / 1200) * 0.95, 5);
        expect(fitZoom(0, CH, VW, VH)).toBe(1);   // degenerate input
    });

    it('clamps into [min, max] with an absolute floor', () => {
        expect(clampZoom(99, 0.1, 8)).toBe(8);
        expect(clampZoom(0.001, 0.1, 8)).toBe(0.1);
        expect(clampZoom(0.001, 0, 8)).toBe(0.01);
    });
});

describe('clampCenter', () => {
    it('keeps content covering the viewport (with overpan slack) and centers small content', () => {
        const c = clampCenter({ x: -5000, y: 600 }, 1, CW, CH, VW, VH);
        // the bound: at least 25% of the viewport keeps content on it. With an
        // 800px viewport at zoom 1 that's center >= -200 (content edge at 75%).
        expect(c.x).toBe(-200);
        expect(c.y).toBe(600);
        // zoomed out so content is smaller than the viewport: centered
        const small = clampCenter({ x: 0, y: 0 }, 0.2, CW, CH, VW, VH);
        expect(small.x).toBe(CW / 2);
        expect(small.y).toBe(CH / 2);
    });
});

describe('resolveViewport / homeViewport', () => {
    it('unset zoom resolves to home; home zoom 0 = fit; x/y -1 = content center', () => {
        const vp = resolveViewport(0, { x: 0, y: 0 }, { x: -1, y: -1, zoom: 0 }, CW, CH, VW, VH, 0.1, 8);
        expect(vp.zoom).toBeCloseTo(fitZoom(CW, CH, VW, VH), 5);
        expect(vp.center).toEqual({ x: CW / 2, y: CH / 2 });
    });

    it('a set state wins and is clamped', () => {
        const vp = resolveViewport(2, { x: 100, y: 100 }, { x: -1, y: -1, zoom: 0 }, CW, CH, VW, VH, 0.1, 8);
        expect(vp.zoom).toBe(2);
        expect(vp.center.x).toBeGreaterThanOrEqual(100);   // clamped toward validity
    });

    it('an explicit home point + zoom is honoured', () => {
        const vp = homeViewport({ x: 1500, y: 300, zoom: 2 }, CW, CH, VW, VH, 0.1, 8);
        expect(vp).toEqual({ zoom: 2, center: { x: 1500, y: 300 } });
    });
});

describe('viewTransform / zoomAt / panBy (the invariants that matter)', () => {
    const vp = { zoom: 1, center: { x: 1000, y: 600 } };

    it('the center point lands at the viewport middle', () => {
        const t = viewTransform(vp, VW, VH);
        expect(t.tx + vp.center.x * vp.zoom).toBeCloseTo(VW / 2, 5);
        expect(t.ty + vp.center.y * vp.zoom).toBeCloseTo(VH / 2, 5);
    });

    it('zoomAt keeps the content under the anchor stationary', () => {
        const anchor = { x: 200, y: 150 };   // viewport pixel
        const t0 = viewTransform(vp, VW, VH);
        const contentAtAnchor = { x: (anchor.x - t0.tx) / vp.zoom, y: (anchor.y - t0.ty) / vp.zoom };
        const zoomed = zoomAt(vp, anchor, 2, VW, VH);
        const t1 = viewTransform(zoomed, VW, VH);
        expect(contentAtAnchor.x * 2 + t1.tx).toBeCloseTo(anchor.x, 4);
        expect(contentAtAnchor.y * 2 + t1.ty).toBeCloseTo(anchor.y, 4);
    });

    it('panBy moves the content WITH the pointer, scaled by zoom', () => {
        expect(panBy(vp, 100, -50).center).toEqual({ x: 900, y: 650 });
        expect(panBy({ ...vp, zoom: 2 }, 100, 0).center.x).toBe(950);
    });
});

describe('pinchViewport', () => {
    const start = { zoom: 1, center: { x: 1000, y: 600 } };
    const mid0 = { x: 300, y: 200 };

    it('scales by the finger-distance ratio (clamped) with a stationary midpoint anchored', () => {
        const pinched = pinchViewport(start, mid0, mid0, 100, 200, VW, VH, 0.1, 8);
        expect(pinched.zoom).toBe(2);
        // the content that was under the midpoint is still under it
        const t0 = viewTransform(start, VW, VH);
        const contentMid = { x: (mid0.x - t0.tx) / start.zoom, y: (mid0.y - t0.ty) / start.zoom };
        const t1 = viewTransform(pinched, VW, VH);
        expect(contentMid.x * pinched.zoom + t1.tx).toBeCloseTo(mid0.x, 4);
        expect(contentMid.y * pinched.zoom + t1.ty).toBeCloseTo(mid0.y, 4);
        expect(pinchViewport(start, mid0, mid0, 100, 5000, VW, VH, 0.1, 8).zoom).toBe(8);
    });

    it('a moving midpoint at constant distance is a pure pan', () => {
        const moved = pinchViewport(start, mid0, { x: 400, y: 250 }, 100, 100, VW, VH, 0.1, 8);
        expect(moved.zoom).toBe(1);
        expect(moved.center).toEqual(panBy(start, 100, 50).center);
    });

    it('a zero start distance degrades to no zoom change', () => {
        expect(pinchViewport(start, mid0, mid0, 0, 150, VW, VH, 0.1, 8).zoom).toBe(1);
    });
});

describe('contentToViewportPt / contentFullyVisible', () => {
    it('round-trips a content point through the transform', () => {
        const vp = { zoom: 2, center: { x: 1000, y: 600 } };
        // the center itself lands at the viewport middle
        expect(contentToViewportPt({ x: 1000, y: 600 }, vp, VW, VH)).toEqual({ x: VW / 2, y: VH / 2 });
        // one content-unit right of center = zoom pixels right of middle
        expect(contentToViewportPt({ x: 1001, y: 600 }, vp, VW, VH).x).toBeCloseTo(VW / 2 + 2, 6);
    });

    it('fully-visible means both content axes fit at the current zoom', () => {
        expect(contentFullyVisible({ zoom: 0.3, center: { x: 0, y: 0 } }, CW, CH, VW, VH)).toBe(true);
        expect(contentFullyVisible({ zoom: 0.5, center: { x: 0, y: 0 } }, CW, CH, VW, VH)).toBe(false);
    });
});

describe('minimap geometry', () => {
    it('layout preserves the content aspect inside the box', () => {
        const l = minimapLayout(CW, CH, 160, 120);
        expect(l.scale).toBeCloseTo(160 / 2000, 6);   // width-limited (2000x1200 -> 160x96)
        expect(l.w).toBe(160);
        expect(l.h).toBe(96);
        expect(minimapLayout(0, 0, 160, 120)).toEqual({ w: 160, h: 120, scale: 1 });
    });

    it('the view rect mirrors the visible content window', () => {
        const scale = 160 / CW;
        const r = minimapViewRect({ zoom: 1, center: { x: 1000, y: 600 } }, VW, VH, scale);
        expect(r.w).toBeCloseTo(VW * scale, 6);
        expect(r.h).toBeCloseTo(VH * scale, 6);
        // centered content -> centered rect
        expect(r.x + r.w / 2).toBeCloseTo(1000 * scale, 6);
        expect(r.y + r.h / 2).toBeCloseTo(600 * scale, 6);
    });
});

describe('edgeIndicator', () => {
    it('reports on-screen points and needs no indicator', () => {
        expect(edgeIndicator({ x: 400, y: 300 }, VW, VH, 64, 18).onScreen).toBe(true);
    });

    it('clamps an off-screen point to the per-axis inset edge, pointing at it', () => {
        const right = edgeIndicator({ x: VW + 500, y: 300 }, VW, VH, 64, 18);
        expect(right.onScreen).toBe(false);
        expect(right.x).toBe(VW - 64);
        expect(right.y).toBe(300);
        expect(right.angle).toBeCloseTo(0, 5);            // due right
        const above = edgeIndicator({ x: 400, y: -200 }, VW, VH, 64, 18);
        expect(above.y).toBe(18);
        expect(above.angle).toBeCloseTo(-90, 5);          // due up
        const corner = edgeIndicator({ x: -1000, y: -1000 }, VW, VH, 64, 18);
        expect(corner.x).toBe(64);
        expect(corner.y).toBe(18);
        expect(corner.angle).toBeLessThan(-90);           // up-left quadrant
        expect(corner.angle).toBeGreaterThan(-180);
    });
});

describe('flyStep', () => {
    const from = { zoom: 0.5, center: { x: 400, y: 300 } };
    const target = { zoom: 2, center: { x: 1600, y: 900 } };

    it('starts at from, ends at target, and clamps k', () => {
        expect(flyStep(from, target, 0)).toEqual(from);
        expect(flyStep(from, target, 1).zoom).toBeCloseTo(target.zoom, 6);
        expect(flyStep(from, target, 1).center.x).toBeCloseTo(target.center.x, 6);
        expect(flyStep(from, target, -1)).toEqual(from);
        expect(flyStep(from, target, 2).zoom).toBeCloseTo(target.zoom, 6);
    });

    it('zoom interpolates in log space (halfway = geometric mean) and moves monotonically', () => {
        expect(flyStep(from, target, 0.5).zoom).toBeCloseTo(Math.sqrt(0.5 * 2), 6);
        let prev = from.zoom;
        for (let k = 0.1; k <= 1; k += 0.1) {
            const z = flyStep(from, target, k).zoom;
            expect(z).toBeGreaterThanOrEqual(prev);
            prev = z;
        }
    });
});
