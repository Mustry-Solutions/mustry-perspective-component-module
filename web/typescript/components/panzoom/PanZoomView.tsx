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
    PzViewport, clampCenter, clampZoom, fitZoom, homeViewport, panBy,
    resolveViewport, viewTransform, zoomAt
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
    }

    componentDidUpdate(): void {
        const d = this.state.draft;
        if (d && Math.abs(this.props.props.zoom - d.zoom) < 1e-6
            && Math.abs(this.props.props.center.x - d.center.x) < 0.5
            && Math.abs(this.props.props.center.y - d.center.y) < 0.5) {
            this.setState({ draft: null });   // the write echoed back; props lead again
        }
    }

    componentWillUnmount(): void {
        this.viewportRef.current?.removeEventListener('wheel', this.onWheel);
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

    /** Show `next` immediately and write it (debounced) to the two-way state. */
    private applyViewport(next: PzViewport, immediate: boolean = false): void {
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
    private onPointerDown = (e: React.PointerEvent): void => {
        if (e.button !== 0) {
            return;
        }
        const el = this.viewportRef.current;
        if (!el) {
            return;
        }
        const startX = e.clientX;
        const startY = e.clientY;
        const startVp = this.vp();
        let panning = false;
        const move = (ev: PointerEvent): void => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!panning && Math.hypot(dx, dy) > 5) {
                panning = true;
                el.setPointerCapture(ev.pointerId);   // only capture once it IS a pan
                el.classList.add('pz-panning');
            }
            if (panning) {
                this.applyViewport(panBy(startVp, dx, dy));
            }
        };
        const up = (ev: PointerEvent): void => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            el.classList.remove('pz-panning');
            if (panning) {
                // final position: flush the write and swallow the click this drag made
                this.applyViewport(panBy(startVp, ev.clientX - startX, ev.clientY - startY), true);
                el.addEventListener('click', (ce) => {
                    ce.stopPropagation();
                    ce.preventDefault();
                }, { capture: true, once: true });
            }
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
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
        return pzLabelBase('');   // M0: control tooltips localize via config.locale in M2
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
