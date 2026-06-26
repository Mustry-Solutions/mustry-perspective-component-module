import * as React from 'react';
import * as ReactDOM from 'react-dom';
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
    today
} from './dateUtils';
import {
    buildMonthGrid,
    groupEventsByDay,
    splitForDay,
    weekDays,
    layoutDayEvents,
    allDayEventsForDay,
    backgroundBandsForDay,
    expandEvents,
    isTimed,
    timeMinutes,
    snapMinutes,
    minuteFromOffset,
    isoDateTime,
    CalEvent,
    DayCell,
    DayCol,
    MonthGrid
} from './calendarLogic';

// Must match Calendar.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.calendar';

type WeekStart = 'monday' | 'sunday';
type CalView = 'month' | 'week' | 'day' | 'list';

const SLOT_PX = 42;         // pixels per hour on the time grid
const DEFAULT_DUR_MIN = 60; // assumed duration for a timed event with no end
const SNAP_MIN = 15;        // drag/resize snapping granularity

type GestureMode = 'move' | 'resize' | 'create';

interface Gesture {
    mode: GestureMode;
    ev?: CalEvent;            // move / resize target
    startClientX: number;
    startClientY: number;
    origStartMin: number;
    origEndMin: number;
    durationMin: number;
    origDayIso: string;
    moved: boolean;
}

interface Preview {
    mode: GestureMode;
    eventId?: string;
    title?: string;
    color?: string;
    dayIso: string;
    startMin: number;
    endMin: number;
}

export interface CalendarProps {
    view: CalView;
    showToolbar: boolean;
    editable: boolean;
    selectable: boolean;
    builtInEditor: boolean;
    weekStart: WeekStart;
    locale: string;
    showWeekends: boolean;
    maxEventsPerDay: number;
    dayStartHour: number;
    dayEndHour: number;
    scrollToHour: number;
    events: CalEvent[];
}

interface HoverInfo {
    event: CalEvent;
    rect: { top: number; bottom: number; left: number; right: number };
}

interface Editor {
    title: string;
    start: string;   // 'YYYY-MM-DDTHH:mm' (timed) or 'YYYY-MM-DD' (all-day)
    end: string;
    allDay: boolean;
    color: string;
    description: string;
}

const EDITOR_COLORS = ['#0c7bb3', '#27ae60', '#e67e22', '#e11d48', '#8e44ad', '#697077'];

interface CalendarState {
    cursor: Date;   // anchor day (drives the displayed month / week / day)
    preview: Preview | null;
    hover: HoverInfo | null;   // event under the cursor -> detail popover
    editor: Editor | null;     // built-in new-event editor popover
}

export class Calendar extends Component<ComponentProps<CalendarProps>, CalendarState> {

    private lastOutputSig = '';
    private scrollRef = React.createRef<HTMLDivElement>();
    private gesture: Gesture | null = null;
    private colRects: Array<{ day: string; rect: DOMRect }> = [];

    private hoverTimer = 0;

    constructor(props: ComponentProps<CalendarProps>) {
        super(props);
        this.state = { cursor: today(), preview: null, hover: null, editor: null };
    }

    componentDidMount(): void {
        this.syncOutput();
        this.scrollToHour();
    }

    componentDidUpdate(prevProps: ComponentProps<CalendarProps>): void {
        this.syncOutput();
        if (prevProps.props.view !== this.props.props.view) {
            this.scrollToHour();   // re-scroll the time grid after switching to week/day
        }
    }

    componentWillUnmount(): void {
        this.removeDocListeners();
        this.clearHoverTimer();
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
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

    private openEditor(startIso: string, endIso: string, allDay: boolean): void {
        this.hideHover();
        const start = allDay ? startIso.slice(0, 10) : startIso.slice(0, 16);
        const end = allDay ? (endIso || startIso).slice(0, 10) : endIso.slice(0, 16);
        this.setState({ editor: { title: '', start, end, allDay, color: EDITOR_COLORS[0], description: '' } });
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

    private editorCreate = (): void => {
        const ed = this.state.editor;
        if (!ed) {
            return;
        }
        const norm = (v: string) => (ed.allDay ? v.slice(0, 10) : (v.length === 16 ? `${v}:00` : v));
        this.fireEvent('onEventCreate', {
            id: `evt-${new Date().getTime()}`,
            title: ed.title || 'New event',
            start: norm(ed.start),
            end: norm(ed.end),
            allDay: ed.allDay,
            color: ed.color,
            description: ed.description
        });
        this.setState({ editor: null });
    };

    // --- window / ranges ---------------------------------------------------
    private mondayFirst(): boolean {
        return this.props.props.weekStart === 'monday';
    }

    private days(): DayCol[] {
        const { showWeekends } = this.props.props;
        if (this.props.props.view === 'day') {
            const d = this.state.cursor;
            const dow = d.getDay();
            return [{ iso: fmtDate(d), date: d, isToday: fmtDate(d) === fmtDate(today()), isWeekend: dow === 0 || dow === 6 }];
        }
        return weekDays(this.state.cursor, this.mondayFirst(), showWeekends);
    }

    private monthGrid(): MonthGrid {
        return buildMonthGrid(startOfMonth(this.state.cursor), this.mondayFirst(), this.props.props.showWeekends);
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

    private scrollToHour(): void {
        const el = this.scrollRef.current;
        if (el && this.props.props.view !== 'month') {
            const { scrollToHour, dayStartHour } = this.props.props;
            el.scrollTop = Math.max(0, (scrollToHour - dayStartHour) * SLOT_PX);
        }
    }

    // --- editing gestures (week/day) --------------------------------------
    private snap(min: number): number {
        return snapMinutes(min, SNAP_MIN);
    }

    private iso(dayIso: string, min: number): string {
        return isoDateTime(dayIso, min);
    }

    /** Minutes-from-midnight -> "HH:mm". */
    private hhmm(min: number): string {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
    }

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
        return { id: ev.id || '', title: ev.title || '', start: ev.start || '', end: ev.end || '', allDay: !!ev.allDay };
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
        for (const c of this.colRects) {
            if (clientX >= c.rect.left && clientX < c.rect.right) {
                return c;
            }
        }
        return null;
    }

    private minuteAtY(rect: DOMRect, clientY: number): number {
        const { dayStartHour, dayEndHour } = this.props.props;
        return minuteFromOffset(clientY - rect.top, SLOT_PX, dayStartHour * 60, dayEndHour * 60, SNAP_MIN);
    }

    private addDocListeners(): void {
        document.addEventListener('mousemove', this.onDocMove, true);
        document.addEventListener('mouseup', this.onDocUp, true);
    }

    private removeDocListeners(): void {
        document.removeEventListener('mousemove', this.onDocMove, true);
        document.removeEventListener('mouseup', this.onDocUp, true);
    }

    private startMove = (ev: CalEvent, e: React.MouseEvent): void => {
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
            this.setState({ preview: { mode: 'move', eventId: ev.id, title: ev.title, color: ev.color, dayIso: day, startMin: s, endMin: end } });
        }
    };

    private startResize = (ev: CalEvent, e: React.MouseEvent): void => {
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
        this.setState({ preview: { mode: 'resize', eventId: ev.id, title: ev.title, color: ev.color, dayIso: day, startMin: s, endMin: end } });
    };

    private startCreate = (dayIso: string, e: React.MouseEvent): void => {
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

    private onDocMove = (e: MouseEvent): void => {
        const g = this.gesture;
        if (!g) {
            return;
        }
        if (!g.moved && Math.abs(e.clientY - g.startClientY) + Math.abs(e.clientX - g.startClientX) > 4) {
            g.moved = true;
        }
        const { dayStartHour, dayEndHour } = this.props.props;
        const winStart = dayStartHour * 60;
        const winEnd = dayEndHour * 60;
        if (g.mode === 'move') {
            if (!this.props.props.editable) {
                return;
            }
            const col = this.colAt(e.clientX) || this.colRects.filter((c) => c.day === g.origDayIso)[0];
            const delta = this.snap(((e.clientY - g.startClientY) / SLOT_PX) * 60);
            const start = Math.max(winStart, Math.min(winEnd - g.durationMin, g.origStartMin + delta));
            this.setState({ preview: { mode: 'move', eventId: g.ev!.id, title: g.ev!.title, color: g.ev!.color, dayIso: col.day, startMin: start, endMin: start + g.durationMin } });
        } else if (g.mode === 'resize') {
            const delta = this.snap(((e.clientY - g.startClientY) / SLOT_PX) * 60);
            const end = Math.max(g.origStartMin + SNAP_MIN, Math.min(winEnd, g.origEndMin + delta));
            this.setState({ preview: { mode: 'resize', eventId: g.ev!.id, title: g.ev!.title, color: g.ev!.color, dayIso: g.origDayIso, startMin: g.origStartMin, endMin: end } });
        } else if (this.props.props.selectable) {
            const col = this.colRects.filter((c) => c.day === g.origDayIso)[0];
            const cur = this.minuteAtY(col.rect, e.clientY);
            const a = Math.min(g.origStartMin, cur);
            const b = Math.max(g.origStartMin, cur);
            this.setState({ preview: { mode: 'create', dayIso: g.origDayIso, startMin: a, endMin: Math.max(b, a + SNAP_MIN) } });
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
        if (g.mode === 'move') {
            if (!this.props.props.editable || !g.moved || !preview) {
                this.fireEvent('onEventClick', this.eventPayload(g.ev!));
                return;
            }
            this.fireEvent('onEventDrop', {
                ...this.eventPayload(g.ev!),
                newStart: this.iso(preview.dayIso, preview.startMin),
                newEnd: this.iso(preview.dayIso, preview.endMin)
            });
        } else if (g.mode === 'resize') {
            if (g.moved && preview) {
                this.fireEvent('onEventResize', { ...this.eventPayload(g.ev!), newEnd: this.iso(preview.dayIso, preview.endMin) });
            }
        } else if (g.moved && preview && this.props.props.selectable) {
            const start = this.iso(preview.dayIso, preview.startMin);
            const end = this.iso(preview.dayIso, preview.endMin);
            if (this.useEditor()) {
                this.openEditor(start, end, false);
            } else {
                this.fireEvent('onSelect', { start, end, allDay: false });
            }
        } else if (this.useEditor()) {
            // a plain click on empty time -> editor with a default one-hour slot
            this.openEditor(this.iso(g.origDayIso, 9 * 60), this.iso(g.origDayIso, 10 * 60), false);
        } else {
            this.fireEvent('onDateClick', { date: g.origDayIso });
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
    private goToday = (): void => this.setState({ cursor: today() });

    // `config.view` is the single source of truth and is two-way: switching the view
    // writes it back so a binding / script can read (and set) the current view.
    private setView(view: CalView): void {
        this.props.store.props.write('config.view', view);
    }

    private onEventClick = (ev: CalEvent, e: React.MouseEvent): void => {
        e.stopPropagation();
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

    /** Agenda list of the visible week's events, grouped by day. */
    private renderList(): React.ReactNode {
        const { locale } = this.props.props;
        const cols = this.days();
        const byDay = groupEventsByDay(this.visibleEvents());
        const dayFmt = intlFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
        const timeFmt = intlFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
        const rows = cols
            .map((c) => ({ c, evs: byDay[c.iso] || [] }))
            .filter((r) => r.evs.length > 0);
        return (
            <div className="cal-list">
                {rows.length === 0 && <div className="cal-list-empty">No events</div>}
                {rows.map(({ c, evs }) => (
                    <div className="cal-list-day" key={c.iso}>
                        <div className={`cal-list-date${c.isToday ? ' cal-list-date--today' : ''}`}>{dayFmt.format(c.date)}</div>
                        {evs.map((ev, i) => {
                            const tm = timeMinutes(ev.start);
                            return (
                                <button
                                    type="button" className="cal-list-event" key={ev.id || i}
                                    onClick={(e) => this.onEventClick(ev, e)}
                                    {...this.hoverProps(ev)}
                                >
                                    <span className="cal-list-dot" style={{ background: ev.color || 'var(--cal-accent)' }} />
                                    <span className="cal-list-time">
                                        {tm === null ? 'all-day' : timeFmt.format(new Date(2000, 0, 1, Math.floor(tm / 60), tm % 60))}
                                    </span>
                                    <span className="cal-list-title">{ev.title}</span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    }

    private renderToolbar(): React.ReactNode {
        const views: CalView[] = ['month', 'week', 'day', 'list'];
        return (
            <div className="cal-toolbar">
                <div className="cal-title">{this.title()}</div>
                <div className="cal-views">
                    {views.map((v) => (
                        <button
                            type="button"
                            key={v}
                            className={`cal-view-btn${this.props.props.view === v ? ' cal-view-btn--active' : ''}`}
                            onClick={() => this.setView(v)}
                        >
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                        </button>
                    ))}
                </div>
                <div className="cal-nav">
                    <button type="button" className="cal-nav-btn" onClick={this.prev} aria-label="Previous">‹</button>
                    <button type="button" className="cal-today" onClick={this.goToday}>Today</button>
                    <button type="button" className="cal-nav-btn" onClick={this.next} aria-label="Next">›</button>
                </div>
            </div>
        );
    }

    // --- month view --------------------------------------------------------
    private renderDay(cell: DayCell, dayEvents: CalEvent[]): React.ReactNode {
        const { shown, more } = splitForDay(dayEvents, this.props.props.maxEventsPerDay);
        const cls = ['cal-day'];
        if (!cell.inMonth) { cls.push('cal-day--other'); }
        if (cell.isToday) { cls.push('cal-day--today'); }
        if (cell.isWeekend) { cls.push('cal-day--weekend'); }
        return (
            <div className={cls.join(' ')} key={cell.iso} onClick={() => this.onDayClick(cell.iso)}>
                <div className="cal-daynum">{cell.date.getDate()}</div>
                <div className="cal-events">
                    {shown.map((ev, i) => (
                        <button
                            type="button" className="cal-event" key={ev.id || i} title={ev.title}
                            style={ev.color ? ({ ['--ev' as string]: ev.color } as React.CSSProperties) : undefined}
                            onClick={(e) => this.onEventClick(ev, e)}
                            {...this.hoverProps(ev)}
                        >{ev.title}</button>
                    ))}
                    {more > 0 && <div className="cal-more">+{more} more</div>}
                </div>
            </div>
        );
    }

    private renderMonth(): React.ReactNode {
        const { locale } = this.props.props;
        const g = this.monthGrid();
        const byDay = groupEventsByDay(this.visibleEvents());
        const wdFmt = intlFormat(locale, { weekday: 'short' });
        return (
            <div className="cal-body" style={{ ['--cal-cols' as keyof React.CSSProperties]: g.weeks[0].length } as React.CSSProperties}>
                <div className="cal-weekdays">
                    {g.weeks[0].map((c) => <div className="cal-weekday" key={c.iso}>{wdFmt.format(c.date)}</div>)}
                </div>
                <div className="cal-weeks">
                    {g.weeks.map((week, wi) => (
                        <div className="cal-week" key={wi}>
                            {week.map((cell) => this.renderDay(cell, byDay[cell.iso] || []))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // --- week / day time-grid ---------------------------------------------
    /** The drag/resize ghost or create selection rectangle, if active in this column. */
    private renderPreview(dayIso: string): React.ReactNode {
        const p = this.state.preview;
        if (!p || p.dayIso !== dayIso) {
            return null;
        }
        const winStart = this.props.props.dayStartHour * 60;
        const top = ((p.startMin - winStart) / 60) * SLOT_PX;
        const height = ((p.endMin - p.startMin) / 60) * SLOT_PX;
        const timeLabel = `${this.hhmm(p.startMin)} – ${this.hhmm(p.endMin)}`;
        if (p.mode === 'create') {
            return (
                <div className="cal-tg-select" style={{ top, height }}>
                    <span className="cal-tg-select-time">{timeLabel}</span>
                </div>
            );
        }
        return (
            <div
                className="cal-tg-event cal-tg-event--ghost"
                style={{ top, height, left: 0, width: 'calc(100% - 3px)', ...(p.color ? { ['--ev' as string]: p.color } : {}) } as React.CSSProperties}
            >
                {p.title || ''}
                <span className="cal-tg-time">{timeLabel}</span>
            </div>
        );
    }

    /** Hover detail popover (portaled to escape the calendar's clipping). */
    private renderHoverPopover(): React.ReactNode {
        const h = this.state.hover;
        if (!h) {
            return null;
        }
        const ev = h.event;
        const { locale } = this.props.props;
        const width = 240;
        let left = h.rect.right + 8;
        if (left + width > window.innerWidth - 8) {
            left = Math.max(8, h.rect.left - width - 8);
        }
        const top = Math.max(8, Math.min(h.rect.top, window.innerHeight - 130));
        const sDate = parseDate(ev.start);
        const dateStr = sDate ? intlFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(sDate) : '';
        let timeStr: string;
        if (isTimed(ev)) {
            const sMin = timeMinutes(ev.start) as number;
            let eMin = ev.end && ev.end.slice(0, 10) === ev.start.slice(0, 10) ? timeMinutes(ev.end) : null;
            if (eMin === null || eMin <= sMin) {
                eMin = sMin + DEFAULT_DUR_MIN;
            }
            timeStr = `${dateStr} · ${this.hhmm(sMin)} – ${this.hhmm(eMin)}`;
        } else {
            timeStr = `All day · ${dateStr}`;
        }
        return ReactDOM.createPortal(
            <div className="cal-popover" style={{ top, left, width }}>
                <div className="cal-popover-title">
                    <span className="cal-popover-dot" style={{ background: ev.color || 'var(--cal-accent)' }} />
                    <span>{ev.title}</span>
                </div>
                <div className="cal-popover-time">{timeStr}</div>
                {ev.description ? <div className="cal-popover-desc">{ev.description}</div> : null}
            </div>,
            document.body
        );
    }

    /** The built-in new-event editor popover (centered modal, portaled to body). */
    private renderEditor(): React.ReactNode {
        const ed = this.state.editor;
        if (!ed) {
            return null;
        }
        const dtType = ed.allDay ? 'date' : 'datetime-local';
        return ReactDOM.createPortal(
            <div className="cal-editor-backdrop" onMouseDown={this.editorCancel}>
                <div
                    className="cal-editor"
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === 'Escape') { this.editorCancel(); } }}
                >
                    <div className="cal-editor-head">New event</div>
                    <label className="cal-editor-field">
                        <span>Title</span>
                        <input
                            type="text" autoFocus value={ed.title} placeholder="Event title"
                            onChange={(e) => this.updateEditor({ title: e.target.value })}
                        />
                    </label>
                    <label className="cal-editor-check">
                        <input type="checkbox" checked={ed.allDay} onChange={(e) => this.toggleEditorAllDay(e.target.checked)} />
                        <span>All day</span>
                    </label>
                    <div className="cal-editor-row">
                        <label className="cal-editor-field">
                            <span>Start</span>
                            <input type={dtType} value={ed.start} onChange={(e) => this.updateEditor({ start: e.target.value })} />
                        </label>
                        <label className="cal-editor-field">
                            <span>End</span>
                            <input type={dtType} value={ed.end} onChange={(e) => this.updateEditor({ end: e.target.value })} />
                        </label>
                    </div>
                    <div className="cal-editor-field">
                        <span>Colour</span>
                        <div className="cal-editor-swatches">
                            {EDITOR_COLORS.map((c) => (
                                <button
                                    type="button" key={c}
                                    className={`cal-editor-swatch${ed.color === c ? ' is-selected' : ''}`}
                                    style={{ background: c }}
                                    onClick={() => this.updateEditor({ color: c })}
                                />
                            ))}
                            <input
                                type="color"
                                className="cal-editor-color-custom"
                                title="Custom colour"
                                value={ed.color}
                                onChange={(e) => this.updateEditor({ color: e.target.value })}
                            />
                        </div>
                    </div>
                    <label className="cal-editor-field">
                        <span>Notes</span>
                        <textarea rows={2} value={ed.description} onChange={(e) => this.updateEditor({ description: e.target.value })} />
                    </label>
                    <div className="cal-editor-actions">
                        <button type="button" className="cal-editor-btn" onClick={this.editorCancel}>Cancel</button>
                        <button type="button" className="cal-editor-btn cal-editor-btn--primary" onClick={this.editorCreate}>Create</button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    /** The events to render for the current window, with recurring series expanded. */
    private visibleEvents(): CalEvent[] {
        const r = this.visibleRange();
        const s = parseDate(r.start) || today();
        const e = parseDate(r.end) || today();
        return expandEvents(this.props.props.events || [], s, e);
    }

    private renderTimeGrid(): React.ReactNode {
        const { locale, editable, dayStartHour, dayEndHour } = this.props.props;
        const events = this.visibleEvents();
        const cols = this.days();
        const winStart = dayStartHour * 60;
        const winEnd = dayEndHour * 60;
        const gridHeight = ((winEnd - winStart) / 60) * SLOT_PX;
        const hours: number[] = [];
        for (let h = dayStartHour; h < dayEndHour; h++) { hours.push(h); }
        const headFmt = intlFormat(locale, { weekday: 'short', day: 'numeric' });
        const hourFmt = intlFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const colStyle = { ['--cal-cols' as keyof React.CSSProperties]: cols.length } as React.CSSProperties;

        return (
            <div className="cal-tg">
                <div className="cal-tg-head" style={colStyle}>
                    <div className="cal-tg-gutter-cell" />
                    {cols.map((c) => (
                        <div className={`cal-tg-dayhead${c.isToday ? ' cal-tg-dayhead--today' : ''}`} key={c.iso}>
                            {headFmt.format(c.date)}
                        </div>
                    ))}
                </div>
                <div className="cal-tg-allday" style={colStyle}>
                    <div className="cal-tg-gutter-cell cal-tg-allday-label">all-day</div>
                    {cols.map((c) => (
                        <div className="cal-tg-allday-col" key={c.iso}>
                            {allDayEventsForDay(events || [], c.iso).map((ev, i) => (
                                <button
                                    type="button" className="cal-event" key={ev.id || i} title={ev.title}
                                    style={ev.color ? ({ ['--ev' as string]: ev.color } as React.CSSProperties) : undefined}
                                    onClick={(e) => this.onEventClick(ev, e)}
                                    {...this.hoverProps(ev)}
                                >{ev.title}</button>
                            ))}
                        </div>
                    ))}
                </div>
                <div className="cal-tg-scroll" ref={this.scrollRef} onScroll={() => this.hideHover()}>
                    <div className="cal-tg-body" style={{ ...colStyle, height: gridHeight }}>
                        <div className="cal-tg-gutter">
                            {hours.map((h) => (
                                <div className="cal-tg-hour" key={h} style={{ height: SLOT_PX }}>
                                    <span>{hourFmt.format(new Date(2000, 0, 1, h, 0))}</span>
                                </div>
                            ))}
                        </div>
                        {cols.map((c) => (
                            <div
                                className={`cal-tg-col${c.isToday ? ' cal-tg-col--today' : ''}`}
                                key={c.iso}
                                data-day={c.iso}
                                style={{ backgroundSize: `100% ${SLOT_PX}px` }}
                                onMouseDown={(e) => this.startCreate(c.iso, e)}
                            >
                                {backgroundBandsForDay(events, c.iso, winStart, winEnd).map((b, i) => (
                                    <div
                                        className="cal-tg-bg"
                                        key={b.id || `bg${i}`}
                                        style={{
                                            top: ((b.startMin - winStart) / 60) * SLOT_PX,
                                            height: ((b.endMin - b.startMin) / 60) * SLOT_PX,
                                            background: b.color || undefined
                                        }}
                                    />
                                ))}
                                {layoutDayEvents(events, c.iso, winStart, winEnd, DEFAULT_DUR_MIN).map((it, i) => {
                                    const ev = it.event;
                                    if (this.state.preview && this.state.preview.eventId === ev.id) {
                                        return null; // hidden while dragging; the ghost is shown instead
                                    }
                                    const top = ((it.startMin - winStart) / 60) * SLOT_PX;
                                    const height = ((it.endMin - it.startMin) / 60) * SLOT_PX;
                                    return (
                                        <button
                                            type="button"
                                            className={`cal-tg-event${editable ? ' cal-tg-event--draggable' : ''}`}
                                            key={ev.id || i} title={ev.title}
                                            style={{
                                                top, height,
                                                left: `${(it.lane / it.lanes) * 100}%`,
                                                width: `calc(${100 / it.lanes}% - 3px)`,
                                                ...(ev.color ? { ['--ev' as string]: ev.color } : {})
                                            } as React.CSSProperties}
                                            onMouseDown={(e) => this.startMove(ev, e)}
                                            {...this.hoverProps(ev)}
                                        >
                                            {ev.title}
                                            {height >= 34 && <span className="cal-tg-time">{this.hhmm(it.startMin)}–{this.hhmm(it.endMin)}</span>}
                                            {editable && (
                                                <div className="cal-tg-resize" onMouseDown={(e) => this.startResize(ev, e)} />
                                            )}
                                        </button>
                                    );
                                })}
                                {this.renderPreview(c.iso)}
                                {c.isToday && nowMin >= winStart && nowMin <= winEnd && (
                                    <div className="cal-tg-now" style={{ top: ((nowMin - winStart) / 60) * SLOT_PX }} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    render(): React.ReactNode {
        const { showToolbar } = this.props.props;
        return (
            <div {...this.props.emit({ classes: ['mustry-calendar'] })}>
                {showToolbar && this.renderToolbar()}
                {this.props.props.view === 'month' ? this.renderMonth()
                    : this.props.props.view === 'list' ? this.renderList()
                        : this.renderTimeGrid()}
                {this.renderHoverPopover()}
                {this.renderEditor()}
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
        return {
            view: tree.readString('config.view', 'month') as CalView,
            showToolbar: tree.readBoolean('config.showToolbar', true),
            editable: tree.readBoolean('config.editable', false),
            selectable: tree.readBoolean('config.selectable', false),
            builtInEditor: tree.readBoolean('config.builtInEditor', false),
            weekStart: tree.readString('config.weekStart', 'monday') as WeekStart,
            locale: tree.readString('config.locale', ''),
            showWeekends: tree.readBoolean('config.showWeekends', true),
            maxEventsPerDay: tree.readNumber('config.maxEventsPerDay', 3),
            dayStartHour: tree.readNumber('config.dayStartHour', 0),
            dayEndHour: tree.readNumber('config.dayEndHour', 24),
            scrollToHour: tree.readNumber('config.scrollToHour', 7),
            events: (tree.readArray('data.events', []) || []).map((e: any) => ({
                id: String((e && e.id) || ''),
                title: String((e && e.title) || ''),
                start: String((e && e.start) || ''),
                end: e && e.end ? String(e.end) : undefined,
                allDay: !!(e && e.allDay),
                color: e && e.color ? String(e.color) : undefined,
                description: e && e.description ? String(e.description) : undefined,
                display: e && e.display ? String(e.display) : undefined,
                rrule: e && e.rrule && e.rrule.freq ? e.rrule : undefined
            }))
        };
    }
}
