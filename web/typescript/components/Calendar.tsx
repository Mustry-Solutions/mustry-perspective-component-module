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
    addMonths,
    intlFormat,
    monthLabel,
    startOfMonth,
    today
} from './dateUtils';
import {
    buildMonthGrid,
    groupEventsByDay,
    splitForDay,
    CalEvent,
    DayCell,
    MonthGrid
} from './calendarLogic';

// Must match Calendar.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.display.calendar';

type WeekStart = 'monday' | 'sunday';

export interface CalendarProps {
    view: string;
    showToolbar: boolean;
    weekStart: WeekStart;
    locale: string;
    showWeekends: boolean;
    maxEventsPerDay: number;
    events: CalEvent[];
}

interface CalendarState {
    viewMonth: Date;   // first day of the displayed month
}

export class Calendar extends Component<ComponentProps<CalendarProps>, CalendarState> {

    private lastOutputSig = '';

    constructor(props: ComponentProps<CalendarProps>) {
        super(props);
        this.state = { viewMonth: startOfMonth(today()) };
    }

    componentDidMount(): void {
        this.syncOutput();
    }

    componentDidUpdate(): void {
        this.syncOutput();
    }

    /** Fire a component event for authors' event scripts (suppressed at design time). */
    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    private grid(): MonthGrid {
        const { weekStart, showWeekends } = this.props.props;
        return buildMonthGrid(this.state.viewMonth, weekStart === 'monday', showWeekends);
    }

    /** Publish the visible window so bindings can fetch only what's shown. */
    private syncOutput(): void {
        const g = this.grid();
        const sig = `${this.props.props.view}|${g.visibleStart}|${g.visibleEnd}`;
        if (sig === this.lastOutputSig) {
            return;
        }
        this.lastOutputSig = sig;
        const w = this.props.store.props;
        w.write('output.currentView', this.props.props.view);
        w.write('output.visibleStart', g.visibleStart);
        w.write('output.visibleEnd', g.visibleEnd);
    }

    private prevMonth = (): void => {
        this.setState({ viewMonth: addMonths(this.state.viewMonth, -1) });
    };

    private nextMonth = (): void => {
        this.setState({ viewMonth: addMonths(this.state.viewMonth, 1) });
    };

    private goToday = (): void => {
        this.setState({ viewMonth: startOfMonth(today()) });
    };

    private onEventClick = (ev: CalEvent, e: React.MouseEvent): void => {
        e.stopPropagation();  // don't also fire the day click
        this.fireEvent('onEventClick', {
            id: ev.id || '',
            title: ev.title || '',
            start: ev.start || '',
            end: ev.end || '',
            allDay: !!ev.allDay
        });
    };

    private onDayClick = (iso: string): void => {
        this.fireEvent('onDateClick', { date: iso });
    };

    private renderToolbar(): React.ReactNode {
        return (
            <div className="cal-toolbar">
                <div className="cal-title">{monthLabel(this.state.viewMonth, this.props.props.locale)}</div>
                <div className="cal-nav">
                    <button type="button" className="cal-nav-btn" onClick={this.prevMonth} aria-label="Previous month">‹</button>
                    <button type="button" className="cal-today" onClick={this.goToday}>Today</button>
                    <button type="button" className="cal-nav-btn" onClick={this.nextMonth} aria-label="Next month">›</button>
                </div>
            </div>
        );
    }

    private renderDay(cell: DayCell, dayEvents: CalEvent[]): React.ReactNode {
        const { shown, more } = splitForDay(dayEvents, this.props.props.maxEventsPerDay);
        const cls = ['cal-day'];
        if (!cell.inMonth) {
            cls.push('cal-day--other');
        }
        if (cell.isToday) {
            cls.push('cal-day--today');
        }
        if (cell.isWeekend) {
            cls.push('cal-day--weekend');
        }
        return (
            <div className={cls.join(' ')} key={cell.iso} onClick={() => this.onDayClick(cell.iso)}>
                <div className="cal-daynum">{cell.date.getDate()}</div>
                <div className="cal-events">
                    {shown.map((ev, i) => (
                        <button
                            type="button"
                            className="cal-event"
                            key={ev.id || i}
                            title={ev.title}
                            style={ev.color ? { background: ev.color, borderColor: ev.color } : undefined}
                            onClick={(e) => this.onEventClick(ev, e)}
                        >
                            {ev.title}
                        </button>
                    ))}
                    {more > 0 && <div className="cal-more">+{more} more</div>}
                </div>
            </div>
        );
    }

    render(): React.ReactNode {
        const { showToolbar, locale, events } = this.props.props;
        const g = this.grid();
        const byDay = groupEventsByDay(events || []);
        const cols = g.weeks[0].length;
        const wdFmt = intlFormat(locale, { weekday: 'short' });
        return (
            <div {...this.props.emit({ classes: ['mustry-calendar'] })}>
                {showToolbar && this.renderToolbar()}
                <div className="cal-body" style={{ ['--cal-cols' as keyof React.CSSProperties]: cols } as React.CSSProperties}>
                    <div className="cal-weekdays">
                        {g.weeks[0].map((c) => (
                            <div className="cal-weekday" key={c.iso}>{wdFmt.format(c.date)}</div>
                        ))}
                    </div>
                    <div className="cal-weeks">
                        {g.weeks.map((week, wi) => (
                            <div className="cal-week" key={wi}>
                                {week.map((cell) => this.renderDay(cell, byDay[cell.iso] || []))}
                            </div>
                        ))}
                    </div>
                </div>
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
            view: tree.readString('config.view', 'month'),
            showToolbar: tree.readBoolean('config.showToolbar', true),
            weekStart: tree.readString('config.weekStart', 'monday') as WeekStart,
            locale: tree.readString('config.locale', ''),
            showWeekends: tree.readBoolean('config.showWeekends', true),
            maxEventsPerDay: tree.readNumber('config.maxEventsPerDay', 3),
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
