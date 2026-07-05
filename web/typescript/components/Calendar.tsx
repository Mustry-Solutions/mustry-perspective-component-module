import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import {
    addDays,
    addMonths,
    daysBetween,
    emitWall,
    fmtDate,
    intlFormat,
    monthLabel,
    parseDate,
    shiftWallDays,
    startOfMonth,
    instantToZonedIso,
    todayInZone,
    nowMinutesInZone
} from '../shared/dateUtils';
import {
    buildMonthGrid,
    groupEventsByDay,
    eventsToCsv,
    weekDays,
    isoDateTime,
    CalEvent,
    DayCol,
    MonthGrid
} from './calendarLogic';
import {
    CalView, Gesture, Editor, Preview,
    CalendarProps, CalendarState, hourHeightPx
} from './calendar/types';
import { CSV_BOM } from '../shared/csv';
import { resolveColor as styleResolveColor } from '../shared/eventStyle';
import { expandEvents } from '../shared/recurrence';
import { mapCalendarProps } from './calendarProps';
import { CommitKind } from './calendar/gestureLogic';
import { GestureController } from './calendar/gestureController';
import { DocDismiss } from '../shared/dismiss';
import { EnterTracker } from '../shared/enterAnimation';
import {
    ChangeSpec, editorForCreate, editorForEvent, toggleAllDayPatch,
    editorSaveSpec, editorDeleteSpec, moveResizeSpec
} from './calendar/editorLogic';
import { Legend } from './calendar/Legend';
import { HoverPopover } from './calendar/HoverPopover';
import { DayPopover } from './calendar/DayPopover';
import { MiniMonthNav } from '../shared/MiniMonthNav';
import { EventEditor } from './calendar/EventEditor';
import { Toolbar } from './calendar/Toolbar';
import { MonthView } from './calendar/MonthView';
import { TimeGrid } from './calendar/TimeGrid';
import { ListView } from './calendar/ListView';

// Must match Calendar.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.calendar';


export class Calendar extends Component<ComponentProps<CalendarProps>, CalendarState> {

    private lastOutputSig = '';
    private scrollRef = React.createRef<HTMLDivElement>();
    private rootRef = React.createRef<HTMLDivElement>();
    private weeksRef = React.createRef<HTMLDivElement>();
    private resizeObs: ResizeObserver | null = null;

    private hoverTimer = 0;
    private refreshTimer = 0;   // periodic re-render so the now-indicator ticks live
    private outputTimer = 0;    // debounces visibleStart/End writes so rapid nav = one query

    private enter = new EnterTracker();

    private gestures = new GestureController({
        env: () => {
            const p = this.props.props;
            return {
                editable: p.editable, selectable: p.selectable,
                dayStartHour: p.dayStartHour, dayEndHour: p.dayEndHour, slotMinutes: p.slotMinutes
            };
        },
        flags: () => ({
            editable: this.props.props.editable,
            selectable: this.props.props.selectable,
            useEditor: this.useEditor(),
            useEditorForEdit: this.useEditorForEdit()
        }),
        scrollEl: () => this.scrollRef.current,
        monthEl: () => this.weeksRef.current,
        resolveColor: (ev) => styleResolveColor(this.props.props.categories, ev),
        hideHover: () => this.hideHover(),
        setPreview: (preview) => this.setState({ preview }),
        commit: (kind, g, preview) => this.commitGesture(kind, g, preview)
    });

    private miniDismiss = new DocDismiss(
        // Clicks inside the popover, or on the title toggle (which handles itself), don't close.
        ['.cal-mini', '.cal-title--btn'], () => this.closeMini());
    private dayPopDismiss = new DocDismiss(
        // Clicks inside the popover, or on a trigger (date number / "+N more"), manage themselves.
        ['.cal-daypop', '.cal-daynum', '.cal-more'], () => this.closeDayPop());

    constructor(props: ComponentProps<CalendarProps>) {
        super(props);
        this.state = {
            cursor: todayInZone(props.props.timezone), preview: null, hover: null, editor: null,
            mini: null, dayPop: null, hiddenCats: new Set(), monthCap: 3
        };
    }

    componentDidMount(): void {
        this.enter.seed(this.props.props.events || []);
        this.syncOutput();
        this.scrollTimeGrid();
        // Re-measure the month-cell capacity whenever the component is resized.
        if (typeof ResizeObserver !== 'undefined' && this.rootRef.current) {
            this.resizeObs = new ResizeObserver(() => this.recomputeMonthCap());
            this.resizeObs.observe(this.rootRef.current);
        }
        this.recomputeMonthCap();
        this.setupRefreshTimer();
    }

    componentDidUpdate(prevProps: ComponentProps<CalendarProps>): void {
        this.syncOutput();
        if (prevProps.props.view !== this.props.props.view) {
            this.scrollTimeGrid();   // re-scroll the time grid after switching to week/day
        }
        this.enter.detect(this.props.props.events || [], () => this.forceUpdate());
        this.recomputeMonthCap();   // week-count (5/6) or view changes can change the fit
        if (prevProps.props.refreshSeconds !== this.props.props.refreshSeconds) {
            this.setupRefreshTimer();
        }
    }

    componentWillUnmount(): void {
        this.gestures.dispose();
        this.miniDismiss.close();
        this.dayPopDismiss.close();
        this.clearHoverTimer();
        this.enter.dispose();
        if (this.refreshTimer) {
            window.clearInterval(this.refreshTimer);
        }
        if (this.outputTimer) {
            window.clearTimeout(this.outputTimer);
        }
        if (this.resizeObs) {
            this.resizeObs.disconnect();
        }
    }

    /** (Re)start the periodic re-render so time-sensitive bits (the now-indicator) stay live. */
    private setupRefreshTimer(): void {
        if (this.refreshTimer) {
            window.clearInterval(this.refreshTimer);
            this.refreshTimer = 0;
        }
        const sec = this.props.props.refreshSeconds;
        if (sec && sec > 0) {
            this.refreshTimer = window.setInterval(() => {
                // Don't re-render mid-interaction — it could dismiss an open native picker
                // in the editor, and it's pointless while a drag is in progress.
                if (this.state.editor || this.gestures.active) {
                    return;
                }
                this.forceUpdate();
            }, Math.max(1, sec) * 1000);
        }
    }

    /** Measure how many event chips fit a month cell and store it (auto-fit → "+N more"). */
    private recomputeMonthCap(): void {
        if (this.props.props.view !== 'month') {
            return;
        }
        const weeks = this.weeksRef.current;
        const dayEl = weeks ? weeks.querySelector('.cal-day') as HTMLElement | null : null;
        if (!dayEl) {
            return;
        }
        const chip = weeks!.querySelector('.cal-mbar') as HTMLElement | null;
        const chipRow = (chip ? chip.getBoundingClientRect().height : 18) + 2;   // bar + gap
        const numEl = dayEl.querySelector('.cal-daynum') as HTMLElement | null;
        const numH = numEl ? numEl.getBoundingClientRect().height : 18;
        // clientHeight = content + padding; subtract vertical padding, the date row, and the row gap.
        const avail = dayEl.clientHeight - 6 - numH - 2;
        const cap = Math.max(1, Math.floor((avail + 2) / chipRow));   // +gap: last chip has no trailing gap
        if (cap !== this.state.monthCap) {
            this.setState({ monthCap: cap });
        }
    }

    /** Enter-animation class for an event chip. */
    private enterClass(occId: string): string {
        return this.enter.enterClass(occId);
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    /**
     * Fires `onChange` for ANY data mutation (create / edit / delete / move / resize).
     * The spec's `event` is always the resulting event with its final start/end, so a
     * single handler can persist or trigger downstream logic without caring which
     * gesture produced it. This is the one "the data should change" event; onEventClick /
     * onDateClick / onSelect are the "the user did something" intent events.
     */
    private fireSpec(spec: ChangeSpec): void {
        this.fireEvent('onChange', { action: spec.action, event: spec.event, ...(spec.extra || {}) });
    }

    // --- hover detail popover ---------------------------------------------
    private clearHoverTimer(): void {
        if (this.hoverTimer) {
            window.clearTimeout(this.hoverTimer);
            this.hoverTimer = 0;
        }
    }

    private hideHover(): void {
        this.clearHoverTimer();
        if (this.state.hover) {
            this.setState({ hover: null });
        }
    }

    private onEventHover = (ev: CalEvent, e: React.MouseEvent): void => {
        if (this.gestures.active) {
            return;   // no detail popovers while a drag is in flight
        }
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const rect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        this.clearHoverTimer();
        this.hoverTimer = window.setTimeout(() => this.setState({ hover: { event: ev, rect } }), 350);
    };

    private onEventLeave = (): void => {
        this.hideHover();
    };

    /** Common hover props for any event element (chip / block / list row). */
    private hoverProps(ev: CalEvent): { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void } {
        return { onMouseEnter: (e) => this.onEventHover(ev, e), onMouseLeave: this.onEventLeave };
    }

    // --- built-in new-event editor ----------------------------------------
    /** Whether a create gesture should open the built-in editor (vs firing onSelect). */
    private useEditor(): boolean {
        return this.props.props.builtInEditor && this.props.props.selectable;
    }

    /** Default category for a new event: the first configured category, or none. */
    private defaultCategory(): string {
        const cats = this.props.props.categories || [];
        return cats.length ? cats[0].id : '';
    }

    private openEditor(startIso: string, endIso: string, allDay: boolean): void {
        this.hideHover();
        this.setState({ editor: editorForCreate(startIso, endIso, allDay, this.defaultCategory()) });
    }

    /** Whether clicking an existing event opens the built-in editor (vs firing onEventClick). */
    private useEditorForEdit(): boolean {
        return this.props.props.builtInEditor && this.props.props.editable;
    }

    /** The raw (unexpanded) base event for a series id, looked up in the bound data. */
    private baseEventById(id: string): CalEvent | undefined {
        return (this.props.props.events || []).find((e) => e.id === id);
    }

    /** Open the built-in editor pre-filled from an existing event, to edit it in place. */
    private openEditorForEvent(ev: CalEvent): void {
        this.hideHover();
        this.setState({ editor: editorForEvent(ev, (id) => this.baseEventById(id)) });
    }

    private updateEditor(patch: Partial<Editor>): void {
        if (this.state.editor) {
            this.setState({ editor: { ...this.state.editor, ...patch } });
        }
    }

    private toggleEditorAllDay(allDay: boolean): void {
        const ed = this.state.editor;
        if (ed) {
            this.updateEditor(toggleAllDayPatch(ed, allDay));
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
        this.fireSpec(editorSaveSpec(ed, this.props.props.timezone, (id) => this.baseEventById(id)));
        this.setState({ editor: null });
    };

    private editorDelete = (): void => {
        const ed = this.state.editor;
        const spec = ed ? editorDeleteSpec(ed) : null;
        if (!spec) {
            return;
        }
        this.fireSpec(spec);
        this.setState({ editor: null });
    };

    // --- window / ranges ---------------------------------------------------
    private mondayFirst(): boolean {
        return this.props.props.weekStart === 'monday';
    }

    private days(): DayCol[] {
        const { showWeekends } = this.props.props;
        const zToday = todayInZone(this.props.props.timezone);
        if (this.props.props.view === 'day') {
            const d = this.state.cursor;
            const dow = d.getDay();
            return [{ iso: fmtDate(d), date: d, isToday: fmtDate(d) === fmtDate(zToday), isWeekend: dow === 0 || dow === 6 }];
        }
        return weekDays(this.state.cursor, this.mondayFirst(), showWeekends, zToday);
    }

    private monthGrid(): MonthGrid {
        return buildMonthGrid(startOfMonth(this.state.cursor), this.mondayFirst(), this.props.props.showWeekends, todayInZone(this.props.props.timezone));
    }

    private visibleRange(): { start: string; end: string } {
        if (this.props.props.view === 'month') {
            const g = this.monthGrid();
            return { start: g.visibleStart, end: g.visibleEnd };
        }
        const cols = this.days();
        return { start: cols[0].iso, end: fmtDate(addDays(cols[cols.length - 1].date, 1)) };
    }

    private syncOutput(): void {
        const r = this.visibleRange();
        const sig = `${this.props.props.view}|${r.start}|${r.end}`;
        if (sig === this.lastOutputSig) {
            return;
        }
        this.lastOutputSig = sig;
        const write = (): void => {
            this.outputTimer = 0;
            const w = this.props.store.props;
            w.write('output.visibleStart', r.start);
            w.write('output.visibleEnd', r.end);
        };
        // Debounce so a flurry of prev/next taps coalesces into a single window write
        // (and therefore one bound query), keeping the last range.
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

    /** Pixels-per-hour for the current grid resolution (must match TimeGrid's). */
    private hourPx(): number {
        return hourHeightPx(this.props.props.slotMinutes);
    }

    /** Position the time-grid scroll: centre on "now" when scrollToNow is on and today is
     *  in view, otherwise scroll to the configured scrollToHour. */
    private scrollTimeGrid(): void {
        const el = this.scrollRef.current;
        if (!el) {
            return;   // not the week/day time-grid (no scroll container)
        }
        const { scrollToNow, scrollToHour, dayStartHour, timezone } = this.props.props;
        const winStart = dayStartHour * 60;
        const todayVisible = this.days().some((c) => c.iso === fmtDate(todayInZone(timezone)));
        if (scrollToNow && todayVisible) {
            const y = ((nowMinutesInZone(timezone) - winStart) / 60) * this.hourPx();
            const max = el.scrollHeight - el.clientHeight;
            el.scrollTop = Math.max(0, Math.min(y - el.clientHeight / 2, max));   // centre "now"
        } else {
            el.scrollTop = Math.max(0, (scrollToHour - dayStartHour) * this.hourPx());
        }
    }

    // --- editing gestures (week/day) --------------------------------------
    private eventPayload(ev: CalEvent): object {
        const tz = this.props.props.timezone;
        return {
            id: ev.id || '', title: ev.title || '',
            start: emitWall(ev.start || '', !!ev.allDay, tz),
            end: ev.end ? emitWall(ev.end, !!ev.allDay, tz) : '',
            allDay: !!ev.allDay, category: ev.category || ''
        };
    }

    /** Apply a released gesture — the controller's commitDecision outcome — to the component. */
    private commitGesture(kind: CommitKind, g: Gesture, preview: Preview | null): void {
        const tz = this.props.props.timezone;
        switch (kind) {
            case 'editEvent':
                this.openEditorForEvent(g.ev!);
                break;
            case 'eventClick':
                this.fireEvent('onEventClick', this.eventPayload(g.ev!));
                break;
            case 'move': {
                if (g.surface === 'month') {
                    // Whole-day move: shift start/end by the dragged day delta, keep the time.
                    const from = parseDate(g.origDayIso);
                    const to = parseDate(preview!.dayIso);
                    const delta = from && to ? daysBetween(from, to) : 0;
                    if (delta === 0) {
                        // Dropped back on its own day: a sloppy click, not a move.
                        this.commitGesture(this.useEditorForEdit() ? 'editEvent' : 'eventClick', g, preview);
                        break;
                    }
                    this.fireSpec(moveResizeSpec('move', g.ev!, {
                        start: shiftWallDays(g.ev!.start, delta),
                        end: g.ev!.end ? shiftWallDays(g.ev!.end, delta) : undefined
                    }, tz));
                    break;
                }
                if (preview!.dayIso === g.origDayIso && preview!.startMin === g.origStartMin) {
                    // Snapping pulled the bar back where it started: treat as a click.
                    this.commitGesture(this.useEditorForEdit() ? 'editEvent' : 'eventClick', g, preview);
                    break;
                }
                this.fireSpec(moveResizeSpec('move', g.ev!, {
                    start: isoDateTime(preview!.dayIso, preview!.startMin),
                    end: isoDateTime(preview!.dayIso, preview!.endMin)
                }, tz));
                break;
            }
            case 'resize':
                this.fireSpec(moveResizeSpec('resize', g.ev!, { end: isoDateTime(preview!.dayIso, preview!.endMin) }, tz));
                break;
            case 'selectEditor':
                this.openEditor(isoDateTime(preview!.dayIso, preview!.startMin), isoDateTime(preview!.dayIso, preview!.endMin), false);
                break;
            case 'select': {
                const start = isoDateTime(preview!.dayIso, preview!.startMin);
                const end = isoDateTime(preview!.dayIso, preview!.endMin);
                this.fireEvent('onSelect', { start: emitWall(start, false, tz), end: emitWall(end, false, tz), allDay: false });
                break;
            }
            case 'createEditor':
                // a plain click on empty time -> editor with a default one-hour slot
                this.openEditor(isoDateTime(g.origDayIso, 9 * 60), isoDateTime(g.origDayIso, 10 * 60), false);
                break;
            case 'dateClick':
                this.fireEvent('onDateClick', { date: g.origDayIso });
                break;
            default:
                break;
        }
    }

    // --- navigation --------------------------------------------------------
    private step(dir: number): void {
        const view = this.props.props.view;
        const cursor = this.state.cursor;
        const next = view === 'month' ? addMonths(cursor, dir)
            : view === 'day' ? addDays(cursor, dir)
                : addDays(cursor, dir * 7);   // week + list page by week
        this.setState({ cursor: next });
    }

    private prev = (): void => this.step(-1);
    private next = (): void => this.step(1);
    private goToday = (): void => this.setState({ cursor: todayInZone(this.props.props.timezone) }, () => this.scrollTimeGrid());

    // `config.view` is the single source of truth and is two-way: switching the view
    // writes it back so a binding / script can read (and set) the current view.
    private setView(view: CalView): void {
        this.props.store.props.write('config.view', view);
    }

    /** Export the loaded events to a CSV file (downloaded client-side). */
    private exportCsv = (): void => {
        const csv = eventsToCsv(this.props.props.events || []);
        const blob = new Blob([CSV_BOM, csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'calendar-events.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    };

    // --- mini-month navigator (popover from the toolbar title) -------------
    private toggleMini = (e: React.MouseEvent): void => {
        if (this.state.mini) {
            this.closeMini();
            return;
        }
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        this.setState({
            mini: {
                rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
                month: startOfMonth(this.state.cursor)
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

    /** Pick a day in the mini grid: jump the main calendar there (keeping the current view) and close. */
    private miniPick(iso: string): void {
        const d = parseDate(iso);
        this.closeMini();
        if (d) {
            this.setState({ cursor: d });
        }
    }

    private closeMini(): void {
        this.miniDismiss.close();
        if (this.state.mini) {
            this.setState({ mini: null });
        }
    }

    // --- month-view "all events for a day" popover ------------------------
    private openDayPop(iso: string, e: React.MouseEvent): void {
        e.stopPropagation();   // don't let the cell's create-click fire too
        const cell = (e.currentTarget as HTMLElement).closest('.cal-day') as HTMLElement | null;
        const r = (cell || (e.currentTarget as HTMLElement)).getBoundingClientRect();
        this.hideHover();
        this.setState({ dayPop: { iso, rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } } });
        this.dayPopDismiss.open();
    }

    private closeDayPop(): void {
        this.dayPopDismiss.close();
        if (this.state.dayPop) {
            this.setState({ dayPop: null });
        }
    }

    /** Click an event inside the day popover: close it, then edit (built-in editor) or fire onEventClick. */
    private activateFromDayPop = (ev: CalEvent, e: React.MouseEvent): void => {
        this.closeDayPop();
        this.onEventClick(ev, e);
    };

    // --- category legend filter -------------------------------------------
    /** Toggle a category's visibility (legend click) and mirror the hidden set to output. */
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

    private onEventClick = (ev: CalEvent, e: React.MouseEvent): void => {
        e.stopPropagation();
        if (this.useEditorForEdit()) {
            this.openEditorForEvent(ev);
            return;
        }
        this.fireEvent('onEventClick', {
            id: ev.id || '', title: ev.title || '', start: ev.start || '',
            end: ev.end || '', allDay: !!ev.allDay
        });
    };

    private onDayClick = (iso: string): void => {
        if (this.useEditor()) {
            this.openEditor(iso, iso, true);   // month: an all-day event on that day
        } else {
            this.fireEvent('onDateClick', { date: iso });
        }
    };

    // --- toolbar -----------------------------------------------------------
    private title(): string {
        const { locale } = this.props.props;
        if (this.props.props.view === 'month') {
            return monthLabel(this.state.cursor, locale);
        }
        if (this.props.props.view === 'day') {
            return intlFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                .format(this.state.cursor);
        }
        const cols = this.days();
        const a = cols[0].date;
        const b = cols[cols.length - 1].date;
        const dm = intlFormat(locale, { day: 'numeric', month: 'short' });
        const dmy = intlFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
        return `${dm.format(a)} – ${dmy.format(b)}`;
    }

    private renderList(): React.ReactNode {
        return (
            <ListView
                cols={this.days()}
                events={this.visibleEvents()}
                locale={this.props.props.locale}
                categories={this.props.props.categories}
                emptyMessage={this.props.props.emptyMessage}
                labels={this.props.props.labels}
                enterClass={(id) => this.enterClass(id)}
                hoverProps={(ev) => this.hoverProps(ev)}
                onEventClick={(ev, e) => this.onEventClick(ev, e)}
            />
        );
    }

    /** No events configured at all (neither source) and not mid-fetch — drives the empty badge. */
    private isConfiguredEmpty(): boolean {
        const p = this.props.props;
        return !p.loading && (p.events || []).length === 0 && (p.recurringEvents || []).length === 0;
    }

    /** A short "how it works / how to add events" hint for the empty-state badge tooltip,
     *  tailored to whether this calendar actually lets the user create events. */
    private emptyHint(): string {
        const p = this.props.props;
        const canCreate = (p.editable && p.builtInEditor) || p.selectable;
        return [p.labels.emptyHintIntro, canCreate ? p.labels.emptyHintCreate : p.labels.emptyHintBind].join('\n');
    }

    private renderToolbar(): React.ReactNode {
        return (
            <Toolbar
                title={this.title()}
                view={this.props.props.view}
                showMiniNav={this.props.props.showMiniNav}
                miniOpen={!!this.state.mini}
                showExport={this.props.props.showExport}
                emptyLabel={this.isConfiguredEmpty() ? this.props.props.emptyMessage : ''}
                emptyHint={this.emptyHint()}
                labels={this.props.props.labels}
                onToggleMini={this.toggleMini}
                onSetView={(v) => this.setView(v)}
                onExport={this.exportCsv}
                onPrev={this.prev}
                onToday={this.goToday}
                onNext={this.next}
            />
        );
    }

    // --- month view --------------------------------------------------------
    private renderMonth(): React.ReactNode {
        const p = this.state.preview;
        const monthDrag = p && p.surface === 'month' ? p : null;
        return (
            <MonthView
                grid={this.monthGrid()}
                events={this.visibleEvents()}
                locale={this.props.props.locale}
                monthCap={this.state.monthCap}
                categories={this.props.props.categories}
                labels={this.props.props.labels}
                weeksRef={this.weeksRef}
                editable={this.props.props.editable}
                dragEventId={monthDrag ? monthDrag.eventId || '' : ''}
                dropDayIso={monthDrag ? monthDrag.dayIso : ''}
                enterClass={(id) => this.enterClass(id)}
                hoverProps={(ev) => this.hoverProps(ev)}
                onDayClick={(iso) => this.onDayClick(iso)}
                openDayPop={(iso, e) => this.openDayPop(iso, e)}
                onEventClick={(ev, e) => this.onEventClick(ev, e)}
                onStartMove={(ev, e) => this.gestures.startMonthMove(ev, e)}
            />
        );
    }

    private renderHoverPopover(): React.ReactNode {
        if (!this.state.hover) {
            return null;
        }
        return <HoverPopover hover={this.state.hover} locale={this.props.props.locale} categories={this.props.props.categories} />;
    }

    /** The built-in new-event editor popover (centered modal, portaled to body). */
    private renderEditor(): React.ReactNode {
        const ed = this.state.editor;
        if (!ed) {
            return null;
        }
        return (
            <EventEditor
                editor={ed}
                categories={this.props.props.categories || []}
                timezone={this.props.props.timezone}
                locale={this.props.props.locale}
                labels={this.props.props.labels}
                onUpdate={(patch) => this.updateEditor(patch)}
                onToggleAllDay={(allDay) => this.toggleEditorAllDay(allDay)}
                onCancel={this.editorCancel}
                onSave={this.editorSave}
                onDelete={this.editorDelete}
            />
        );
    }

    /** The events to render for the current window, with recurring series expanded. */
    private visibleEvents(): CalEvent[] {
        const tz = this.props.props.timezone;
        const r = this.visibleRange();
        const s = parseDate(r.start) || todayInZone(tz);
        const e = parseDate(r.end) || todayInZone(tz);
        const hidden = this.state.hiddenCats;
        // Merge the windowed `events` with the always-loaded `recurringEvents` so a windowed
        // query never drops a series (each binding stays trivially correct).
        const merged = [...(this.props.props.events || []), ...(this.props.props.recurringEvents || [])];
        // Normalise absolute instants (offset / Z / epoch) to naive wall-clock in the
        // display zone, so all downstream grid/layout logic runs in plant-local terms.
        // (All-day / date-only values pass through unchanged.) Colour stays raw and is
        // resolved at render time, so editing/moving never bakes a category colour on.
        const zoned = merged.map((ev) => ({
            ...ev,
            start: instantToZonedIso(ev.start, tz),
            end: ev.end != null ? instantToZonedIso(ev.end, tz) : undefined
        }));
        return expandEvents(zoned, s, e, tz)
            .filter((ev) => !(ev.category && hidden.has(ev.category)));   // legend filter
    }

    private renderTimeGrid(): React.ReactNode {
        return (
            <TimeGrid
                cols={this.days()}
                events={this.visibleEvents()}
                locale={this.props.props.locale}
                view={this.props.props.view}
                editable={this.props.props.editable}
                dayStartHour={this.props.props.dayStartHour}
                dayEndHour={this.props.props.dayEndHour}
                slotMinutes={this.props.props.slotMinutes}
                nowMinutes={nowMinutesInZone(this.props.props.timezone)}
                preview={this.state.preview}
                categories={this.props.props.categories}
                labels={this.props.props.labels}
                scrollRef={this.scrollRef}
                enterClass={(id) => this.enterClass(id)}
                hoverProps={(ev) => this.hoverProps(ev)}
                onEventClick={(ev, e) => this.onEventClick(ev, e)}
                onStartCreate={(iso, e) => this.gestures.startCreate(iso, e)}
                onStartMove={(ev, e) => this.gestures.startMove(ev, e)}
                onStartResize={(ev, e) => this.gestures.startResize(ev, e)}
                onScroll={() => this.hideHover()}
            />
        );
    }

    /** Mini-month navigator — a compact month grid in a popover anchored under the title. */
    private renderMini(): React.ReactNode {
        const m = this.state.mini;
        if (!m) {
            return null;
        }
        return (
            <MiniMonthNav
                mini={m}
                locale={this.props.props.locale}
                mondayFirst={this.mondayFirst()}
                range={this.visibleRange()}
                cursorIso={fmtDate(this.state.cursor)}
                showRange={this.props.props.view !== 'month'}
                labels={this.props.props.labels}
                onStep={(dir) => this.miniStep(dir)}
                onPick={(iso) => this.miniPick(iso)}
            />
        );
    }

    private renderLegend(): React.ReactNode {
        if (!this.props.props.showLegend) {
            return null;
        }
        return (
            <Legend
                categories={this.props.props.categories || []}
                hiddenCats={this.state.hiddenCats}
                onToggle={(id) => this.toggleCategory(id)}
            />
        );
    }

    /** Month-view popover listing every event for one day (from "+N more" / the date number). */
    private renderDayPop(): React.ReactNode {
        const dp = this.state.dayPop;
        if (!dp) {
            return null;
        }
        return (
            <DayPopover
                dayPop={dp}
                events={groupEventsByDay(this.visibleEvents())[dp.iso] || []}
                locale={this.props.props.locale}
                categories={this.props.props.categories}
                labels={this.props.props.labels}
                onActivate={(ev, e) => this.activateFromDayPop(ev, e)}
            />
        );
    }

    render(): React.ReactNode {
        const { showToolbar, loading } = this.props.props;
        return (
            <div {...this.props.emit({ classes: loading ? ['mustry-calendar', 'cal-loading'] : ['mustry-calendar'] })} ref={this.rootRef}>
                {showToolbar && this.renderToolbar()}
                {loading && <div className="cal-loading-bar" aria-hidden="true" />}
                {this.props.props.view === 'month' ? this.renderMonth()
                    : this.props.props.view === 'list' ? this.renderList()
                        : this.renderTimeGrid()}
                {this.renderLegend()}
                {this.renderHoverPopover()}
                {this.renderEditor()}
                {this.renderMini()}
                {this.renderDayPop()}
            </div>
        );
    }
}

export class CalendarMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return Calendar;
    }

    getDefaultSize(): Size2d {
        return { width: 720, height: 560 };
    }

    getPropsReducer(tree: PropertyTree): CalendarProps {
        return mapCalendarProps(tree);
    }
}
