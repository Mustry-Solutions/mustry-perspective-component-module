// The pan & zoom pointer gesture controller: owns the tracked pointers and the
// in-flight pan/pinch (one finger/button pans past a threshold so clicks inside
// the embedded view survive; a second touch upgrades the gesture to a pinch;
// lifting back to one finger continues as a pan), plus wheel and double-click
// zoom. Geometry and the release decision are pure functions in panZoomLogic.ts;
// viewport changes flow back through PzGestureHost (the same architecture as the
// calendar's calendarGestureController). Unlike the calendar/timeline gestures,
// these are CONTINUOUS — every move applies a viewport rather than previewing a
// commit — so the host also exposes the animation hand-offs (freeze-on-grab,
// spring-back, glide); the animations themselves stay in the component.
import * as React from 'react';
import {
    PzDragSample, PzPoint, PzViewport, clampZoom, dragVelocity, panBy, panRelease,
    pinchViewport, wheelZoomFactor, zoomAt
} from './panZoomLogic';

/** The prop/layout values a gesture reads — fetched per event so mid-gesture
 *  prop edits and viewport resizes are honoured. */
export interface PzGestureEnv {
    minZoom: number;
    maxZoom: number;
    zoomStep: number;
    wheelZoom: boolean;
    doubleClickZoom: boolean;
    contentW: number;      // effective content size (configured, or measured when auto)
    contentH: number;
    viewportW: number;
    viewportH: number;
}

export interface PzGestureHost {
    env(): PzGestureEnv;
    vp(): PzViewport;                       // the viewport on screen (draft or props)
    motionActive(): boolean;                // a fly/glide is animating (a grab freezes it)
    apply(next: PzViewport, immediate?: boolean, soft?: boolean): void;
    springBack(from: PzViewport, to: PzViewport): void;   // overpan release
    glide(vx: number, vy: number): void;                  // flick release
}

export class PanZoomGestureController {
    private el: HTMLElement | null = null;
    // instance-level so one-finger pan hands over to two-finger pinch and back
    private pointers = new Map<number, PzPoint>();
    private panStart: { x: number; y: number; vp: PzViewport } | null = null;
    private panning = false;
    private pinchStart: { mid: PzPoint; dist: number; vp: PzViewport } | null = null;
    private dragSamples: PzDragSample[] = [];
    private clickSwallower: ((ce: MouseEvent) => void) | null = null;

    constructor(private host: PzGestureHost) {}

    /** Native listeners: React delegates wheel passively, so preventDefault (and
     *  with it, reliable zoom-instead-of-scroll) needs a NATIVE non-passive
     *  listener. Move attaches natively so pointer capture keeps feeding it
     *  during pan/pinch; up/cancel live on window so a release OUTSIDE the
     *  viewport (pre-capture) still ends the gesture instead of leaking a
     *  tracked pointer. */
    attach(el: HTMLElement): void {
        this.el = el;
        el.addEventListener('wheel', this.onWheel, { passive: false });
        // capture-phase so it runs even when a child of the embedded view stops
        // pointerdown propagation before the viewport's React handler would
        el.addEventListener('pointerdown', this.onNativePointerDown, true);
        el.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
    }

    dispose(): void {
        this.disarmClickSwallower();
        this.el?.removeEventListener('wheel', this.onWheel);
        this.el?.removeEventListener('pointerdown', this.onNativePointerDown, true);
        this.el?.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        this.el = null;
    }

    private midAndDist(): { mid: PzPoint; dist: number } {
        const pts = Array.from(this.pointers.values());
        const rect = this.el!.getBoundingClientRect();
        const mid = {
            x: (pts[0].x + pts[1].x) / 2 - rect.left,
            y: (pts[0].y + pts[1].y) / 2 - rect.top
        };
        return { mid, dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) };
    }

    /** Swallow the click that a pan/pinch on this element would otherwise produce.
     *  The swallower must be disarmed on the next pointerdown: a release via
     *  pointercancel (or one that escaped capture and landed outside) produces NO
     *  click, and the leftover once-listener would eat the next legitimate one. */
    private suppressNextClick(el: HTMLElement): void {
        this.disarmClickSwallower();
        const swallow = (ce: MouseEvent): void => {
            this.clickSwallower = null;
            ce.stopPropagation();
            ce.preventDefault();
        };
        this.clickSwallower = swallow;
        el.addEventListener('click', swallow, { capture: true, once: true });
    }

    private disarmClickSwallower(): void {
        if (this.clickSwallower) {
            this.el?.removeEventListener('click', this.clickSwallower, true);
            this.clickSwallower = null;
        }
    }

    /** Any fresh interaction disarms a swallower a completed gesture left armed
     *  (a pan's own click arrives before any next pointerdown, so this never
     *  un-swallows the click it was armed for). Native + capture because a child
     *  of the embedded view may stop pointerdown before the React handler runs. */
    private onNativePointerDown = (): void => {
        this.disarmClickSwallower();
    };

    /** React handler for the viewport element's onPointerDown. */
    pointerDown = (e: React.PointerEvent): void => {
        if (e.pointerType === 'mouse' && e.button !== 0) {
            return;
        }
        const el = this.el;
        if (!el) {
            return;
        }
        if (e.pointerType === 'mouse') {
            this.pointers.clear();   // a mouse is always a fresh single-pointer gesture
        }
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 1) {
            // grabbing mid-fly/glide freezes the view where it is (and writes it)
            if (this.host.motionActive()) {
                this.host.apply(this.host.vp(), true);
            }
            this.panStart = { x: e.clientX, y: e.clientY, vp: this.host.vp() };
            this.panning = false;
            this.dragSamples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
        } else if (this.pointers.size === 2) {
            // second finger: the gesture becomes a pinch (capture both immediately —
            // two fingers down is never a click)
            this.panStart = null;
            this.pinchStart = { ...this.midAndDist(), vp: this.host.vp() };
            this.pointers.forEach((_, id) => {
                try {
                    el.setPointerCapture(id);
                } catch (ignored) { /* pointer may already be gone */ }
            });
            el.classList.add('pz-panning');
        }
    };

    /** React handler for the viewport element's onDoubleClick. */
    doubleClick = (e: React.MouseEvent): void => {
        const env = this.host.env();
        const el = this.el;
        if (!env.doubleClickZoom || !el) {
            return;
        }
        const rect = el.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const cur = this.host.vp();
        const nextZoom = clampZoom(cur.zoom * env.zoomStep * env.zoomStep, env.minZoom, env.maxZoom);
        this.host.apply(zoomAt(cur, pt, nextZoom, env.viewportW, env.viewportH), true);
    };

    private onPointerMove = (ev: PointerEvent): void => {
        if (!this.pointers.has(ev.pointerId)) {
            return;
        }
        this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        const el = this.el;
        if (!el) {
            return;
        }
        if (this.pinchStart && this.pointers.size >= 2) {
            const env = this.host.env();
            const { mid, dist } = this.midAndDist();
            this.host.apply(pinchViewport(this.pinchStart.vp, this.pinchStart.mid, mid,
                this.pinchStart.dist, dist, env.viewportW, env.viewportH,
                env.minZoom, env.maxZoom));
            return;
        }
        if (this.panStart) {
            const dx = ev.clientX - this.panStart.x;
            const dy = ev.clientY - this.panStart.y;
            if (!this.panning && Math.hypot(dx, dy) > 5) {
                this.panning = true;
                try {
                    el.setPointerCapture(ev.pointerId);   // only capture once it IS a pan
                } catch (ignored) { /* ignore */ }
                el.classList.add('pz-panning');
            }
            if (this.panning) {
                this.dragSamples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
                if (this.dragSamples.length > 8) {
                    this.dragSamples.shift();
                }
                this.host.apply(panBy(this.panStart.vp, dx, dy), false, true);   // soft: rubber-band past the bounds
            }
        }
    };

    private onPointerUp = (ev: PointerEvent): void => {
        if (!this.pointers.delete(ev.pointerId)) {
            return;
        }
        const el = this.el;
        if (!el) {
            return;
        }
        if (this.pinchStart) {
            if (this.pointers.size < 2) {
                this.pinchStart = null;
                this.host.apply(this.host.vp(), true);   // flush the pinch result
                const rest = Array.from(this.pointers.values())[0];
                if (rest) {
                    // one finger stays down: continue as a pan from here
                    this.panStart = { x: rest.x, y: rest.y, vp: this.host.vp() };
                    this.panning = true;
                    this.dragSamples = [{ t: ev.timeStamp, x: rest.x, y: rest.y }];
                } else {
                    el.classList.remove('pz-panning');
                    if (ev.type !== 'pointercancel') {
                        this.suppressNextClick(el);   // a canceled pointer never produces a click
                    }
                }
            }
            return;
        }
        if (this.panStart) {
            if (this.panning) {
                const env = this.host.env();
                const un = panBy(this.panStart.vp,
                    ev.clientX - this.panStart.x, ev.clientY - this.panStart.y);
                this.dragSamples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
                const v = dragVelocity(this.dragSamples);
                const rel = panRelease(un, v, env.contentW, env.contentH,
                    env.viewportW, env.viewportH, env.minZoom, env.maxZoom);
                this.host.apply(un, true, rel.kind === 'spring');   // write the hard clamp; keep a soft draft if stretched
                if (rel.kind === 'spring') {
                    this.host.springBack(rel.soft, rel.hard);       // spring back to the hard bound
                } else if (rel.kind === 'glide') {
                    this.host.glide(v.x, v.y);                      // flick: glide out with friction
                }
                if (ev.type !== 'pointercancel') {
                    this.suppressNextClick(el);   // a canceled pointer never produces a click
                }
            }
            this.panStart = null;
            this.panning = false;
            el.classList.remove('pz-panning');
        }
    };

    private onWheel = (e: WheelEvent): void => {
        const env = this.host.env();
        const el = this.el;
        if (!env.wheelZoom || !el) {
            return;
        }
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const cur = this.host.vp();
        // proportional: a mouse tick is one zoomStep, trackpad pinch deltas are smooth
        const factor = wheelZoomFactor(e.deltaY, e.deltaMode, env.zoomStep);
        const nextZoom = clampZoom(cur.zoom * factor, env.minZoom, env.maxZoom);
        this.host.apply(zoomAt(cur, pt, nextZoom, env.viewportW, env.viewportH));
    };
}
