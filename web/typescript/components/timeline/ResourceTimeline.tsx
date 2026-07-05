import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { CSV_BOM } from '../../shared/csv';
import { addDays, fmtDate, msToZonedIso, pad2, parseDate, resolveZoned, todayInZone, toEpochMs, zoneWallClock } from '../../shared/dateUtils';
import { expandEvents } from '../../shared/recurrence';
import { EventIcon, categoryColor, resolveColor, statusClass } from '../../shared/eventStyle';
import { DocDismiss } from '../../shared/dismiss';
import { MiniMonthNav, MiniNav } from '../../shared/MiniMonthNav';
import { addMonths, startOfMonth } from '../../shared/dateUtils';
import {
    BarLayout, RowItem, TickRows, TimeScale, TimelineEvent, TimelineZoom, ZOOM_PRESETS,
    barGeom, buildRows, buildTicks, layoutRowBands, layoutRowBars, msToPx, pageAnchorMs,
    scaleWidth, timelineEventsToCsv, windowFor, zonedFormat
} from './timelineLogic';
import { TimelineProps, mapTimelineProps } from './timelineProps';
import { TimelineHover, TimelineHoverInfo } from './TimelineHover';
import { TimelineGestureController, TlGesture, TlPreview } from './timelineGestureController';
import { TlCommitKind, isNoopMove } from './timelineGestureLogic';
import {
    TlChangeSpec, TlEditor, tlDeleteSpec, tlEditorForCreate, tlEditorForEvent, tlMoveResizeSpec, tlSaveSpec
} from './timelineEditorLogic';
import { TimelineEditor } from './TimelineEditor';

// Must match ResourceTimeline.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.resourcetimeline';

const LABEL_COL_PX = 160;
const AXIS_PX = 42;        // two 21px tick rows (matches .tml-axis-row)
const GROUP_ROW_PX = 22;

/** One resource row's laid-out content. */
interface RowLayouts {
    bands: BarLayout[];
    states: BarLayout[];
    bars: BarLayout[];
}

interface ResourceTimelineState {
    anchorMs: number;                    // epoch ms of the window start
    hover: TimelineHoverInfo | null;     // bar under the cursor -> detail popover
    hiddenCats: Set<string>;             // category ids hidden via the legend
    preview: TlPreview | null;           // in-flight gesture ghost / selection
    editor: TlEditor | null;             // built-in editor popover
    mini: MiniNav | null;                // mini month navigator (from the title)
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
    private gridRef = React.createRef<HTMLDivElement>();

    private gestures = new TimelineGestureController({
        env: () => ({
            editable: this.props.props.editable,
            selectable: this.props.props.selectable,
            snapMinutes: ZOOM_PRESETS[this.props.props.zoom].snapMinutes,
            scale: this.scale()
        }),
        flags: () => ({
            editable: this.props.props.editable,
            selectable: this.props.props.selectable,
            useEditor: this.useEditor(),
            useEditorForEdit: this.useEditorForEdit()
        }),
        gridEl: () => this.gridRef.current,
        resolveColor: (ev) => resolveColor(this.props.props.categories, ev),
        hideHover: () => this.hideHover(),
        setPreview: (preview) => this.setState({ preview }),
        commit: (kind, g, preview) => this.commitGesture(kind, g, preview)
    });

    private miniDismiss = new DocDismiss(
        // Clicks inside the popover, or on the title toggle (which handles itself), don't close.
        ['.cal-mini', '.tml-title--btn'], () => this.closeMini());

    constructor(props: ComponentProps<TimelineProps>) {
        super(props);
        this.state = {
            anchorMs: todayAnchorMs(props.props.timezone),
            hover: null, hiddenCats: new Set(), preview: null, editor: null, mini: null
        };
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
        this.gestures.dispose();
        this.miniDismiss.close();
    }

    /** The visible window (day/week span whole wall-calendar days — DST-safe). */
    private scale(): TimeScale {
        return windowFor(this.state.anchorMs, this.props.props.zoom, this.props.props.timezone);
    }

    private layoutMemo: { deps: unknown[]; rows: RowItem[]; ticks: TickRows; byRow: Map<string, RowLayouts> } | null = null;

    /** Rows, axis ticks and every row's bar/band layout, recomputed only when an
     *  input actually changes — NOT on each hover/ghost setState. A drag re-renders
     *  per pointer move, and relayouting every row each move is the component's
     *  dominant cost on large boards. */
    private layout(scale: TimeScale): { rows: RowItem[]; ticks: TickRows; byRow: Map<string, RowLayouts> } {
        const p = this.props.props;
        const deps: unknown[] = [
            p.events, p.recurringEvents, p.resources, p.collapsedGroups, this.state.hiddenCats,
            scale.startMs, scale.endMs, scale.pxPerHour, p.timezone, p.zoom, p.locale, p.shifts
        ];
        const m = this.layoutMemo;
        if (m && m.deps.every((d, i) => d === deps[i])) {
            return m;
        }
        const rows = buildRows(p.resources, new Set(p.collapsedGroups));
        const events = this.visibleEvents();
        const byRow = new Map<string, RowLayouts>();
        for (const row of rows) {
            if (row.type === 'resource') {
                const id = row.resource!.id;
                byRow.set(id, {
                    bands: layoutRowBands(events, id, 'background', scale, p.timezone),
                    states: layoutRowBands(events, id, 'state', scale, p.timezone),
                    bars: layoutRowBars(events, id, scale, p.timezone)
                });
            }
        }
        this.layoutMemo = { deps, rows, ticks: buildTicks(scale, p.zoom, p.timezone, p.locale, p.shifts), byRow };
        return this.layoutMemo;
    }

    private setupRefreshTimer(): void {
        if (this.refreshTimer) {
            window.clearInterval(this.refreshTimer);
            this.refreshTimer = 0;
        }
        const sec = this.props.props.refreshSeconds;
        if (sec && sec > 0) {
            this.refreshTimer = window.setInterval(() => {
                // Don't re-render mid-interaction — pointless during a drag, and it
                // could disturb an open native picker in the editor.
                if (this.state.editor || this.gestures.active) {
                    return;
                }
                this.forceUpdate();
            }, Math.max(1, sec) * 1000);
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
        return expandEvents(merged, winStart, winEnd, p.timezone)
            .filter((ev) => !(ev.category && hidden.has(ev.category)));
    }

    // --- events / editing ----------------------------------------------------
    /** Whether a create gesture should open the built-in editor (vs firing onSelect). */
    private useEditor(): boolean {
        return this.props.props.builtInEditor && this.props.props.selectable;
    }

    /** Whether clicking a bar opens the built-in editor (vs firing onEventClick). */
    private useEditorForEdit(): boolean {
        return this.props.props.builtInEditor && this.props.props.editable;
    }

    /** A recurring occurrence (id "base::date"): draggable/editable like the
     *  calendar's — touching one detaches it into an override + series EXDATE. */
    private isOccurrence(ev: TimelineEvent): boolean {
        return (ev.id || '').indexOf('::') >= 0;
    }

    private movable(ev: TimelineEvent): boolean {
        return this.props.props.editable && ev.display !== 'background';
    }

    /** The raw (unexpanded) base event of a series id, wherever it's bound. */
    private baseEventById(id: string): TimelineEvent | undefined {
        const p = this.props.props;
        return [...(p.events || []), ...(p.recurringEvents || [])].find((e) => e && e.id === id);
    }

    /** An event's real (unclamped) extent, with the same no-end rules as the layout. */
    private eventExtent(ev: TimelineEvent): { startMs: number; endMs: number } {
        const tz = this.props.props.timezone;
        const s = this.scale();
        const startMs = toEpochMs(ev.start, tz) ?? s.startMs;
        let endMs = ev.end ? toEpochMs(ev.end, tz) : null;
        if (endMs === null || endMs <= startMs) {
            endMs = ev.display === 'state' || ev.display === 'background' ? s.endMs : startMs + 3600000;
        }
        return { startMs, endMs };
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    /** Fires onChange for ANY data mutation — the single write-back hook. */
    private fireSpec(spec: TlChangeSpec): void {
        this.fireEvent('onChange', {
            action: spec.action, event: spec.event,
            ...(spec.fromResourceId ? { fromResourceId: spec.fromResourceId } : {}),
            ...(spec.extra || {})   // scope / seriesId / occurrenceDate for recurring mutations
        });
    }

    private eventPayload(ev: TimelineEvent): object {
        return {
            id: ev.id || '', resourceId: ev.resourceId || '', title: ev.title || '',
            start: ev.start || '', end: ev.end || '', category: ev.category || ''
        };
    }

    private onBarClick = (ev: TimelineEvent): void => {
        if (this.useEditorForEdit()) {
            this.openEditorForEvent(ev);
            return;
        }
        this.fireEvent('onEventClick', this.eventPayload(ev));
    };

    private onResourceClick(row: RowItem): void {
        if (row.type === 'resource') {
            this.fireEvent('onResourceClick', { resourceId: row.resource!.id });
            return;
        }
        this.toggleGroup(row.group || row.label);
    }

    /** Collapse/expand a group. `config.collapsedGroups` is two-way, so a view can
     *  also start collapsed (or be driven by a binding). */
    private toggleGroup(group: string): void {
        if (!group) {
            return;
        }
        const cur = this.props.props.collapsedGroups || [];
        const next = cur.indexOf(group) >= 0 ? cur.filter((g) => g !== group) : [...cur, group];
        this.props.store.props.write('config.collapsedGroups', next);
    }

    /** Apply a released gesture — the controller's commit decision — to the component. */
    private commitGesture(kind: TlCommitKind, g: TlGesture, preview: TlPreview | null): void {
        const tz = this.props.props.timezone;
        switch (kind) {
            case 'editEvent':
                this.openEditorForEvent(g.ev!);
                break;
            case 'eventClick':
                this.fireEvent('onEventClick', this.eventPayload(g.ev!));
                break;
            case 'move':
                // A drag that snapped back to exactly where it started is a click,
                // not a phantom onChange.
                if (isNoopMove(g.origStartMs, g.origResourceId, preview!.startMs, preview!.resourceId)) {
                    this.commitGesture(this.useEditorForEdit() ? 'editEvent' : 'eventClick', g, preview);
                    break;
                }
                this.fireSpec(tlMoveResizeSpec('move', g.ev!, {
                    startMs: preview!.startMs,
                    // An open-ended event stays open-ended when moved.
                    endMs: g.ev!.end ? preview!.endMs : undefined,
                    resourceId: preview!.resourceId
                }, tz));
                break;
            case 'resize':
                this.fireSpec(tlMoveResizeSpec('resize', g.ev!, g.mode === 'resize-start'
                    // Start-edge resize doesn't touch the end (an open-ended event stays so).
                    ? { startMs: preview!.startMs, endMs: g.ev!.end ? preview!.endMs : undefined }
                    // End-edge resize SETS the end deliberately (incl. on open-ended events).
                    : { endMs: preview!.endMs }, tz));
                break;
            case 'selectEditor':
                this.openEditor(preview!.resourceId, preview!.startMs, preview!.endMs);
                break;
            case 'select':
                this.fireEvent('onSelect', {
                    resourceId: preview!.resourceId,
                    start: msToZonedIso(preview!.startMs, tz),
                    end: msToZonedIso(preview!.endMs, tz)
                });
                break;
            case 'createEditor':
                // a plain click on empty track -> editor with a default one-hour slot
                this.openEditor(g.origResourceId, g.origStartMs, g.origStartMs + 3600000);
                break;
            default:
                break;
        }
    }

    private defaultCategory(): string {
        const cats = this.props.props.categories || [];
        return cats.length ? cats[0].id : '';
    }

    private openEditor(resourceId: string, startMs: number, endMs: number): void {
        this.hideHover();
        this.setState({ editor: tlEditorForCreate(resourceId, startMs, endMs, this.props.props.timezone, this.defaultCategory()) });
    }

    private openEditorForEvent(ev: TimelineEvent): void {
        this.hideHover();
        this.setState({ editor: tlEditorForEvent(ev, this.props.props.timezone, (id) => this.baseEventById(id)) });
    }

    private updateEditor(patch: Partial<TlEditor>): void {
        if (this.state.editor) {
            this.setState({ editor: { ...this.state.editor, ...patch } });
        }
    }

    private editorCancel = (): void => {
        this.setState({ editor: null });
    };

    private editorSave = (): void => {
        const ed = this.state.editor;
        if (!ed) {
            return;
        }
        this.fireSpec(tlSaveSpec(ed, this.props.props.timezone, (id) => this.baseEventById(id)));
        this.setState({ editor: null });
    };

    private editorDelete = (): void => {
        const ed = this.state.editor;
        const spec = ed ? tlDeleteSpec(ed) : null;
        if (!spec) {
            return;
        }
        this.fireSpec(spec);
        this.setState({ editor: null });
    };

    // --- navigation ---------------------------------------------------------
    private step(dir: number): void {
        this.setState({ anchorMs: pageAnchorMs(this.state.anchorMs, dir, this.props.props.zoom, this.props.props.timezone) });
    }

    private prev = (): void => this.step(-1);
    private next = (): void => this.step(1);
    private goToday = (): void => this.setState({ anchorMs: todayAnchorMs(this.props.props.timezone) });

    // `config.zoom` is two-way: the toolbar writes the user's choice back.
    private setZoom(zoom: TimelineZoom): void {
        this.props.store.props.write('config.zoom', zoom);
    }

    // --- mini month navigator (popover from the toolbar title) ---------------
    /** The window's zone-local date span (half-open ISO dates, for the mini grid highlight). */
    private windowDates(): { start: string; end: string; cursor: string } {
        const tz = this.props.props.timezone;
        const s = this.scale();
        const iso = (ms: number) => {
            const w = zoneWallClock(new Date(ms), tz);
            return `${w.y}-${pad2(w.mo)}-${pad2(w.d)}`;
        };
        // The last included instant's date, plus one day = the exclusive end date
        // (a window ending exactly at midnight doesn't highlight that day).
        const last = parseDate(iso(s.endMs - 1))!;
        return { start: iso(s.startMs), end: fmtDate(addDays(last, 1)), cursor: iso(s.startMs) };
    }

    private toggleMini = (e: React.MouseEvent): void => {
        if (this.state.mini) {
            this.closeMini();
            return;
        }
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const w = zoneWallClock(new Date(this.state.anchorMs), this.props.props.timezone);
        this.setState({
            mini: {
                rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
                month: startOfMonth(new Date(w.y, w.mo - 1, w.d))
            }
        });
        this.miniDismiss.open();
    };

    private miniStep(dir: number): void {
        const m = this.state.mini;
        if (m) {
            this.setState({ mini: { ...m, month: addMonths(m.month, dir) } });
        }
    }

    /** Pick a day in the mini grid: anchor the window on that day's zone-local midnight. */
    private miniPick(iso: string): void {
        const d = parseDate(iso);
        this.closeMini();
        if (d) {
            this.setState({ anchorMs: resolveZoned(d, this.props.props.timezone).epochMs });
        }
    }

    private closeMini(): void {
        this.miniDismiss.close();
        if (this.state.mini) {
            this.setState({ mini: null });
        }
    }

    /** Export the loaded events (windowed + recurring definitions) to a CSV download. */
    private exportCsv = (): void => {
        const p = this.props.props;
        const csv = timelineEventsToCsv([...(p.events || []), ...(p.recurringEvents || [])]);
        const blob = new Blob([CSV_BOM, csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timeline-events.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    };

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
        if (this.gestures.active) {
            return;   // no detail popovers while a drag is in flight
        }
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const rect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        const { startMs, endMs } = this.eventExtent(it.event);
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
                        {c.icon
                            ? <span className="tml-legend-icon"><IconRenderer path={c.icon} color={c.color} /></span>
                            : <span className="tml-legend-dot" style={{ background: categoryColor(p.categories, c.id) }} />}
                        {c.label}
                    </button>
                ))}
            </div>
        );
    }

    // --- rendering ----------------------------------------------------------
    private renderToolbar(): React.ReactNode {
        const { labels, zoom, shifts } = this.props.props;
        const zooms: Array<{ id: TimelineZoom; label: string }> = [
            { id: 'hour', label: labels.zoomHour },
            { id: 'day', label: labels.zoomDay },
            // Only offered when shifts are configured (config.shifts).
            ...(shifts.length ? [{ id: 'shift' as TimelineZoom, label: labels.zoomShift }] : []),
            { id: 'week', label: labels.zoomWeek }
        ];
        const title = zonedFormat(this.props.props.locale, this.props.props.timezone,
            { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(this.scale().startMs));
        return (
            <div className="tml-toolbar">
                <button
                    type="button"
                    className={`tml-title tml-title--btn${this.state.mini ? ' is-open' : ''}`}
                    onClick={this.toggleMini}
                    aria-haspopup="true"
                    aria-expanded={!!this.state.mini}
                >
                    {title}
                    <span className="tml-title-caret" aria-hidden="true">▾</span>
                </button>
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
                    {this.props.props.showExport && (
                        <button type="button" className="tml-nav-btn tml-export-btn" onClick={this.exportCsv} title={labels.exportCsv} aria-label={labels.exportCsv}>
                            <IconRenderer path="material/get_app" color="var(--tml-accent)" />
                        </button>
                    )}
                    <button type="button" className="tml-nav-btn" onClick={this.prev} aria-label={labels.previous}>‹</button>
                    <button type="button" className="tml-today" onClick={this.goToday}>{labels.today}</button>
                    <button type="button" className="tml-nav-btn" onClick={this.next} aria-label={labels.next}>›</button>
                </div>
            </div>
        );
    }

    /** The in-flight gesture's ghost bar / selection rectangle on one row. */
    private renderPreview(row: RowItem, scale: TimeScale): React.ReactNode {
        const preview = this.state.preview;
        if (!preview || preview.resourceId !== row.resource!.id) {
            return null;
        }
        const left = msToPx(scale, Math.max(preview.startMs, scale.startMs));
        const width = Math.max(2, msToPx(scale, Math.min(preview.endMs, scale.endMs)) - left);
        if (preview.mode === 'create') {
            return <div className="tml-select" style={{ left, width }} />;
        }
        return (
            <div
                className="tml-bar tml-bar--ghost"
                style={{
                    left, width, top: 3, height: this.props.props.rowHeight - 8,
                    ...(preview.color ? { ['--ev' as string]: preview.color } : {})
                } as React.CSSProperties}
            >
                <span className="tml-bar-title">{preview.title || ''}</span>
            </div>
        );
    }

    /** One resource row's track: background bands, state bands, then lane-packed bars. */
    private renderTrack(row: RowItem, lay: RowLayouts, scale: TimeScale): React.ReactNode {
        const p = this.props.props;
        const rowH = p.rowHeight;
        const preview = this.state.preview;
        const px = (ms: number) => msToPx(scale, ms);
        const geom = (it: BarLayout) => ({ left: px(it.startMs), width: Math.max(2, px(it.endMs) - px(it.startMs)) });
        const { bands, states, bars } = lay;
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
                            role="button"
                            tabIndex={0}
                            aria-label={`${it.event.title || ''} — ${row.label}`}
                            onMouseEnter={(e) => this.onBarHover(it, row.label, e)}
                            onMouseLeave={this.hideHover}
                            onClick={() => this.fireEvent('onEventClick', this.eventPayload(it.event))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    this.fireEvent('onEventClick', this.eventPayload(it.event));
                                }
                            }}
                        >
                            {g.width > 48 && <span className="tml-band-label">{it.event.title}</span>}
                        </div>
                    );
                })}
                {bars.map((it, i) => {
                    const ev = it.event;
                    if (preview && preview.mode !== 'create' && preview.eventId === ev.id) {
                        return null;   // hidden while dragging; the ghost is shown instead
                    }
                    // Floor the width so short jobs stay grabbable; drop the edge
                    // handles when they'd swallow the whole bar (move/click only).
                    const g = barGeom(px(it.startMs), px(it.endMs));
                    const laneH = barArea / it.lanes;
                    const movable = this.movable(ev);
                    const cls = ['tml-bar'];
                    if (movable) { cls.push('tml-bar--movable'); }
                    if (it.continuesLeft) { cls.push('tml-bar--cont-left'); }
                    if (it.continuesRight) { cls.push('tml-bar--cont-right'); }
                    const color = resolveColor(p.categories, ev);
                    const extent = this.eventExtent(ev);
                    return (
                        <div
                            key={`b-${ev.id || i}`}
                            className={cls.join(' ') + statusClass(ev)}
                            style={{
                                left: g.left,
                                width: g.width,
                                top: 3 + it.lane * laneH,
                                height: Math.max(10, laneH - 2),
                                ...(color ? { ['--ev' as string]: color } : {})
                            } as React.CSSProperties}
                            title={ev.title}
                            role="button"
                            tabIndex={0}
                            aria-label={`${ev.title || ''} — ${row.label}`}
                            onPointerDown={movable
                                ? (e) => this.gestures.startMove(ev, extent.startMs, extent.endMs, e)
                                : undefined}
                            onClick={movable ? undefined : () => this.onBarClick(ev)}
                            // Keyboard: gestures hang off pointerdown, so Enter/Space
                            // opens the bar directly (a keyboard can't drag).
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    this.onBarClick(ev);
                                }
                            }}
                            onMouseEnter={(e) => this.onBarHover(it, row.label, e)}
                            onMouseLeave={this.hideHover}
                        >
                            {movable && g.showHandles && !it.continuesLeft && (
                                <div
                                    className="tml-resize tml-resize--start"
                                    onPointerDown={(e) => this.gestures.startResize('start', ev, extent.startMs, extent.endMs, e)}
                                />
                            )}
                            {this.isOccurrence(ev) && (
                                // Part of a series: dragging/editing detaches this occurrence.
                                <span className="tml-bar-recur" aria-hidden="true">↻</span>
                            )}
                            <EventIcon ev={ev} categories={p.categories} />
                            <span className="tml-bar-title">{ev.title}</span>
                            {movable && g.showHandles && !it.continuesRight && (
                                <div
                                    className="tml-resize tml-resize--end"
                                    onPointerDown={(e) => this.gestures.startResize('end', ev, extent.startMs, extent.endMs, e)}
                                />
                            )}
                        </div>
                    );
                })}
                {this.renderPreview(row, scale)}
            </>
        );
    }

    render(): React.ReactNode {
        const p = this.props.props;
        const scale = this.scale();
        const width = scaleWidth(scale);
        const { rows, ticks, byRow } = this.layout(scale);
        const nowMs = Date.now();
        const nowVisible = nowMs >= scale.startMs && nowMs < scale.endMs;
        const rowH = p.rowHeight;
        return (
            <div {...this.props.emit({ classes: p.loading ? ['mustry-timeline', 'tml-loading'] : ['mustry-timeline'] })}>
                {p.showToolbar && this.renderToolbar()}
                {p.loading && <div className="tml-loading-bar" aria-hidden="true" />}
                <div className="tml-scroll" onScroll={this.hideHover}>
                    <div className="tml-grid" ref={this.gridRef} style={{ width: LABEL_COL_PX + width }}>
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
                                    onClick={() => this.onResourceClick(row)}
                                    role={row.type === 'group' ? 'button' : undefined}
                                    tabIndex={row.type === 'group' ? 0 : undefined}
                                    aria-expanded={row.type === 'group' ? !row.collapsed : undefined}
                                    onKeyDown={row.type === 'group' ? (e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            this.onResourceClick(row);
                                        }
                                    } : undefined}
                                >
                                    {row.type === 'group' && (
                                        <span className="tml-group-caret" aria-hidden="true">{row.collapsed ? '▸' : '▾'}</span>
                                    )}
                                    {row.label}
                                    {row.type === 'group' && row.collapsed && !!row.hiddenCount && (
                                        <span className="tml-group-count">({row.hiddenCount})</span>
                                    )}
                                </div>
                                <div
                                    className={row.type === 'group' ? 'tml-track tml-track--group' : 'tml-track'}
                                    data-resource={row.type === 'resource' ? row.resource!.id : undefined}
                                    style={{
                                        width,
                                        height: row.type === 'group' ? GROUP_ROW_PX : rowH
                                    }}
                                    onPointerDown={row.type === 'resource'
                                        ? (e) => this.gestures.startCreate(row.resource!.id, e)
                                        : undefined}
                                    onClick={row.type === 'group'
                                        ? () => this.toggleGroup(row.group || row.label)
                                        : undefined}
                                >
                                    {row.type === 'resource' && this.renderTrack(row, byRow.get(row.resource!.id)!, scale)}
                                </div>
                            </React.Fragment>
                        ))}
                        {rows.length === 0 && (
                            <div className="tml-empty" style={{ width: LABEL_COL_PX }}>{p.labels.noResources}</div>
                        )}
                        {/* One full-height gridline per lower tick — always aligned with the
                            axis, even across 23/25h DST days (unlike a fixed-step background). */}
                        {ticks.lower.map((t) => (
                            <div key={`gl-${t.ms}`} className="tml-gridcol" style={{ left: LABEL_COL_PX + t.px, top: AXIS_PX }} />
                        ))}
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
                {this.state.mini && (
                    <MiniMonthNav
                        mini={this.state.mini}
                        locale={p.locale}
                        mondayFirst={p.weekStart === 'monday'}
                        range={{ start: this.windowDates().start, end: this.windowDates().end }}
                        cursorIso={this.windowDates().cursor}
                        showRange={true}
                        labels={p.labels}
                        onStep={(dir) => this.miniStep(dir)}
                        onPick={(iso) => this.miniPick(iso)}
                    />
                )}
                {this.state.editor && (
                    <TimelineEditor
                        editor={this.state.editor}
                        resources={p.resources}
                        categories={p.categories}
                        timezone={p.timezone}
                        locale={p.locale}
                        labels={p.labels}
                        onUpdate={(patch) => this.updateEditor(patch)}
                        onCancel={this.editorCancel}
                        onSave={this.editorSave}
                        onDelete={this.editorDelete}
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
