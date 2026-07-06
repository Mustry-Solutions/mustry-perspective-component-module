import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d,
    View,
    ViewStateType
} from '@inductiveautomation/perspective-client';
import { PzLabels, pzLabelBase } from '../../shared/labelPacks';
import {
    PzPoint, PzViewport, clampCenter, clampZoom, fitZoom, flyStep, homeViewport,
    panBy, pinchViewport, resolveViewport, viewTransform, zoomAt
} from './panZoomLogic';
import { PanZoomProps, mapPanZoomProps } from './pzProps';

// Must match PanZoomView.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.panzoomview';

interface PanZoomState {
    viewportW: number;
    viewportH: number;
    // Local echo of the viewport while navigating: gestures write here for
    // instant feedback; the two-way state.zoom/center write is debounced and
    // the draft clears once the props echo it back (house draft pattern).
    draft: PzViewport | null;
    viewState: string;
}

/**
 * Embeds any Perspective view (config.viewPath + viewParams) inside a clipped,
 * pannable, zoomable viewport. `state.zoom`/`state.center` are two-way: bind or
 * script them to fly the viewport ("center on Pump 3 on alarm"). config.home is
 * the reset target (zoom 0 = fit; x/y -1 = content center). Drag pans past a
 * threshold, so clicks INSIDE the embedded view keep working; wheel zooms
 * toward the cursor.
 */
export class PanZoomView extends Component<ComponentProps<PanZoomProps>, PanZoomState> {

    private viewportRef = React.createRef<HTMLDivElement>();
    private resizeObs: ResizeObserver | null = null;
    private writeTimer = 0;
    private lastWritten = '';
    // gesture state (instance-level so one-finger pan hands over to two-finger pinch)
    private pointers = new Map<number, PzPoint>();
    private panStart: { x: number; y: number; vp: PzViewport } | null = null;
    private panning = false;
    private pinchStart: { mid: PzPoint; dist: number; vp: PzViewport } | null = null;
    // fly-to animation (visual only — the target is already in props)
    private flyRaf = 0;
    private flyTimeout = 0;

    constructor(props: ComponentProps<PanZoomProps>) {
        super(props);
        this.state = { viewportW: 0, viewportH: 0, draft: null, viewState: '' };
    }

    componentDidMount(): void {
        this.measure();
        const el = this.viewportRef.current;
        if (typeof ResizeObserver !== 'undefined' && el) {
            this.resizeObs = new ResizeObserver(() => this.measure());
            this.resizeObs.observe(el);
        }
        // React delegates wheel listeners passively, so preventDefault (and with
        // it, reliable zoom-instead-of-scroll) needs a NATIVE non-passive listener.
        el?.addEventListener('wheel', this.onWheel, { passive: false });
        // move attaches natively so pointer capture keeps feeding it during
        // pan/pinch; up/cancel live on window so a release OUTSIDE the viewport
        // (pre-capture) still ends the gesture instead of leaking a tracked pointer.
        el?.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
    }

    componentDidUpdate(prevProps: ComponentProps<PanZoomProps>): void {
        const p = this.props.props;
        const d = this.state.draft;
        if (d && !this.flyRaf && Math.abs(p.zoom - d.zoom) < 1e-6
            && Math.abs(p.center.x - d.center.x) < 0.5
            && Math.abs(p.center.y - d.center.y) < 0.5) {
            this.setState({ draft: null });   // the write echoed back; props lead again
        }
        // An EXTERNAL state write (script/binding fly-to) — not the echo of our own
        // gesture write — animates the viewport to the new target.
        const q = prevProps.props;
        const changed = Math.abs(p.zoom - q.zoom) > 1e-6
            || Math.abs(p.center.x - q.center.x) > 0.5
            || Math.abs(p.center.y - q.center.y) > 0.5;
        if (changed) {
            const sig = `${p.zoom.toFixed(4)}|${Math.round(p.center.x)}|${Math.round(p.center.y)}`;
            if (sig !== this.lastWritten) {
                this.startFly(q);
            }
        }
    }

    componentWillUnmount(): void {
        const el = this.viewportRef.current;
        el?.removeEventListener('wheel', this.onWheel);
        el?.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        this.cancelFly();
        if (this.resizeObs) {
            this.resizeObs.disconnect();
        }
        if (this.writeTimer) {
            window.clearTimeout(this.writeTimer);
        }
    }

    private measure(): void {
        const el = this.viewportRef.current;
        if (el && (el.clientWidth !== this.state.viewportW || el.clientHeight !== this.state.viewportH)) {
            this.setState({ viewportW: el.clientWidth, viewportH: el.clientHeight });
        }
    }

    /** The viewport being displayed: the in-flight draft, else the two-way state. */
    private vp(): PzViewport {
        if (this.state.draft) {
            return this.state.draft;
        }
        const p = this.props.props;
        return resolveViewport(p.zoom, p.center, p.home,
            p.contentWidth, p.contentHeight, this.state.viewportW, this.state.viewportH,
            p.minZoom, p.maxZoom);
    }

    private resolveFor(zoom: number, center: PzPoint): PzViewport {
        const p = this.props.props;
        return resolveViewport(zoom, center, p.home, p.contentWidth, p.contentHeight,
            this.state.viewportW, this.state.viewportH, p.minZoom, p.maxZoom);
    }

    // --- fly-to animation ------------------------------------------------------------
    private cancelFly(): void {
        if (this.flyRaf) {
            window.cancelAnimationFrame(this.flyRaf);
            this.flyRaf = 0;
        }
        if (this.flyTimeout) {
            window.clearTimeout(this.flyTimeout);
            this.flyTimeout = 0;
        }
    }

    /** Animate from what's on screen to the (already-in-props) target. Visual only:
     *  the draft interpolates and then clears so props lead again — no state writes. */
    private startFly(prev: PanZoomProps): void {
        const p = this.props.props;
        this.cancelFly();
        // rAF doesn't fire in background/hidden tabs — snap there instead of animating
        if (p.flyToMs <= 0 || this.state.viewportW <= 0 || document.hidden) {
            this.setState({ draft: null });
            return;
        }
        const from = this.state.draft || this.resolveFor(prev.zoom, prev.center);
        const target = this.resolveFor(p.zoom, p.center);
        if (Math.abs(from.zoom - target.zoom) < 1e-6
            && Math.abs(from.center.x - target.center.x) < 0.5
            && Math.abs(from.center.y - target.center.y) < 0.5) {
            this.setState({ draft: null });
            return;
        }
        const t0 = performance.now();
        const step = (now: number): void => {
            const k = (now - t0) / p.flyToMs;
            if (k >= 1) {
                this.flyRaf = 0;
                this.cancelFly();
                this.setState({ draft: null });   // land exactly on the props target
                return;
            }
            this.setState({ draft: flyStep(from, target, k) });
            this.flyRaf = window.requestAnimationFrame(step);
        };
        this.flyRaf = window.requestAnimationFrame(step);
        // safety net: if rAF stalls (tab hidden mid-flight), land after the duration
        this.flyTimeout = window.setTimeout(() => {
            if (this.flyRaf) {
                window.cancelAnimationFrame(this.flyRaf);
                this.flyRaf = 0;
                this.setState({ draft: null });
            }
        }, p.flyToMs + 250);
    }

    /** Show `next` immediately and write it (debounced) to the two-way state. */
    private applyViewport(next: PzViewport, immediate: boolean = false): void {
        this.cancelFly();   // a gesture always takes over from an in-flight fly
        const p = this.props.props;
        const clamped: PzViewport = {
            zoom: clampZoom(next.zoom, p.minZoom, p.maxZoom),
            center: clampCenter(next.center, clampZoom(next.zoom, p.minZoom, p.maxZoom),
                p.contentWidth, p.contentHeight, this.state.viewportW, this.state.viewportH)
        };
        this.setState({ draft: clamped });
        if (this.writeTimer) {
            window.clearTimeout(this.writeTimer);
        }
        const write = (): void => {
            const sig = `${clamped.zoom.toFixed(4)}|${Math.round(clamped.center.x)}|${Math.round(clamped.center.y)}`;
            if (sig !== this.lastWritten) {
                this.lastWritten = sig;
                this.props.store.props.write('state', {
                    zoom: clamped.zoom,
                    center: { x: Math.round(clamped.center.x), y: Math.round(clamped.center.y) }
                });
            }
        };
        if (immediate) {
            write();
        } else {
            this.writeTimer = window.setTimeout(write, 200);
        }
    }

    // --- gestures -----------------------------------------------------------------
    // One finger/button pans (past a threshold, so clicks inside the embedded view
    // survive); a second touch upgrades the gesture to a pinch (zoom + pan relative
    // to the pinch start); lifting back to one finger continues as a pan.

    private midAndDist(): { mid: PzPoint; dist: number } {
        const pts = Array.from(this.pointers.values());
        const rect = this.viewportRef.current!.getBoundingClientRect();
        const mid = {
            x: (pts[0].x + pts[1].x) / 2 - rect.left,
            y: (pts[0].y + pts[1].y) / 2 - rect.top
        };
        return { mid, dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) };
    }

    /** Swallow the click that a pan/pinch on this element would otherwise produce. */
    private suppressNextClick(el: HTMLElement): void {
        el.addEventListener('click', (ce) => {
            ce.stopPropagation();
            ce.preventDefault();
        }, { capture: true, once: true });
    }

    private onPointerDown = (e: React.PointerEvent): void => {
        if (e.pointerType === 'mouse' && e.button !== 0) {
            return;
        }
        const el = this.viewportRef.current;
        if (!el) {
            return;
        }
        if (e.pointerType === 'mouse') {
            this.pointers.clear();   // a mouse is always a fresh single-pointer gesture
        }
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 1) {
            this.panStart = { x: e.clientX, y: e.clientY, vp: this.vp() };
            this.panning = false;
        } else if (this.pointers.size === 2) {
            // second finger: the gesture becomes a pinch (capture both immediately —
            // two fingers down is never a click)
            this.panStart = null;
            this.pinchStart = { ...this.midAndDist(), vp: this.vp() };
            this.pointers.forEach((_, id) => {
                try {
                    el.setPointerCapture(id);
                } catch (ignored) { /* pointer may already be gone */ }
            });
            el.classList.add('pz-panning');
        }
    };

    private onPointerMove = (ev: PointerEvent): void => {
        if (!this.pointers.has(ev.pointerId)) {
            return;
        }
        this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        const el = this.viewportRef.current;
        if (!el) {
            return;
        }
        if (this.pinchStart && this.pointers.size >= 2) {
            const p = this.props.props;
            const { mid, dist } = this.midAndDist();
            this.applyViewport(pinchViewport(this.pinchStart.vp, this.pinchStart.mid, mid,
                this.pinchStart.dist, dist, this.state.viewportW, this.state.viewportH,
                p.minZoom, p.maxZoom));
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
                this.applyViewport(panBy(this.panStart.vp, dx, dy));
            }
        }
    };

    private onPointerUp = (ev: PointerEvent): void => {
        if (!this.pointers.delete(ev.pointerId)) {
            return;
        }
        const el = this.viewportRef.current;
        if (!el) {
            return;
        }
        if (this.pinchStart) {
            if (this.pointers.size < 2) {
                this.pinchStart = null;
                this.applyViewport(this.vp(), true);   // flush the pinch result
                const rest = Array.from(this.pointers.values())[0];
                if (rest) {
                    // one finger stays down: continue as a pan from here
                    this.panStart = { x: rest.x, y: rest.y, vp: this.vp() };
                    this.panning = true;
                } else {
                    el.classList.remove('pz-panning');
                    this.suppressNextClick(el);
                }
            }
            return;
        }
        if (this.panStart) {
            if (this.panning) {
                // final position: flush the write and swallow the click this drag made
                this.applyViewport(panBy(this.panStart.vp,
                    ev.clientX - this.panStart.x, ev.clientY - this.panStart.y), true);
                this.suppressNextClick(el);
            }
            this.panStart = null;
            this.panning = false;
            el.classList.remove('pz-panning');
        }
    };

    private onWheel = (e: WheelEvent): void => {
        const p = this.props.props;
        if (!p.wheelZoom) {
            return;
        }
        e.preventDefault();
        const el = this.viewportRef.current;
        if (!el) {
            return;
        }
        const rect = el.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const cur = this.vp();
        const factor = e.deltaY < 0 ? p.zoomStep : 1 / p.zoomStep;
        const nextZoom = clampZoom(cur.zoom * factor, p.minZoom, p.maxZoom);
        this.applyViewport(zoomAt(cur, pt, nextZoom, this.state.viewportW, this.state.viewportH));
    };

    private onDoubleClick = (e: React.MouseEvent): void => {
        const p = this.props.props;
        if (!p.doubleClickZoom) {
            return;
        }
        const el = this.viewportRef.current;
        if (!el) {
            return;
        }
        const rect = el.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const cur = this.vp();
        const nextZoom = clampZoom(cur.zoom * p.zoomStep * p.zoomStep, p.minZoom, p.maxZoom);
        this.applyViewport(zoomAt(cur, pt, nextZoom, this.state.viewportW, this.state.viewportH), true);
    };

    private zoomStepBy(dir: 1 | -1): void {
        const p = this.props.props;
        const cur = this.vp();
        const nextZoom = clampZoom(dir > 0 ? cur.zoom * p.zoomStep : cur.zoom / p.zoomStep, p.minZoom, p.maxZoom);
        const centerPt = { x: this.state.viewportW / 2, y: this.state.viewportH / 2 };
        this.applyViewport(zoomAt(cur, centerPt, nextZoom, this.state.viewportW, this.state.viewportH), true);
    }

    private goHome = (): void => {
        const p = this.props.props;
        this.applyViewport(homeViewport(p.home, p.contentWidth, p.contentHeight,
            this.state.viewportW, this.state.viewportH, p.minZoom, p.maxZoom), true);
    };

    private fit = (): void => {
        const p = this.props.props;
        const zoom = clampZoom(fitZoom(p.contentWidth, p.contentHeight, this.state.viewportW, this.state.viewportH),
            p.minZoom, p.maxZoom);
        this.applyViewport({ zoom, center: { x: p.contentWidth / 2, y: p.contentHeight / 2 } }, true);
    };

    // --- rendering ------------------------------------------------------------------
    private labels(): PzLabels {
        return pzLabelBase(this.props.props.locale);
    }

    private renderControls(): React.ReactNode {
        if (!this.props.props.showControls) {
            return null;
        }
        const L = this.labels();
        return (
            <div className="pz-controls">
                <button type="button" title={L.zoomIn} aria-label={L.zoomIn} onClick={() => this.zoomStepBy(1)}>+</button>
                <button type="button" title={L.zoomOut} aria-label={L.zoomOut} onClick={() => this.zoomStepBy(-1)}>−</button>
                <button type="button" title={L.home} aria-label={L.home} onClick={this.goHome}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3 11h2v8h5v-5h4v5h5v-8h2z" /></svg>
                </button>
                <button type="button" title={L.fit} aria-label={L.fit} onClick={this.fit}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3H4zm11-5h5v5h-2V6h-3V4zM4 15h2v3h3v2H4v-5zm14 0h2v5h-5v-2h3v-3z" /></svg>
                </button>
            </div>
        );
    }

    render(): React.ReactNode {
        const p = this.props.props;
        const store = this.props.store;
        const client = store.clientStore;
        const vp = this.vp();
        const t = viewTransform(vp, this.state.viewportW, this.state.viewportH);
        const mountPath = `${store.view.mountPath}.pz${store.addressPath.join('_')}`;
        return (
            <div {...this.props.emit({ classes: ['mustry-panzoom'] })}>
                <div
                    className="pz-viewport"
                    ref={this.viewportRef}
                    onPointerDown={this.onPointerDown}
                    onDoubleClick={this.onDoubleClick}
                >
                    <div
                        className="pz-content"
                        style={{
                            width: p.contentWidth,
                            height: p.contentHeight,
                            transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`
                        }}
                    >
                        {p.viewPath && client ? (
                            <View
                                store={client}
                                resourcePath={p.viewPath}
                                mountPath={mountPath}
                                parent={store}
                                params={p.viewParams}
                                useDefaultWidth={false}
                                useDefaultHeight={false}
                                onViewStateChange={(vs: ViewStateType) => {
                                    if (vs !== this.state.viewState) {
                                        this.setState({ viewState: vs });
                                        this.props.store.props.write('output.viewState', vs);
                                    }
                                }}
                            />
                        ) : (
                            <div className="pz-placeholder">{p.viewPath ? '' : 'config.viewPath'}</div>
                        )}
                    </div>
                    {this.renderControls()}
                    <div className="pz-zoom-badge">{Math.round(vp.zoom * 100)}%</div>
                </div>
            </div>
        );
    }
}

export class PanZoomViewMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return PanZoomView;
    }

    getDefaultSize(): Size2d {
        return { width: 640, height: 420 };
    }

    getPropsReducer(tree: PropertyTree): PanZoomProps {
        return mapPanZoomProps(tree);
    }
}
