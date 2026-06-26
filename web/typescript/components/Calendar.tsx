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
    CalEvent,
    DayCell,
    DayCol,
    MonthGrid
} from './calendarLogic';

// Must match Calendar.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.calendar';

type WeekStart = 'monday' | 'sunday';
type CalView = 'month' | 'week' | 'day';

const SLOT_PX = 42;        // pixels per hour on the time grid
const DEFAULT_DUR_MIN = 60; // assumed duration for a timed event with no end

export interface CalendarProps {
    view: CalView;
    showToolbar: boolean;
    weekStart: WeekStart;
    locale: string;
    showWeekends: boolean;
    maxEventsPerDay: number;
    dayStartHour: number;
    dayEndHour: number;
    scrollToHour: number;
    events: CalEvent[];
}

interface CalendarState {
    view: CalView;
    cursor: Date;   // anchor day (drives the displayed month / week / day)
}

export class Calendar extends Component<ComponentProps<CalendarProps>, CalendarState> {

    private lastOutputSig = '';
    private scrollRef = React.createRef<HTMLDivElement>();

    constructor(props: ComponentProps<CalendarProps>) {
        super(props);
        this.state = { view: props.props.view || 'month', cursor: today() };
    }

    componentDidMount(): void {
        this.syncOutput();
        this.scrollToHour();
    }

    componentDidUpdate(): void {
        this.syncOutput();
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    // --- window / ranges ---------------------------------------------------
    private mondayFirst(): boolean {
        return this.props.props.weekStart === 'monday';
    }

    private days(): DayCol[] {
        const { showWeekends } = this.props.props;
        if (this.state.view === 'day') {
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
        if (this.state.view === 'month') {
            const g = this.monthGrid();
            return { start: g.visibleStart, end: g.visibleEnd };
        }
        const cols = this.days();
        return { start: cols[0].iso, end: fmtDate(addDays(cols[cols.length - 1].date, 1)) };
    }

    private syncOutput(): void {
        const r = this.visibleRange();
        const sig = `${this.state.view}|${r.start}|${r.end}`;
        if (sig === this.lastOutputSig) {
            return;
        }
        this.lastOutputSig = sig;
        const w = this.props.store.props;
        w.write('output.currentView', this.state.view);
        w.write('output.visibleStart', r.start);
        w.write('output.visibleEnd', r.end);
    }

    private scrollToHour(): void {
        const el = this.scrollRef.current;
        if (el && this.state.view !== 'month') {
            const { scrollToHour, dayStartHour } = this.props.props;
            el.scrollTop = Math.max(0, (scrollToHour - dayStartHour) * SLOT_PX);
        }
    }

    // --- navigation --------------------------------------------------------
    private step(dir: number): void {
        const { view, cursor } = this.state;
        const next = view === 'month' ? addMonths(cursor, dir)
            : view === 'week' ? addDays(cursor, dir * 7)
                : addDays(cursor, dir);
        this.setState({ cursor: next });
    }

    private prev = (): void => this.step(-1);
    private next = (): void => this.step(1);
    private goToday = (): void => this.setState({ cursor: today() });

    private setView(view: CalView): void {
        this.setState({ view }, () => this.scrollToHour());
    }

    private onEventClick = (ev: CalEvent, e: React.MouseEvent): void => {
        e.stopPropagation();
        this.fireEvent('onEventClick', {
            id: ev.id || '', title: ev.title || '', start: ev.start || '',
            end: ev.end || '', allDay: !!ev.allDay
        });
    };

    private onDayClick = (iso: string): void => {
        this.fireEvent('onDateClick', { date: iso });
    };

    // --- toolbar -----------------------------------------------------------
    private title(): string {
        const { locale } = this.props.props;
        if (this.state.view === 'month') {
            return monthLabel(this.state.cursor, locale);
        }
        if (this.state.view === 'day') {
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

    private renderToolbar(): React.ReactNode {
        const views: CalView[] = ['month', 'week', 'day'];
        return (
            <div className="cal-toolbar">
                <div className="cal-title">{this.title()}</div>
                <div className="cal-views">
                    {views.map((v) => (
                        <button
                            type="button"
                            key={v}
                            className={`cal-view-btn${this.state.view === v ? ' cal-view-btn--active' : ''}`}
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
                            style={ev.color ? { background: ev.color, borderColor: ev.color } : undefined}
                            onClick={(e) => this.onEventClick(ev, e)}
                        >{ev.title}</button>
                    ))}
                    {more > 0 && <div className="cal-more">+{more} more</div>}
                </div>
            </div>
        );
    }

    private renderMonth(): React.ReactNode {
        const { locale, events } = this.props.props;
        const g = this.monthGrid();
        const byDay = groupEventsByDay(events || []);
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
    private renderTimeGrid(): React.ReactNode {
        const { locale, events, dayStartHour, dayEndHour } = this.props.props;
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
                                    style={ev.color ? { background: ev.color, borderColor: ev.color } : undefined}
                                    onClick={(e) => this.onEventClick(ev, e)}
                                >{ev.title}</button>
                            ))}
                        </div>
                    ))}
                </div>
                <div className="cal-tg-scroll" ref={this.scrollRef}>
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
                                className="cal-tg-col"
                                key={c.iso}
                                style={{ backgroundSize: `100% ${SLOT_PX}px` }}
                                onClick={() => this.onDayClick(c.iso)}
                            >
                                {layoutDayEvents(events || [], c.iso, winStart, winEnd, DEFAULT_DUR_MIN).map((it, i) => {
                                    const top = ((it.startMin - winStart) / 60) * SLOT_PX;
                                    const height = ((it.endMin - it.startMin) / 60) * SLOT_PX;
                                    const ev = it.event;
                                    return (
                                        <button
                                            type="button" className="cal-tg-event" key={ev.id || i} title={ev.title}
                                            style={{
                                                top, height,
                                                left: `${(it.lane / it.lanes) * 100}%`,
                                                width: `calc(${100 / it.lanes}% - 3px)`,
                                                background: ev.color || undefined,
                                                borderColor: ev.color || undefined
                                            }}
                                            onClick={(e) => this.onEventClick(ev, e)}
                                        >{ev.title}</button>
                                    );
                                })}
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
                {this.state.view === 'month' ? this.renderMonth() : this.renderTimeGrid()}
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
                color: e && e.color ? String(e.color) : undefined
            }))
        };
    }
}
