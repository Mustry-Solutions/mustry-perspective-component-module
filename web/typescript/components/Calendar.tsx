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
    fmtDate,
    intlFormat,
    monthLabel,
    parseDate,
    startOfMonth,
    instantToZonedIso,
    todayInZone,
    nowMinutesInZone,
    resolveZoned
} from './dateUtils';
import {
    buildMonthGrid,
    groupEventsByDay,
    eventsToCsv,
    weekDays,
    expandEvents,
    timeMinutes,
    snapMinutes,
    minuteFromOffset,
    isoDateTime,
    CalEvent,
    RRule,
    DayCol,
    MonthGrid
} from './calendarLogic';
import {
    WeekStart, CalView, Gesture, Editor, MiniNav, DayPop,
    Category, CalendarProps, CalendarState,
    DEFAULT_DUR_MIN, ENTER_MS, hourHeightPx
} from './calendar/types';
import { resolveColor as styleResolveColor } from './calendar/eventStyle';
import { mapCalendarProps } from './calendarProps';
import { colAtX, hasMoved, movePreview, resizePreview, createPreview, commitDecision } from './calendar/gestureLogic';
import { Legend } from './calendar/Legend';
import { HoverPopover } from './calendar/HoverPopover';
import { DayPopover } from './calendar/DayPopover';
import { MiniMonthNav } from './calendar/MiniMonthNav';
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
    private gesture: Gesture | null = null;
    private colRects: Array<{ day: string; rect: DOMRect }> = [];

    private hoverTimer = 0;
    private refreshTimer = 0;   // periodic re-render so the now-indicator ticks live

    // Enter-animation bookkeeping: animate an event chip only when a brand-new id
    // first appears (create / new data), not on initial load or navigation.
    private seenIds = new Set<string>();
    private pendingEnter = new Set<string>();
    private mounted = false;
    private enterTimers: number[] = [];

    constructor(props: ComponentProps<CalendarProps>) {
        super(props);
        this.state = {
            cursor: todayInZone(props.props.timezone), preview: null, hover: null, editor: null,
            mini: null, dayPop: null, hiddenCats: new Set(), monthCap: 3
        };
    }

    componentDidMount(): void {
        // Seed the "already seen" set so the initial events don't fire the create
        // animation (the container fades in instead).
        (this.props.props.events || []).forEach((e) => { if (e.id) { this.seenIds.add(e.id); } });
        this.mounted = true;
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
        this.detectNewEvents();
        this.recomputeMonthCap();   // week-count (5/6) or view changes can change the fit
        if (prevProps.props.refreshSeconds !== this.props.props.refreshSeconds) {
            this.setupRefreshTimer();
        }
    }

    componentWillUnmount(): void {
        this.removeDocListeners();
        this.closeMiniListeners();
        this.closeDayPopListeners();
        this.clearHoverTimer();
        this.enterTimers.forEach((t) => window.clearTimeout(t));
        if (this.refreshTimer) {
            window.clearInterval(this.refreshTimer);
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
                if (this.state.editor || this.gesture) {
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

    /** After a render, mark freshly-appeared event ids so their chips finish the enter animation, then settle. */
    private detectNewEvents(): void {
        const fresh: string[] = [];
        (this.props.props.events || []).forEach((e) => {
            if (e.id && !this.seenIds.has(e.id) && !this.pendingEnter.has(e.id)) {
                this.pendingEnter.add(e.id);
                fresh.push(e.id);
            }
        });
        if (!fresh.length) {
            return;
        }
        const t = window.setTimeout(() => {
            fresh.forEach((id) => { this.pendingEnter.delete(id); this.seenIds.add(id); });
            this.forceUpdate();   // drop the enter class once the animation has played
        }, ENTER_MS);
        this.enterTimers.push(t);
    }

    /** Enter-animation class for an event chip: set once for a never-seen base id. */
    private enterClass(occId: string): string {
        const base = (occId || '').split('::')[0];
        return this.mounted && !!base && !this.seenIds.has(base) ? ' cal-anim-enter' : '';
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    /**
     * Fires `onChange` for ANY data mutation (create / edit / delete / move / resize).
     * `event` is always the resulting event with its final start/end, so a single
     * handler can persist or trigger downstream logic without caring which gesture
     * produced it. This is the one "the data should change" event; onEventClick /
     * onDateClick / onSelect are the "the user did something" intent events.
     */
    private fireChange(
        action: 'create' | 'edit' | 'delete' | 'move' | 'resize',
        event: object,
        extra?: { scope?: 'series' | 'occurrence'; seriesId?: string; occurrenceDate?: string | null }
    ): void {
        this.fireEvent('onChange', { action, event, ...(extra || {}) });
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

    /** Default recurrence + edit-context fields for a fresh editor (no repeat, no series). */
    private editorDefaults(): Pick<Editor,
        'repeatFreq' | 'repeatInterval' | 'repeatByweekday' | 'repeatEndMode' | 'repeatUntil' | 'repeatCount' |
        'seriesId' | 'occurrenceDate' | 'scope'> {
        return {
            repeatFreq: '', repeatInterval: 1, repeatByweekday: [], repeatEndMode: 'never', repeatUntil: '', repeatCount: 10,
            seriesId: null, occurrenceDate: null, scope: 'series'
        };
    }

    private openEditor(startIso: string, endIso: string, allDay: boolean): void {
        this.hideHover();
        const start = allDay ? startIso.slice(0, 10) : startIso.slice(0, 16);
        const end = allDay ? (endIso || startIso).slice(0, 10) : endIso.slice(0, 16);
        this.setState({ editor: { id: null, title: '', start, end, allDay, category: this.defaultCategory(), description: '', ...this.editorDefaults() } });
    }

    /** Whether clicking an existing event opens the built-in editor (vs firing onEventClick). */
    private useEditorForEdit(): boolean {
        return this.props.props.builtInEditor && this.props.props.editable;
    }

    /** The raw (unexpanded) base event for a series id, looked up in the bound data. */
    private baseEventById(id: string): CalEvent | undefined {
        return (this.props.props.events || []).find((e) => e.id === id);
    }

    /** Open the built-in editor pre-filled from an existing event, to edit it in place.
     *  For a recurring occurrence (id "base::date") it recovers the series' rule and
     *  defaults the apply-to scope to "this event". */
    private openEditorForEvent(ev: CalEvent): void {
        this.hideHover();
        const allDay = !!ev.allDay;
        const cut = (v: string | undefined) => (v || '').slice(0, allDay ? 10 : 16);
        const rawId = ev.id || '';
        const isOcc = rawId.indexOf('::') >= 0;
        const seriesId = isOcc ? rawId.split('::')[0] : null;
        const occurrenceDate = isOcc ? rawId.split('::')[1] : null;
        const rr = seriesId ? (this.baseEventById(seriesId) || {} as CalEvent).rrule : undefined;
        this.setState({
            editor: {
                id: rawId,
                title: ev.title || '',
                start: cut(ev.start),
                end: cut(ev.end || ev.start),
                allDay,
                category: ev.category || '',
                description: ev.description || '',
                repeatFreq: rr ? rr.freq : '',
                repeatInterval: rr && rr.interval ? rr.interval : 1,
                repeatByweekday: rr && rr.byweekday ? rr.byweekday.slice() : [],
                repeatEndMode: rr ? (rr.until ? 'until' : (rr.count ? 'count' : 'never')) : 'never',
                repeatUntil: rr && rr.until ? rr.until : '',
                repeatCount: rr && rr.count ? rr.count : 10,
                seriesId,
                occurrenceDate,
                scope: isOcc ? 'occurrence' : 'series'
            }
        });
    }

    private updateEditor(patch: Partial<Editor>): void {
        if (this.state.editor) {
            this.setState({ editor: { ...this.state.editor, ...patch } });
        }
    }

    private toggleEditorAllDay(allDay: boolean): void {
        const ed = this.state.editor;
        if (!ed) {
            return;
        }
        if (allDay) {
            this.updateEditor({ allDay: true, start: ed.start.slice(0, 10), end: ed.end.slice(0, 10) });
        } else {
            const s = ed.start.length >= 16 ? ed.start : `${ed.start.slice(0, 10)}T09:00`;
            const e = ed.end.length >= 16 ? ed.end : `${ed.end.slice(0, 10)}T10:00`;
            this.updateEditor({ allDay: false, start: s, end: e });
        }
    }

    private editorCancel = (): void => {
        this.setState({ editor: null });
    };

    /** Build an RRule from the editor's repeat fields (undefined = does not repeat).
     *  Preserves an existing series' exdate list when re-saving the whole series. */
    private buildRRule(ed: Editor): RRule | undefined {
        if (!ed.repeatFreq) {
            return undefined;
        }
        const rr: RRule = { freq: ed.repeatFreq };
        if (ed.repeatInterval > 1) {
            rr.interval = ed.repeatInterval;
        }
        if (ed.repeatFreq === 'weekly' && ed.repeatByweekday.length) {
            rr.byweekday = ed.repeatByweekday.slice().sort((a, b) => a - b);
        }
        if (ed.repeatEndMode === 'until' && ed.repeatUntil) {
            rr.until = ed.repeatUntil;
        } else if (ed.repeatEndMode === 'count' && ed.repeatCount > 0) {
            rr.count = ed.repeatCount;
        }
        const base = ed.seriesId ? this.baseEventById(ed.seriesId) : undefined;
        if (base && base.rrule && base.rrule.exdate && base.rrule.exdate.length) {
            rr.exdate = base.rrule.exdate.slice();   // keep prior exceptions across a series edit
        }
        return rr;
    }

    /** Keep a series anchored on the base's (zone-local) date while applying an edited time. */
    private reanchorSeries(baseRaw: string | undefined, editedWall: string, allDay: boolean): string {
        const baseDate = instantToZonedIso(baseRaw || '', this.props.props.timezone).slice(0, 10);
        if (allDay) {
            return baseDate;
        }
        return baseDate + (editedWall.length >= 11 ? editedWall.slice(10) : 'T00:00:00');
    }

    private editorSave = (): void => {
        const ed = this.state.editor;
        if (!ed) {
            return;
        }
        const norm = (v: string) => (ed.allDay ? v.slice(0, 10) : (v.length === 16 ? `${v}:00` : v));
        const common = { title: ed.title || 'New event', allDay: ed.allDay, category: ed.category, description: ed.description };

        // (1) One occurrence of a series -> detached standalone override (the series gets an EXDATE).
        if (ed.seriesId && ed.scope === 'occurrence') {
            const event = {
                id: `${ed.seriesId}-x-${ed.occurrenceDate}`,
                ...common,
                start: this.emitTime(norm(ed.start), ed.allDay),
                end: this.emitTime(norm(ed.end), ed.allDay)
            };
            this.fireChange('edit', event, { scope: 'occurrence', seriesId: ed.seriesId, occurrenceDate: ed.occurrenceDate });
            this.setState({ editor: null });
            return;
        }

        const rr = this.buildRRule(ed);

        // (2) Whole series -> emit the base, preserving its anchor date(s), updating time/fields/rule.
        if (ed.seriesId && ed.scope === 'series') {
            const base = this.baseEventById(ed.seriesId);
            const event: Record<string, unknown> = {
                id: ed.seriesId,
                ...common,
                start: this.emitTime(this.reanchorSeries(base && base.start, norm(ed.start), ed.allDay), ed.allDay),
                end: this.emitTime(this.reanchorSeries(base && (base.end || base.start), norm(ed.end), ed.allDay), ed.allDay),
                rrule: rr || null   // null = recurrence removed from the series
            };
            this.fireChange('edit', event, { scope: 'series', seriesId: ed.seriesId });
            this.setState({ editor: null });
            return;
        }

        // (3) Plain create / edit of a standalone event (the repeat control may add recurrence).
        const isEdit = ed.id !== null;
        const event: Record<string, unknown> = {
            id: isEdit ? ed.id : `evt-${new Date().getTime()}`,
            ...common,
            start: this.emitTime(norm(ed.start), ed.allDay),
            end: this.emitTime(norm(ed.end), ed.allDay),
            rrule: rr || null
        };
        this.fireChange(isEdit ? 'edit' : 'create', event);
        this.setState({ editor: null });
    };

    private editorDelete = (): void => {
        const ed = this.state.editor;
        if (!ed || ed.id === null) {
            return;
        }
        // One occurrence of a series -> EXDATE (and drop any override for that date).
        if (ed.seriesId && ed.scope === 'occurrence') {
            this.fireChange('delete', { id: `${ed.seriesId}-x-${ed.occurrenceDate}` },
                { scope: 'occurrence', seriesId: ed.seriesId, occurrenceDate: ed.occurrenceDate });
            this.setState({ editor: null });
            return;
        }
        // Whole series.
        if (ed.seriesId && ed.scope === 'series') {
            this.fireChange('delete', { id: ed.seriesId }, { scope: 'series', seriesId: ed.seriesId });
            this.setState({ editor: null });
            return;
        }
        // Plain standalone delete.
        this.fireChange('delete', { id: ed.id, title: ed.title || '' });
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
        const w = this.props.store.props;
        w.write('output.visibleStart', r.start);
        w.write('output.visibleEnd', r.end);
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
    /** Pixels-per-hour for the current grid resolution (must match TimeGrid's). */
    private hourPx(): number {
        return hourHeightPx(this.props.props.slotMinutes);
    }

    private snap(min: number): number {
        return snapMinutes(min, this.props.props.slotMinutes);
    }

    private iso(dayIso: string, min: number): string {
        return isoDateTime(dayIso, min);
    }

    /** Convert an internal zone-local wall-clock string to the emitted form: an
     *  offset-bearing instant for timed events, or a date-only string for all-day. */
    private emitTime(wall: string, allDay: boolean): string {
        if (!wall) {
            return wall;
        }
        if (allDay) {
            return wall.slice(0, 10);
        }
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(wall);
        if (!m) {
            return wall;
        }
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
        return resolveZoned(d, this.props.props.timezone).iso;
    }

    /** Minutes-from-midnight -> "HH:mm". */

    /** A timed event's [start, end] minutes (end falls back to the default duration). */
    private eventMinutes(ev: CalEvent): { s: number; e: number } {
        const sm = timeMinutes(ev.start);
        const s = sm === null ? 0 : sm;
        let e: number | null = ev.end && ev.end.slice(0, 10) === ev.start.slice(0, 10) ? timeMinutes(ev.end) : null;
        if (e === null || e <= s) {
            e = s + DEFAULT_DUR_MIN;
        }
        return { s, e };
    }

    private eventPayload(ev: CalEvent): object {
        return {
            id: ev.id || '', title: ev.title || '',
            start: this.emitTime(ev.start || '', !!ev.allDay),
            end: ev.end ? this.emitTime(ev.end, !!ev.allDay) : '',
            allDay: !!ev.allDay, category: ev.category || ''
        };
    }

    /** A complete event object (incl. category/notes, raw colour) with start/end overrides applied — for onChange. */
    private changedEvent(ev: CalEvent, over: { start?: string; end?: string }): object {
        const allDay = !!ev.allDay;
        return {
            id: ev.id || '',
            title: ev.title || '',
            start: this.emitTime(over.start ?? ev.start ?? '', allDay),
            end: this.emitTime(over.end ?? ev.end ?? '', allDay),
            allDay,
            color: ev.color || '',         // raw override only (empty when category-coloured)
            category: ev.category || '',
            description: ev.description || ''
        };
    }

    /** Fire a move/resize. Dragging a single recurring occurrence (id "base::date")
     *  detaches it into a standalone override + an EXDATE on the series. */
    private fireMoveResize(action: 'move' | 'resize', ev: CalEvent, over: { start?: string; end?: string }): void {
        const rawId = ev.id || '';
        if (rawId.indexOf('::') >= 0) {
            const seriesId = rawId.split('::')[0];
            const occurrenceDate = rawId.split('::')[1];
            const event = this.changedEvent({ ...ev, id: `${seriesId}-x-${occurrenceDate}` }, over);
            this.fireChange(action, event, { scope: 'occurrence', seriesId, occurrenceDate });
        } else {
            this.fireChange(action, this.changedEvent(ev, over));
        }
    }

    private captureCols(): void {
        this.colRects = [];
        const root = this.scrollRef.current;
        if (!root) {
            return;
        }
        root.querySelectorAll('.cal-tg-col').forEach((el) => {
            this.colRects.push({ day: (el as HTMLElement).dataset.day || '', rect: el.getBoundingClientRect() });
        });
    }

    private colAt(clientX: number): { day: string; rect: DOMRect } | null {
        const hit = colAtX(this.colRects.map((c) => ({ day: c.day, left: c.rect.left, right: c.rect.right })), clientX);
        return hit ? this.colRects.filter((c) => c.day === hit.day)[0] : null;
    }

    private minuteAtY(rect: DOMRect, clientY: number): number {
        const { dayStartHour, dayEndHour, slotMinutes } = this.props.props;
        return minuteFromOffset(clientY - rect.top, this.hourPx(), dayStartHour * 60, dayEndHour * 60, slotMinutes);
    }

    private addDocListeners(): void {
        // Pointer events unify mouse / touch / pen. pointercancel fires when the browser
        // takes over for a touch scroll (empty-column drag) — we abort the gesture then.
        document.addEventListener('pointermove', this.onDocMove, true);
        document.addEventListener('pointerup', this.onDocUp, true);
        document.addEventListener('pointercancel', this.onDocCancel, true);
    }

    private removeDocListeners(): void {
        document.removeEventListener('pointermove', this.onDocMove, true);
        document.removeEventListener('pointerup', this.onDocUp, true);
        document.removeEventListener('pointercancel', this.onDocCancel, true);
    }

    /** A touch scroll (or system interruption) cancels the gesture without committing. */
    private onDocCancel = (): void => {
        this.removeDocListeners();
        this.gesture = null;
        this.setState({ preview: null });
    };

    private startMove = (ev: CalEvent, e: React.PointerEvent): void => {
        // Always start a gesture so a plain click resolves to onEventClick; only the
        // drag/preview behaviour is gated on `editable`.
        e.stopPropagation();
        this.hideHover();
        const { s, e: end } = this.eventMinutes(ev);
        const day = ev.start.slice(0, 10);
        this.captureCols();
        this.gesture = {
            mode: 'move', ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: s, origEndMin: end, durationMin: end - s, origDayIso: day, moved: false
        };
        this.addDocListeners();
        if (this.props.props.editable) {
            e.preventDefault();
            this.setState({ preview: { mode: 'move', eventId: ev.id, title: ev.title, color: this.resolveColor(ev), dayIso: day, startMin: s, endMin: end } });
        }
    };

    private startResize = (ev: CalEvent, e: React.PointerEvent): void => {
        if (!this.props.props.editable) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const { s, e: end } = this.eventMinutes(ev);
        const day = ev.start.slice(0, 10);
        this.captureCols();
        this.gesture = {
            mode: 'resize', ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: s, origEndMin: end, durationMin: end - s, origDayIso: day, moved: false
        };
        this.addDocListeners();
        this.setState({ preview: { mode: 'resize', eventId: ev.id, title: ev.title, color: this.resolveColor(ev), dayIso: day, startMin: s, endMin: end } });
    };

    private startCreate = (dayIso: string, e: React.PointerEvent): void => {
        this.hideHover();
        this.captureCols();
        const col = this.colRects.filter((c) => c.day === dayIso)[0];
        if (!col) {
            return;
        }
        const m = this.minuteAtY(col.rect, e.clientY);
        this.gesture = {
            mode: 'create', startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: m, origEndMin: m, durationMin: 0, origDayIso: dayIso, moved: false
        };
        this.addDocListeners();
    };

    private onDocMove = (e: PointerEvent): void => {
        const g = this.gesture;
        if (!g) {
            return;
        }
        // A slightly larger threshold on touch avoids a jittery finger turning a tap into a drag.
        const threshold = e.pointerType === 'touch' ? 10 : 4;
        if (!g.moved && hasMoved(e.clientX - g.startClientX, e.clientY - g.startClientY, threshold)) {
            g.moved = true;
        }
        const { dayStartHour, dayEndHour, slotMinutes } = this.props.props;
        const winStart = dayStartHour * 60;
        const winEnd = dayEndHour * 60;
        const deltaMin = this.snap(((e.clientY - g.startClientY) / this.hourPx()) * 60);
        if (g.mode === 'move') {
            if (!this.props.props.editable) {
                return;
            }
            const col = this.colAt(e.clientX) || this.colRects.filter((c) => c.day === g.origDayIso)[0];
            const { startMin, endMin } = movePreview(g.origStartMin, g.durationMin, deltaMin, winStart, winEnd);
            this.setState({ preview: { mode: 'move', eventId: g.ev!.id, title: g.ev!.title, color: this.resolveColor(g.ev!), dayIso: col.day, startMin, endMin } });
        } else if (g.mode === 'resize') {
            const { startMin, endMin } = resizePreview(g.origStartMin, g.origEndMin, deltaMin, winEnd, slotMinutes);
            this.setState({ preview: { mode: 'resize', eventId: g.ev!.id, title: g.ev!.title, color: this.resolveColor(g.ev!), dayIso: g.origDayIso, startMin, endMin } });
        } else if (this.props.props.selectable && e.pointerType !== 'touch') {
            // Drag-to-create is disabled on touch: a vertical drag on empty time scrolls the
            // grid (a tap creates instead). On mouse/pen it draws the selection as before.
            const col = this.colRects.filter((c) => c.day === g.origDayIso)[0];
            const cur = this.minuteAtY(col.rect, e.clientY);
            const { startMin, endMin } = createPreview(g.origStartMin, cur, slotMinutes);
            this.setState({ preview: { mode: 'create', dayIso: g.origDayIso, startMin, endMin } });
        }
    };

    private onDocUp = (): void => {
        const g = this.gesture;
        const preview = this.state.preview;
        this.removeDocListeners();
        this.gesture = null;
        this.setState({ preview: null });
        if (!g) {
            return;
        }
        const kind = commitDecision(g.mode, g.moved, !!preview, {
            editable: this.props.props.editable,
            selectable: this.props.props.selectable,
            useEditor: this.useEditor(),
            useEditorForEdit: this.useEditorForEdit()
        });
        switch (kind) {
            case 'editEvent':
                this.openEditorForEvent(g.ev!);
                break;
            case 'eventClick':
                this.fireEvent('onEventClick', this.eventPayload(g.ev!));
                break;
            case 'move':
                this.fireMoveResize('move', g.ev!, {
                    start: this.iso(preview!.dayIso, preview!.startMin),
                    end: this.iso(preview!.dayIso, preview!.endMin)
                });
                break;
            case 'resize':
                this.fireMoveResize('resize', g.ev!, { end: this.iso(preview!.dayIso, preview!.endMin) });
                break;
            case 'selectEditor':
                this.openEditor(this.iso(preview!.dayIso, preview!.startMin), this.iso(preview!.dayIso, preview!.endMin), false);
                break;
            case 'select': {
                const start = this.iso(preview!.dayIso, preview!.startMin);
                const end = this.iso(preview!.dayIso, preview!.endMin);
                this.fireEvent('onSelect', { start: this.emitTime(start, false), end: this.emitTime(end, false), allDay: false });
                break;
            }
            case 'createEditor':
                // a plain click on empty time -> editor with a default one-hour slot
                this.openEditor(this.iso(g.origDayIso, 9 * 60), this.iso(g.origDayIso, 10 * 60), false);
                break;
            case 'dateClick':
                this.fireEvent('onDateClick', { date: g.origDayIso });
                break;
            default:
                break;
        }
    };

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
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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
        this.openMiniListeners();
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
        this.closeMiniListeners();
        if (this.state.mini) {
            this.setState({ mini: null });
        }
    }

    private openMiniListeners(): void {
        document.addEventListener('pointerdown', this.onDocMini, true);
        document.addEventListener('keydown', this.onMiniKey, true);
    }

    private closeMiniListeners(): void {
        document.removeEventListener('pointerdown', this.onDocMini, true);
        document.removeEventListener('keydown', this.onMiniKey, true);
    }

    private onDocMini = (e: PointerEvent): void => {
        const t = e.target as HTMLElement | null;
        // Clicks inside the popover, or on the title toggle (which handles itself), don't close.
        if (t && (t.closest('.cal-mini') || t.closest('.cal-title--btn'))) {
            return;
        }
        this.closeMini();
    };

    private onMiniKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.closeMini();
        }
    };

    // --- month-view "all events for a day" popover ------------------------
    private openDayPop(iso: string, e: React.MouseEvent): void {
        e.stopPropagation();   // don't let the cell's create-click fire too
        const cell = (e.currentTarget as HTMLElement).closest('.cal-day') as HTMLElement | null;
        const r = (cell || (e.currentTarget as HTMLElement)).getBoundingClientRect();
        this.hideHover();
        this.setState({ dayPop: { iso, rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } } });
        this.openDayPopListeners();
    }

    private closeDayPop(): void {
        this.closeDayPopListeners();
        if (this.state.dayPop) {
            this.setState({ dayPop: null });
        }
    }

    private openDayPopListeners(): void {
        document.addEventListener('pointerdown', this.onDocDayPop, true);
        document.addEventListener('keydown', this.onDayPopKey, true);
    }

    private closeDayPopListeners(): void {
        document.removeEventListener('pointerdown', this.onDocDayPop, true);
        document.removeEventListener('keydown', this.onDayPopKey, true);
    }

    private onDocDayPop = (e: PointerEvent): void => {
        const t = e.target as HTMLElement | null;
        // Clicks inside the popover, or on a trigger (date number / "+N more"), manage themselves.
        if (t && (t.closest('.cal-daypop') || t.closest('.cal-daynum') || t.closest('.cal-more'))) {
            return;
        }
        this.closeDayPop();
    };

    private onDayPopKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.closeDayPop();
        }
    };

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
                enterClass={(id) => this.enterClass(id)}
                hoverProps={(ev) => this.hoverProps(ev)}
                onEventClick={(ev, e) => this.onEventClick(ev, e)}
            />
        );
    }

    /** A short "how it works / how to add events" hint for the empty-state badge tooltip,
     *  tailored to whether this calendar actually lets the user create events. */
    private emptyHint(): string {
        const p = this.props.props;
        const canCreate = (p.editable && p.builtInEditor) || p.selectable;
        const lines = ['This calendar shows the events in its data; switch Month / Week / Day / List in the toolbar.'];
        lines.push(canCreate
            ? 'Add an event: in Week or Day view, drag over an empty time slot.'
            : 'Events come from the data binding — enable "selectable" + "builtInEditor" to add them here.');
        return lines.join('\n');
    }

    private renderToolbar(): React.ReactNode {
        return (
            <Toolbar
                title={this.title()}
                view={this.props.props.view}
                showMiniNav={this.props.props.showMiniNav}
                miniOpen={!!this.state.mini}
                showExport={this.props.props.showExport}
                emptyLabel={(this.props.props.events || []).length === 0 ? this.props.props.emptyMessage : ''}
                emptyHint={this.emptyHint()}
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
        return (
            <MonthView
                grid={this.monthGrid()}
                events={this.visibleEvents()}
                locale={this.props.props.locale}
                monthCap={this.state.monthCap}
                categories={this.props.props.categories}
                weeksRef={this.weeksRef}
                enterClass={(id) => this.enterClass(id)}
                hoverProps={(ev) => this.hoverProps(ev)}
                onDayClick={(iso) => this.onDayClick(iso)}
                openDayPop={(iso, e) => this.openDayPop(iso, e)}
                onEventClick={(ev, e) => this.onEventClick(ev, e)}
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
        // Normalise absolute instants (offset / Z / epoch) to naive wall-clock in the
        // display zone, so all downstream grid/layout logic runs in plant-local terms.
        // (All-day / date-only values pass through unchanged.) Colour stays raw and is
        // resolved at render time, so editing/moving never bakes a category colour on.
        const zoned = (this.props.props.events || []).map((ev) => ({
            ...ev,
            start: instantToZonedIso(ev.start, tz),
            end: ev.end != null ? instantToZonedIso(ev.end, tz) : undefined
        }));
        return expandEvents(zoned, s, e)
            .filter((ev) => !(ev.category && hidden.has(ev.category)));   // legend filter
    }

    /** Resolve an event's display colour — used by the drag/resize preview ghost. */
    private resolveColor(ev: CalEvent): string | undefined {
        return styleResolveColor(this.props.props.categories, ev);
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
                scrollRef={this.scrollRef}
                enterClass={(id) => this.enterClass(id)}
                hoverProps={(ev) => this.hoverProps(ev)}
                onEventClick={(ev, e) => this.onEventClick(ev, e)}
                onStartCreate={(iso, e) => this.startCreate(iso, e)}
                onStartMove={(ev, e) => this.startMove(ev, e)}
                onStartResize={(ev, e) => this.startResize(ev, e)}
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
                onActivate={(ev, e) => this.activateFromDayPop(ev, e)}
            />
        );
    }

    render(): React.ReactNode {
        const { showToolbar } = this.props.props;
        return (
            <div {...this.props.emit({ classes: ['mustry-calendar'] })} ref={this.rootRef}>
                {showToolbar && this.renderToolbar()}
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
