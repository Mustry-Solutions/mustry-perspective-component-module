// Month grid: day-cell background grid + an event-bar overlay per week row.
import * as React from 'react';
import { intlFormat } from '../../shared/dateUtils';
import { CalEvent, DayCell, MonthGrid, clampWeekLanes, layoutWeekSegments } from './calendarLogic';
import { CalLabels, Category } from './calendarTypes';
import { EventBar } from './EventBar';

interface MonthViewProps {
    grid: MonthGrid;
    events: CalEvent[];
    locale: string;
    monthCap: number;
    categories: Category[];
    labels: CalLabels;
    weeksRef: React.RefObject<HTMLDivElement>;
    editable: boolean;
    dragEventId: string;   // event id of an in-flight month drag ('' = none) — dims its bars
    dropDayIso: string;    // drop-target day cell of that drag ('' = none) — highlights the cell
    enterClass: (id: string) => string;
    hoverProps: (ev: CalEvent) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };
    onDayClick: (iso: string) => void;
    openDayPop: (iso: string, e: React.MouseEvent) => void;
    onEventClick: (ev: CalEvent, e: React.MouseEvent) => void;
    onStartMove: (ev: CalEvent, e: React.PointerEvent) => void;
}

export function MonthView(props: MonthViewProps): React.ReactElement {
    const {
        grid, events, locale, monthCap, categories, labels, weeksRef, editable, dragEventId, dropDayIso,
        enterClass, hoverProps, onDayClick, openDayPop, onEventClick, onStartMove
    } = props;
    const wdFmt = intlFormat(locale, { weekday: 'short' });

    const dayCell = (cell: DayCell): React.ReactElement => {
        const cls = ['mustry-cal-day'];
        if (!cell.inMonth) { cls.push('mustry-cal-day--other'); }
        if (cell.isToday) { cls.push('mustry-cal-day--today'); }
        if (cell.isWeekend) { cls.push('mustry-cal-day--weekend'); }
        if (cell.iso === dropDayIso) { cls.push('mustry-cal-day--drop'); }
        return (
            <div className={cls.join(' ')} key={cell.iso} data-day={cell.iso} onClick={() => onDayClick(cell.iso)}>
                <button type="button" className="mustry-cal-daynum" onClick={(e) => openDayPop(cell.iso, e)} title={labels.showDayEvents}>
                    {cell.date.getDate()}
                </button>
            </div>
        );
    };

    return (
        <div className="mustry-cal-body mustry-cal-anim-view" key="month" style={{ ['--cal-cols' as keyof React.CSSProperties]: grid.weeks[0].length } as React.CSSProperties}>
            <div className="mustry-cal-weekdays">
                {grid.weeks[0].map((c) => <div className="mustry-cal-weekday" key={c.iso}>{wdFmt.format(c.date)}</div>)}
            </div>
            <div className="mustry-cal-weeks" ref={weeksRef}>
                {grid.weeks.map((week, wi) => {
                    const weekIsos = week.map((c) => c.iso);
                    const segs = layoutWeekSegments(weekIsos, events);
                    const { visible, more } = clampWeekLanes(segs, week.length, monthCap);
                    const overflow = more.some((n) => n > 0);
                    const moreRow = Math.max(1, monthCap);   // reserved "+N more" row (1-based)
                    return (
                        <div className="mustry-cal-week" key={wi}>
                            {week.map(dayCell)}
                            <div className="mustry-cal-week-bars">
                                {visible.map((seg, i) => (
                                    <EventBar
                                        key={seg.event.id || `${i}`}
                                        seg={seg} colOffset={1} categories={categories}
                                        draggingId={dragEventId}
                                        enterClass={enterClass} hoverProps={hoverProps} onEventClick={onEventClick}
                                        onStartMove={editable ? onStartMove : undefined}
                                    />
                                ))}
                                {overflow && more.map((n, col) => (n > 0 ? (
                                    <button
                                        type="button" key={`more-${col}`} className="mustry-cal-more mustry-cal-more--bar"
                                        style={{ gridColumn: `${col + 1} / ${col + 2}`, gridRow: moreRow }}
                                        onClick={(e) => openDayPop(weekIsos[col], e)}
                                    >{labels.more.replace('{n}', String(n))}</button>
                                ) : null))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
