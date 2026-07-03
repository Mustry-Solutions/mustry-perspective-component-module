import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { resolveZoned, todayInZone } from '../../shared/dateUtils';
import {
    RowItem, TimeScale, TimelineZoom, ZOOM_PRESETS, MS_PER_HOUR,
    buildRows, buildTicks, msToPx, scaleWidth
} from './timelineLogic';
import { TimelineProps, mapTimelineProps } from './timelineProps';

// Must match ResourceTimeline.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.resourcetimeline';

interface ResourceTimelineState {
    anchorMs: number;   // epoch ms of the window start (zone-local midnight anchored)
}

/** Epoch ms of today's zone-local midnight. */
function todayAnchorMs(timezone: string): number {
    return resolveZoned(todayInZone(timezone), timezone).epochMs;
}

export class ResourceTimeline extends Component<ComponentProps<TimelineProps>, ResourceTimelineState> {

    private lastOutputSig = '';
    private outputTimer = 0;    // debounces visibleStart/End writes so rapid nav = one query
    private refreshTimer = 0;   // periodic re-render so the now-line ticks

    constructor(props: ComponentProps<TimelineProps>) {
        super(props);
        this.state = { anchorMs: todayAnchorMs(props.props.timezone) };
    }

    componentDidMount(): void {
        this.syncOutput();
        this.setupRefreshTimer();
    }

    componentDidUpdate(prevProps: ComponentProps<TimelineProps>): void {
        this.syncOutput();
        if (prevProps.props.refreshSeconds !== this.props.props.refreshSeconds) {
            this.setupRefreshTimer();
        }
    }

    componentWillUnmount(): void {
        if (this.outputTimer) {
            window.clearTimeout(this.outputTimer);
        }
        if (this.refreshTimer) {
            window.clearInterval(this.refreshTimer);
        }
    }

    /** The visible window: [anchor, anchor + zoom span), epoch-linear. */
    private scale(): TimeScale {
        const preset = ZOOM_PRESETS[this.props.props.zoom];
        return {
            startMs: this.state.anchorMs,
            endMs: this.state.anchorMs + preset.spanHours * MS_PER_HOUR,
            pxPerHour: preset.pxPerHour
        };
    }

    private setupRefreshTimer(): void {
        if (this.refreshTimer) {
            window.clearInterval(this.refreshTimer);
            this.refreshTimer = 0;
        }
        const sec = this.props.props.refreshSeconds;
        if (sec && sec > 0) {
            this.refreshTimer = window.setInterval(() => this.forceUpdate(), Math.max(1, sec) * 1000);
        }
    }

    /** Publish the visible window (ISO-8601 UTC instants) for windowed query bindings. */
    private syncOutput(): void {
        const s = this.scale();
        const sig = `${s.startMs}|${s.endMs}`;
        if (sig === this.lastOutputSig) {
            return;
        }
        this.lastOutputSig = sig;
        const write = (): void => {
            this.outputTimer = 0;
            const w = this.props.store.props;
            w.write('output.visibleStart', new Date(s.startMs).toISOString());
            w.write('output.visibleEnd', new Date(s.endMs).toISOString());
        };
        if (this.outputTimer) {
            window.clearTimeout(this.outputTimer);
        }
        const ms = this.props.props.refetchDebounceMs;
        if (ms > 0) {
            this.outputTimer = window.setTimeout(write, ms);
        } else {
            write();
        }
    }

    // --- navigation ---------------------------------------------------------
    private step(dir: number): void {
        const preset = ZOOM_PRESETS[this.props.props.zoom];
        this.setState({ anchorMs: this.state.anchorMs + dir * preset.spanHours * MS_PER_HOUR });
    }

    private prev = (): void => this.step(-1);
    private next = (): void => this.step(1);
    private goToday = (): void => this.setState({ anchorMs: todayAnchorMs(this.props.props.timezone) });

    // `config.zoom` is two-way: the toolbar writes the user's choice back.
    private setZoom(zoom: TimelineZoom): void {
        this.props.store.props.write('config.zoom', zoom);
    }

    // --- rendering ----------------------------------------------------------
    private renderToolbar(): React.ReactNode {
        const { labels, zoom } = this.props.props;
        const zooms: Array<{ id: TimelineZoom; label: string }> = [
            { id: 'hour', label: labels.zoomHour },
            { id: 'day', label: labels.zoomDay },
            { id: 'week', label: labels.zoomWeek }
        ];
        return (
            <div className="tml-toolbar">
                <div className="tml-title">
                    {buildTicks(this.scale(), 'week', this.props.props.timezone, this.props.props.locale).upper[0]?.label || ''}
                </div>
                <div className="tml-zooms">
                    {zooms.map((z) => (
                        <button
                            type="button" key={z.id}
                            className={`tml-zoom-btn${zoom === z.id ? ' tml-zoom-btn--active' : ''}`}
                            onClick={() => this.setZoom(z.id)}
                        >
                            {z.label}
                        </button>
                    ))}
                </div>
                <div className="tml-nav">
                    <button type="button" className="tml-nav-btn" onClick={this.prev} aria-label={labels.previous}>‹</button>
                    <button type="button" className="tml-today" onClick={this.goToday}>{labels.today}</button>
                    <button type="button" className="tml-nav-btn" onClick={this.next} aria-label={labels.next}>›</button>
                </div>
            </div>
        );
    }

    render(): React.ReactNode {
        const p = this.props.props;
        const scale = this.scale();
        const width = scaleWidth(scale);
        const ticks = buildTicks(scale, p.zoom, p.timezone, p.locale);
        const rows: RowItem[] = buildRows(p.resources);
        const nowMs = Date.now();
        const nowVisible = nowMs >= scale.startMs && nowMs < scale.endMs;
        const rowH = p.rowHeight;
        return (
            <div {...this.props.emit({ classes: p.loading ? ['mustry-timeline', 'tml-loading'] : ['mustry-timeline'] })}>
                {p.showToolbar && this.renderToolbar()}
                {p.loading && <div className="tml-loading-bar" aria-hidden="true" />}
                <div className="tml-body">
                    <div className="tml-resources">
                        <div className="tml-corner" />
                        {rows.map((r) => (
                            <div
                                key={r.key}
                                className={r.type === 'group' ? 'tml-group-label' : 'tml-resource-label'}
                                style={{ height: r.type === 'group' ? undefined : rowH }}
                            >
                                {r.label}
                            </div>
                        ))}
                        {rows.length === 0 && <div className="tml-empty">{p.labels.noResources}</div>}
                    </div>
                    <div className="tml-scroll">
                        <div className="tml-canvas" style={{ width }}>
                            <div className="tml-axis">
                                <div className="tml-axis-row tml-axis-upper">
                                    {ticks.upper.map((t) => (
                                        <span key={t.ms} className="tml-tick" style={{ left: t.px }}>{t.label}</span>
                                    ))}
                                </div>
                                <div className="tml-axis-row tml-axis-lower">
                                    {ticks.lower.map((t) => (
                                        <span key={t.ms} className="tml-tick" style={{ left: t.px }}>{t.label}</span>
                                    ))}
                                </div>
                            </div>
                            {rows.map((r) => (
                                <div
                                    key={r.key}
                                    className={r.type === 'group' ? 'tml-group-row' : 'tml-row'}
                                    style={{ height: r.type === 'group' ? undefined : rowH }}
                                >
                                    {r.type === 'resource' && ticks.lower.map((t) => (
                                        <span key={t.ms} className="tml-gridline" style={{ left: t.px }} />
                                    ))}
                                </div>
                            ))}
                            {nowVisible && <div className="tml-now" style={{ left: msToPx(scale, nowMs) }} />}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export class ResourceTimelineMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return ResourceTimeline;
    }

    getDefaultSize(): Size2d {
        return { width: 860, height: 420 };
    }

    getPropsReducer(tree: PropertyTree): TimelineProps {
        return mapTimelineProps(tree);
    }
}
