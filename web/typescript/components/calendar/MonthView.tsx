// Month grid: day-cell background grid + an event-bar overlay per week row.
import * as React from 'react';
import { intlFormat } from '../dateUtils';
import { CalEvent, DayCell, MonthGrid, clampWeekLanes, layoutWeekSegments } from '../calendarLogic';
import { Category } from './types';
import { EventBar } from './EventBar';

interface MonthViewProps {
    grid: MonthGrid;
    events: CalEvent[];
    locale: string;
    monthCap: number;
    categories: Category[];
    weeksRef: React.RefObject<HTMLDivElement>;
    enterClass: (id: string) => string;
    hoverProps: (ev: CalEvent) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };
    onDayClick: (iso: string) => void;
    openDayPop: (iso: string, e: React.MouseEvent) => void;
    onEventClick: (ev: CalEvent, e: React.MouseEvent) => void;
}

export function MonthView(props: MonthViewProps): React.ReactElement {
    const { grid, events, locale, monthCap, categories, weeksRef, enterClass, hoverProps, onDayClick, openDayPop, onEventClick } = props;
    const wdFmt = intlFormat(locale, { weekday: 'short' });

    const dayCell = (cell: DayCell): React.ReactElement => {
        const cls = ['cal-day'];
        if (!cell.inMonth) { cls.push('cal-day--other'); }
        if (cell.isToday) { cls.push('cal-day--today'); }
        if (cell.isWeekend) { cls.push('cal-day--weekend'); }
        return (
            <div className={cls.join(' ')} key={cell.iso} onClick={() => onDayClick(cell.iso)}>
                <button type="button" className="cal-daynum" onClick={(e) => openDayPop(cell.iso, e)} title="Show this day's events">
                    {cell.date.getDate()}
                </button>
            </div>
        );
    };

    return (
        <div className="cal-body cal-anim-view" key="month" style={{ ['--cal-cols' as keyof React.CSSProperties]: grid.weeks[0].length } as React.CSSProperties}>
            <div className="cal-weekdays">
                {grid.weeks[0].map((c) => <div className="cal-weekday" key={c.iso}>{wdFmt.format(c.date)}</div>)}
            </div>
            <div className="cal-weeks" ref={weeksRef}>
                {grid.weeks.map((week, wi) => {
                    const weekIsos = week.map((c) => c.iso);
                    const segs = layoutWeekSegments(weekIsos, events);
                    const { visible, more } = clampWeekLanes(segs, week.length, monthCap);
                    const overflow = more.some((n) => n > 0);
                    const moreRow = Math.max(1, monthCap);   // reserved "+N more" row (1-based)
                    return (
                        <div className="cal-week" key={wi}>
                            {week.map(dayCell)}
                            <div className="cal-week-bars">
                                {visible.map((seg, i) => (
                                    <EventBar
                                        key={seg.event.id || `${i}`}
                                        seg={seg} colOffset={1} categories={categories}
                                        enterClass={enterClass} hoverProps={hoverProps} onEventClick={onEventClick}
                                    />
                                ))}
                                {overflow && more.map((n, col) => (n > 0 ? (
                                    <button
                                        type="button" key={`more-${col}`} className="cal-more cal-more--bar"
                                        style={{ gridColumn: `${col + 1} / ${col + 2}`, gridRow: moreRow }}
                                        onClick={(e) => openDayPop(weekIsos[col], e)}
                                    >+{n} more</button>
                                ) : null))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
