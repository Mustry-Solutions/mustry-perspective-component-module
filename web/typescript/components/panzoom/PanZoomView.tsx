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
    PzPoi, PzPoint, PzViewport, clampCenter, clampZoom,
    contentFullyVisible, contentToViewportPt, edgeIndicator, fitZoom,
    flyStep, glideFrame, homeViewport, minimapLayout, minimapViewRect, panBy,
    resolveViewport, rubberBandCenter, viewTransform, zoomAt
} from './panZoomLogic';
import { PanZoomGestureController } from './panZoomGestureController';
import { PanZoomProps, mapPanZoomProps } from './panZoomProps';

// Must match PanZoomView.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.display.panzoomview';

interface PanZoomState {
    viewportW: number;
    viewportH: number;
    // Local echo of the viewport while navigating: gestures write here for
    // instant feedback; the two-way state.zoom/center write is debounced and
    // the draft clears once the props echo it back (house draft pattern).
    draft: PzViewport | null;
    viewState: string;
    // the embedded view's reported size, used when config.contentWidth/Height is 0 (auto)
    measuredW: number;
    measuredH: number;
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
    // fly-to animation (visual only — the target is already in props)
    private flyRaf = 0;
    private flyTimeout = 0;
    // inertia glide after a flick
    private glideRaf = 0;
    private miniRef = React.createRef<HTMLDivElement>();
    private pendingTarget = '';   // state.target pre-set before the first measure

    // Pan/pinch/wheel/double-click live in the controller; it reads the live
    // viewport and hands releases back to the animation machinery here.
    private gestures = new PanZoomGestureController({
        env: () => {
            const p = this.props.props;
            const c = this.cs();
            return {
                minZoom: p.minZoom, maxZoom: p.maxZoom, zoomStep: p.zoomStep,
                wheelZoom: p.wheelZoom, doubleClickZoom: p.doubleClickZoom,
                contentW: c.w, contentH: c.h,
                viewportW: this.state.viewportW, viewportH: this.state.viewportH
            };
        },
        vp: () => this.vp(),
        motionActive: () => !!(this.flyRaf || this.glideRaf),
        apply: (next, immediate, soft) => this.applyViewport(next, immediate, soft),
        springBack: (from, to) => this.animateTo(from, to, 220),
        glide: (vx, vy) => this.startGlide(vx, vy)
    });

    constructor(props: ComponentProps<PanZoomProps>) {
        super(props);
        this.state = { viewportW: 0, viewportH: 0, draft: null, viewState: '', measuredW: 0, measuredH: 0 };
    }

    componentDidMount(): void {
        this.measure();
        const el = this.viewportRef.current;
        if (typeof ResizeObserver !== 'undefined' && el) {
            this.resizeObs = new ResizeObserver(() => this.measure());
            this.resizeObs.observe(el);
        }
        if (el) {
            this.gestures.attach(el);   // wheel/move/up/cancel — native, see the controller
        }
        // a target pre-set before we can measure flies once the size is known
        if (this.props.props.target) {
            this.pendingTarget = this.props.props.target;
        }
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
        // A name written to state.target flies to that POI (and clears the target
        // so the same name can be written again).
        if (p.target && p.target !== q.target && !this.pendingTarget) {
            const poi = p.pois.find((x) => x.name === p.target);
            if (poi) {
                this.flyToPoi(poi);
            } else {
                this.props.store.props.write('state.target', '');
            }
        }
    }

    componentWillUnmount(): void {
        this.gestures.dispose();
        this.cancelMotion();
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
            this.setState({ viewportW: el.clientWidth, viewportH: el.clientHeight }, () => {
                if (this.pendingTarget && this.state.viewportW > 0) {
                    const poi = this.props.props.pois.find((x) => x.name === this.pendingTarget);
                    this.pendingTarget = '';
                    if (poi) {
                        this.flyToPoi(poi);
                    } else {
                        this.props.store.props.write('state.target', '');
                    }
                }
            });
        }
    }

    /** The effective content size: the configured one, or — when configured 0
     *  (auto) — the size the embedded view reported (fallback until it does). */
    private cs(): { w: number; h: number } {
        const p = this.props.props;
        return {
            w: p.contentWidth > 0 ? p.contentWidth : (this.state.measuredW || 1600),
            h: p.contentHeight > 0 ? p.contentHeight : (this.state.measuredH || 1200)
        };
    }

    /** The viewport being displayed: the in-flight draft, else the two-way state. */
    private vp(): PzViewport {
        if (this.state.draft) {
            return this.state.draft;
        }
        const p = this.props.props;
        return this.resolveFor(p.zoom, p.center);
    }

    private resolveFor(zoom: number, center: PzPoint): PzViewport {
        const p = this.props.props;
        const c = this.cs();
        return resolveViewport(zoom, center, p.home, c.w, c.h,
            this.state.viewportW, this.state.viewportH, p.minZoom, p.maxZoom);
    }

    private reducedMotion(): boolean {
        return typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

    private cancelGlide(): void {
        if (this.glideRaf) {
            window.cancelAnimationFrame(this.glideRaf);
            this.glideRaf = 0;
        }
    }

    /** Stop every viewport animation (fly + glide). */
    private cancelMotion(): void {
        this.cancelFly();
        this.cancelGlide();
    }

    /** Animate from what's on screen to the (already-in-props) target. Visual only:
     *  the draft interpolates and then clears so props lead again — no state writes. */
    private startFly(prev: PanZoomProps): void {
        const from = this.state.draft || this.resolveFor(prev.zoom, prev.center);
        const p = this.props.props;
        this.animateTo(from, this.resolveFor(p.zoom, p.center));
    }

    private animateTo(from: PzViewport, target: PzViewport, ms: number = this.props.props.flyToMs): void {
        this.cancelMotion();
        // rAF doesn't fire in background/hidden tabs — snap there instead of animating
        if (ms <= 0 || this.state.viewportW <= 0 || document.hidden || this.reducedMotion()) {
            this.setState({ draft: null });
            return;
        }
        if (Math.abs(from.zoom - target.zoom) < 1e-6
            && Math.abs(from.center.x - target.center.x) < 0.5
            && Math.abs(from.center.y - target.center.y) < 0.5) {
            this.setState({ draft: null });
            return;
        }
        // hold the starting position until the first frame — without this, the
        // render carrying the already-written target props would FLASH the
        // destination before the flight begins
        this.setState({ draft: from });
        const t0 = performance.now();
        const step = (now: number): void => {
            const k = (now - t0) / ms;
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
        }, ms + 250);
    }

    /** Glide out a flick with exponential decay; a wall zeroes that axis. The final
     *  position is written when the glide comes to rest. */
    private startGlide(vx: number, vy: number): void {
        if (document.hidden || this.reducedMotion()) {
            return;
        }
        let last = performance.now();
        const step = (now: number): void => {
            const dt = Math.min(64, now - last);
            last = now;
            const fx = glideFrame(vx, dt);
            const fy = glideFrame(vy, dt);
            vx = fx.v;
            vy = fy.v;
            const c = this.cs();
            const cur = this.vp();
            const un = panBy(cur, fx.dist, fy.dist);
            const next: PzViewport = {
                zoom: un.zoom,
                center: clampCenter(un.center, un.zoom, c.w, c.h, this.state.viewportW, this.state.viewportH)
            };
            if (Math.abs(next.center.x - un.center.x) > 0.01) {
                vx = 0;
            }
            if (Math.abs(next.center.y - un.center.y) > 0.01) {
                vy = 0;
            }
            this.setState({ draft: next });
            if (Math.hypot(vx, vy) < 0.02) {
                this.glideRaf = 0;
                this.writeState(next);
                return;
            }
            this.glideRaf = window.requestAnimationFrame(step);
        };
        this.glideRaf = window.requestAnimationFrame(step);
    }

    /** Show `next` immediately and write it (debounced) to the two-way state.
     *  `soft` (live drags) rubber-bands the DRAFT past the pan bounds for feel;
     *  the write is always the hard-clamped position. */
    private applyViewport(next: PzViewport, immediate: boolean = false, soft: boolean = false): void {
        this.cancelMotion();   // a gesture always takes over from an in-flight animation
        const p = this.props.props;
        const c = this.cs();
        const zoom = clampZoom(next.zoom, p.minZoom, p.maxZoom);
        const clamped: PzViewport = {
            zoom,
            center: clampCenter(next.center, zoom, c.w, c.h, this.state.viewportW, this.state.viewportH)
        };
        this.setState({
            draft: soft
                ? { zoom, center: rubberBandCenter(next.center, zoom, c.w, c.h, this.state.viewportW, this.state.viewportH) }
                : clamped
        });
        if (this.writeTimer) {
            window.clearTimeout(this.writeTimer);
        }
        const write = (): void => this.writeState(clamped);
        if (immediate) {
            write();
        } else {
            this.writeTimer = window.setTimeout(write, 200);
        }
    }

    /** Write a viewport to the two-way state (sig-guarded so its echo never
     *  re-animates). Always writes the WHOLE state object — including a cleared
     *  target — because an object write replaces the subtree. */
    private writeState(vpt: PzViewport): void {
        const sig = `${vpt.zoom.toFixed(4)}|${Math.round(vpt.center.x)}|${Math.round(vpt.center.y)}`;
        if (sig !== this.lastWritten) {
            this.lastWritten = sig;
            this.props.store.props.write('state', {
                zoom: vpt.zoom,
                center: { x: Math.round(vpt.center.x), y: Math.round(vpt.center.y) },
                target: ''
            });
        }
    }

    /** Fly to a POI: write the destination (own write — no echo re-fly), clear the
     *  target in the same write, and play the flight locally. */
    private flyToPoi(poi: PzPoi): void {
        const p = this.props.props;
        const c = this.cs();
        const cur = this.vp();
        const zoom = poi.zoom > 0 ? clampZoom(poi.zoom, p.minZoom, p.maxZoom) : cur.zoom;
        const target: PzViewport = {
            zoom,
            center: clampCenter({ x: poi.x, y: poi.y }, zoom, c.w, c.h,
                this.state.viewportW, this.state.viewportH)
        };
        // pin the draft to the current position BEFORE the write: the props go to
        // the target synchronously, and without a draft that render would paint
        // the destination for a frame (flash) before the animation starts
        this.setState({ draft: cur });
        this.lastWritten = '';   // force the write even if we're already there
        this.writeState(target);
        this.animateTo(cur, target);
    }

    // --- controls -----------------------------------------------------------------
    private zoomStepBy(dir: 1 | -1): void {
        const p = this.props.props;
        const cur = this.vp();
        const nextZoom = clampZoom(dir > 0 ? cur.zoom * p.zoomStep : cur.zoom / p.zoomStep, p.minZoom, p.maxZoom);
        const centerPt = { x: this.state.viewportW / 2, y: this.state.viewportH / 2 };
        this.applyViewport(zoomAt(cur, centerPt, nextZoom, this.state.viewportW, this.state.viewportH), true);
    }

    private goHome = (): void => {
        const p = this.props.props;
        const c = this.cs();
        this.applyViewport(homeViewport(p.home, c.w, c.h,
            this.state.viewportW, this.state.viewportH, p.minZoom, p.maxZoom), true);
    };

    private fit = (): void => {
        const p = this.props.props;
        const c = this.cs();
        const zoom = clampZoom(fitZoom(c.w, c.h, this.state.viewportW, this.state.viewportH),
            p.minZoom, p.maxZoom);
        this.applyViewport({ zoom, center: { x: c.w / 2, y: c.h / 2 } }, true);
    };

    // --- minimap --------------------------------------------------------------------
    private onMiniPointerDown = (e: React.PointerEvent, scale: number): void => {
        e.stopPropagation();   // never starts a viewport pan
        const el = this.miniRef.current;
        if (!el || (e.pointerType === 'mouse' && e.button !== 0)) {
            return;
        }
        const toCenter = (clientX: number, clientY: number): PzPoint => {
            const rect = el.getBoundingClientRect();
            return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
        };
        this.applyViewport({ zoom: this.vp().zoom, center: toCenter(e.clientX, e.clientY) });   // jump
        try {
            el.setPointerCapture(e.pointerId);
        } catch (ignored) { /* ignore */ }
        const move = (ev: PointerEvent): void => {
            this.applyViewport({ zoom: this.vp().zoom, center: toCenter(ev.clientX, ev.clientY) });
        };
        const up = (ev: PointerEvent): void => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            this.applyViewport({ zoom: this.vp().zoom, center: toCenter(ev.clientX, ev.clientY) }, true);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    };

    private renderMinimap(vp: PzViewport): React.ReactNode {
        const p = this.props.props;
        const c = this.cs();
        if (!p.showMinimap || this.state.viewportW <= 0
            || contentFullyVisible(vp, c.w, c.h, this.state.viewportW, this.state.viewportH)) {
            return null;
        }
        const layout = minimapLayout(c.w, c.h, 160, 110);
        const r = minimapViewRect(vp, this.state.viewportW, this.state.viewportH, layout.scale);
        return (
            <div
                className="mustry-pz-minimap"
                ref={this.miniRef}
                aria-label={this.labels().overview}
                style={{ width: layout.w, height: layout.h }}
                onPointerDown={(e) => this.onMiniPointerDown(e, layout.scale)}
            >
                {p.pois.map((poi, i) => (
                    <div
                        key={`${poi.name}-${i}`}
                        className={`mustry-pz-mini-poi${poi.flagged ? ' mustry-pz-mini-poi--flagged' : ''}`}
                        style={{ left: poi.x * layout.scale, top: poi.y * layout.scale }}
                    />
                ))}
                <div className="mustry-pz-mini-view" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
            </div>
        );
    }

    // --- POIs -----------------------------------------------------------------------
    /** Flagged POIs: a pulse ring where visible, a clickable edge indicator where not. */
    private renderPoiOverlays(vp: PzViewport): React.ReactNode {
        const p = this.props.props;
        if (this.state.viewportW <= 0) {
            return null;
        }
        return p.pois.filter((poi) => poi.flagged).map((poi, i) => {
            const pt = contentToViewportPt({ x: poi.x, y: poi.y }, vp, this.state.viewportW, this.state.viewportH);
            // insets keep the whole chip (max-width 120, translate-centered) inside
            const ind = edgeIndicator(pt, this.state.viewportW, this.state.viewportH, 64, 18);
            if (ind.onScreen) {
                return <div key={`mustry-pz-pulse-${i}`} className="mustry-pz-pulse" style={{ left: pt.x, top: pt.y }} />;
            }
            return (
                <button
                    key={`mustry-pz-ind-${i}`}
                    type="button"
                    className="mustry-pz-indicator"
                    style={{ left: ind.x, top: ind.y }}
                    title={poi.name}
                    onClick={() => this.flyToPoi(poi)}
                >
                    <svg viewBox="0 0 24 24" style={{ transform: `rotate(${ind.angle}deg)` }} aria-hidden="true">
                        <path d="M8 5l8 7-8 7z" />
                    </svg>
                    <span>{poi.name}</span>
                </button>
            );
        });
    }

    private renderPoiList(): React.ReactNode {
        const p = this.props.props;
        if (!p.showPoiList || p.pois.length === 0) {
            return null;
        }
        const L = this.labels();
        return (
            <select
                className="mustry-pz-poi-select"
                value=""
                aria-label={L.goTo}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                    const poi = p.pois.find((x) => x.name === e.target.value);
                    if (poi) {
                        this.flyToPoi(poi);
                    }
                }}
            >
                <option value="" disabled hidden>{L.goTo}</option>
                {p.pois.map((poi, i) => <option key={i} value={poi.name}>{poi.name}</option>)}
            </select>
        );
    }

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
            <div className="mustry-pz-controls">
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
        const c = this.cs();
        const auto = p.contentWidth <= 0 || p.contentHeight <= 0;
        const vp = this.vp();
        const t = viewTransform(vp, this.state.viewportW, this.state.viewportH);
        const mountPath = `${store.view.mountPath}.pz${store.addressPath.join('_')}`;
        return (
            <div {...this.props.emit({ classes: ['mustry-panzoom'] })}>
                <div
                    className="mustry-pz-viewport"
                    ref={this.viewportRef}
                    onPointerDown={this.gestures.pointerDown}
                    onDoubleClick={this.gestures.doubleClick}
                >
                    <div
                        className="mustry-pz-content"
                        style={{
                            width: c.w,
                            height: c.h,
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
                                useDefaultWidth={auto}
                                useDefaultHeight={auto}
                                onViewSizeChange={(size: Size2d) => {
                                    // config 0 = auto: adopt the embedded view's own size
                                    if (auto && size && size.width > 0 && size.height > 0
                                        && (size.width !== this.state.measuredW || size.height !== this.state.measuredH)) {
                                        this.setState({ measuredW: size.width, measuredH: size.height });
                                    }
                                }}
                                onViewStateChange={(vs: ViewStateType) => {
                                    if (vs !== this.state.viewState) {
                                        this.setState({ viewState: vs });
                                        this.props.store.props.write('output.viewState', vs);
                                    }
                                }}
                            />
                        ) : (
                            <div className="mustry-pz-placeholder">{p.viewPath ? '' : 'config.viewPath'}</div>
                        )}
                    </div>
                    {this.renderPoiOverlays(vp)}
                    {this.renderControls()}
                    {this.renderPoiList()}
                    {this.renderMinimap(vp)}
                    <div className="mustry-pz-zoom-badge">{Math.round(vp.zoom * 100)}%</div>
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
        // PComponent is typed over PlainObject props; getPropsReducer below is
        // what actually guarantees the shape this class receives.
        return PanZoomView as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 640, height: 420 };
    }

    getPropsReducer(tree: PropertyTree): PanZoomProps {
        return mapPanZoomProps(tree);
    }
}
