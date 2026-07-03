import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { resolveZoned, todayInZone, toEpochMs, zoneWallClock } from '../../shared/dateUtils';
import { expandEvents } from '../../shared/recurrence';
import { EventIcon, categoryColor, resolveColor, statusClass } from '../../shared/eventStyle';
import {
    BarLayout, RowItem, TimeScale, TimelineEvent, TimelineZoom, ZOOM_PRESETS, MS_PER_HOUR,
    buildRows, buildTicks, layoutRowBands, layoutRowBars, msToPx, scaleWidth
} from './timelineLogic';
import { TimelineProps, mapTimelineProps } from './timelineProps';
import { TimelineHover, TimelineHoverInfo } from './TimelineHover';

// Must match ResourceTimeline.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.resourcetimeline';

const LABEL_COL_PX = 160;
const AXIS_PX = 42;        // two 21px tick rows (matches .tml-axis-row)
const GROUP_ROW_PX = 22;

interface ResourceTimelineState {
    anchorMs: number;                    // epoch ms of the window start
    hover: TimelineHoverInfo | null;     // bar under the cursor -> detail popover
    hiddenCats: Set<string>;             // category ids hidden via the legend
}

/** Epoch ms of today's zone-local midnight. */
function todayAnchorMs(timezone: string): number {
    return resolveZoned(todayInZone(timezone), timezone).epochMs;
}

export class ResourceTimeline extends Component<ComponentProps<TimelineProps>, ResourceTimelineState> {

    private lastOutputSig = '';
    private outputTimer = 0;    // debounces visibleStart/End writes so rapid nav = one query
    private refreshTimer = 0;   // periodic re-render so the now-line ticks
    private hoverTimer = 0;

    constructor(props: ComponentProps<TimelineProps>) {
        super(props);
        this.state = { anchorMs: todayAnchorMs(props.props.timezone), hover: null, hiddenCats: new Set() };
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
        this.clearHoverTimer();
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

    /** Windowed events with recurring series expanded and legend-hidden categories dropped. */
    private visibleEvents(): TimelineEvent[] {
        const p = this.props.props;
        const s = this.scale();
        // Recurrence expands on zone-local DATES; cover the window generously.
        const ws = zoneWallClock(new Date(s.startMs), p.timezone);
        const we = zoneWallClock(new Date(s.endMs), p.timezone);
        const winStart = new Date(ws.y, ws.mo - 1, ws.d - 1);
        const winEnd = new Date(we.y, we.mo - 1, we.d + 2);
        const merged = [...(p.events || []), ...(p.recurringEvents || [])];
        const hidden = this.state.hiddenCats;
        return expandEvents(merged, winStart, winEnd)
            .filter((ev) => !(ev.category && hidden.has(ev.category)));
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

    // --- hover detail popover ----------------------------------------------
    private clearHoverTimer(): void {
        if (this.hoverTimer) {
            window.clearTimeout(this.hoverTimer);
            this.hoverTimer = 0;
        }
    }

    private hideHover = (): void => {
        this.clearHoverTimer();
        if (this.state.hover) {
            this.setState({ hover: null });
        }
    };

    private onBarHover(it: BarLayout, resourceLabel: string, e: React.MouseEvent): void {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const rect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        const tz = this.props.props.timezone;
        // Prefer the event's real (unclamped) extent for the popover text.
        const startMs = toEpochMs(it.event.start, tz) ?? it.startMs;
        const endMs = (it.event.end ? toEpochMs(it.event.end, tz) : null) ?? it.endMs;
        this.clearHoverTimer();
        this.hoverTimer = window.setTimeout(
            () => this.setState({ hover: { event: it.event, resourceLabel, startMs, endMs, rect } }), 350);
    }

    // --- category legend ----------------------------------------------------
    private toggleCategory(id: string): void {
        const hiddenCats = new Set(this.state.hiddenCats);
        if (hiddenCats.has(id)) {
            hiddenCats.delete(id);
        } else {
            hiddenCats.add(id);
        }
        this.setState({ hiddenCats }, () => {
            this.props.store.props.write('output.hiddenCategories', Array.from(this.state.hiddenCats));
        });
    }

    private renderLegend(): React.ReactNode {
        const p = this.props.props;
        if (!p.showLegend || !(p.categories || []).length) {
            return null;
        }
        return (
            <div className="tml-legend">
                {p.categories.map((c) => (
                    <button
                        type="button" key={c.id}
                        className={`tml-legend-item${this.state.hiddenCats.has(c.id) ? ' tml-legend-item--off' : ''}`}
                        onClick={() => this.toggleCategory(c.id)}
                    >
                        <span className="tml-legend-dot" style={{ background: categoryColor(p.categories, c.id) }} />
                        {c.label}
                    </button>
                ))}
            </div>
        );
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

    /** One resource row's track: background bands, state bands, then lane-packed bars. */
    private renderTrack(row: RowItem, events: TimelineEvent[], scale: TimeScale): React.ReactNode {
        const p = this.props.props;
        const r = row.resource!;
        const rowH = p.rowHeight;
        const px = (ms: number) => msToPx(scale, ms);
        const geom = (it: BarLayout) => ({ left: px(it.startMs), width: Math.max(2, px(it.endMs) - px(it.startMs)) });
        const bands = layoutRowBands(events, r.id, 'background', scale, p.timezone);
        const states = layoutRowBands(events, r.id, 'state', scale, p.timezone);
        const bars = layoutRowBars(events, r.id, scale, p.timezone);
        const barArea = rowH - 6;   // 3px vertical inset
        return (
            <>
                {bands.map((it, i) => (
                    <div
                        key={`bg-${it.event.id || i}`} className="tml-band tml-band--bg"
                        style={{ ...geom(it), background: resolveColor(p.categories, it.event) || undefined }}
                    />
                ))}
                {states.map((it, i) => {
                    const g = geom(it);
                    return (
                        <div
                            key={`st-${it.event.id || i}`}
                            className={`tml-band tml-band--state${statusClass(it.event)}`}
                            style={{ ...g, ['--ev' as string]: resolveColor(p.categories, it.event) } as React.CSSProperties}
                            onMouseEnter={(e) => this.onBarHover(it, row.label, e)}
                            onMouseLeave={this.hideHover}
                        >
                            {g.width > 48 && <span className="tml-band-label">{it.event.title}</span>}
                        </div>
                    );
                })}
                {bars.map((it, i) => {
                    const g = geom(it);
                    const laneH = barArea / it.lanes;
                    const cls = ['tml-bar'];
                    if (it.continuesLeft) { cls.push('tml-bar--cont-left'); }
                    if (it.continuesRight) { cls.push('tml-bar--cont-right'); }
                    const color = resolveColor(p.categories, it.event);
                    return (
                        <div
                            key={`b-${it.event.id || i}`}
                            className={cls.join(' ') + statusClass(it.event)}
                            style={{
                                ...g,
                                top: 3 + it.lane * laneH,
                                height: Math.max(10, laneH - 2),
                                ...(color ? { ['--ev' as string]: color } : {})
                            } as React.CSSProperties}
                            title={it.event.title}
                            onMouseEnter={(e) => this.onBarHover(it, row.label, e)}
                            onMouseLeave={this.hideHover}
                        >
                            <EventIcon ev={it.event} categories={p.categories} />
                            <span className="tml-bar-title">{it.event.title}</span>
                        </div>
                    );
                })}
            </>
        );
    }

    render(): React.ReactNode {
        const p = this.props.props;
        const scale = this.scale();
        const width = scaleWidth(scale);
        const ticks = buildTicks(scale, p.zoom, p.timezone, p.locale);
        const rows: RowItem[] = buildRows(p.resources);
        const events = this.visibleEvents();
        const nowMs = Date.now();
        const nowVisible = nowMs >= scale.startMs && nowMs < scale.endMs;
        const stepPx = (ZOOM_PRESETS[p.zoom].lowerStepMin / 60) * scale.pxPerHour;
        const rowH = p.rowHeight;
        return (
            <div {...this.props.emit({ classes: p.loading ? ['mustry-timeline', 'tml-loading'] : ['mustry-timeline'] })}>
                {p.showToolbar && this.renderToolbar()}
                {p.loading && <div className="tml-loading-bar" aria-hidden="true" />}
                <div className="tml-scroll" onScroll={this.hideHover}>
                    <div className="tml-grid" style={{ width: LABEL_COL_PX + width }}>
                        <div className="tml-corner" style={{ width: LABEL_COL_PX, height: AXIS_PX }} />
                        <div className="tml-axis" style={{ width, height: AXIS_PX }}>
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
                        {rows.map((row) => (
                            <React.Fragment key={row.key}>
                                <div
                                    className={row.type === 'group' ? 'tml-label tml-label--group' : 'tml-label'}
                                    style={{ width: LABEL_COL_PX, height: row.type === 'group' ? GROUP_ROW_PX : rowH }}
                                >
                                    {row.label}
                                </div>
                                <div
                                    className={row.type === 'group' ? 'tml-track tml-track--group' : 'tml-track'}
                                    style={{
                                        width,
                                        height: row.type === 'group' ? GROUP_ROW_PX : rowH,
                                        backgroundSize: `${stepPx}px 100%`
                                    }}
                                >
                                    {row.type === 'resource' && this.renderTrack(row, events, scale)}
                                </div>
                            </React.Fragment>
                        ))}
                        {rows.length === 0 && (
                            <div className="tml-empty" style={{ width: LABEL_COL_PX }}>{p.labels.noResources}</div>
                        )}
                        {nowVisible && (
                            <div
                                className="tml-now"
                                style={{ left: LABEL_COL_PX + msToPx(scale, nowMs), top: AXIS_PX }}
                            />
                        )}
                    </div>
                </div>
                {this.renderLegend()}
                {this.state.hover && (
                    <TimelineHover
                        hover={this.state.hover}
                        locale={p.locale}
                        timezone={p.timezone}
                        categories={p.categories}
                    />
                )}
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
