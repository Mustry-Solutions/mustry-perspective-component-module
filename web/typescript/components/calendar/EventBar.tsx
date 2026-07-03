// One event bar — a column-span segment on a lane row. Shared by the month week-rows
// and the week/day all-day strip. `colOffset` shifts for a leading gutter column.
import * as React from 'react';
import { CalEvent, WeekSeg, hhmm, timeMinutes } from '../calendarLogic';
import { Category } from './types';
import { EventIcon, resolveColor, statusClass } from '../../shared/eventStyle';

interface EventBarProps {
    seg: WeekSeg;
    colOffset: number;
    categories: Category[];
    draggingId?: string;   // id of the bar being month-dragged — dims all its segments
    enterClass: (id: string) => string;
    hoverProps: (ev: CalEvent) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };
    onEventClick: (ev: CalEvent, e: React.MouseEvent) => void;
    // Month drag: when set, pointerdown starts a move gesture and the gesture's commit
    // decides between a click and a move (so no separate onClick fires).
    onStartMove?: (ev: CalEvent, e: React.PointerEvent) => void;
}

export function EventBar({ seg, colOffset, categories, draggingId, enterClass, hoverProps, onEventClick, onStartMove }: EventBarProps): React.ReactElement {
    const ev = seg.event;
    const tm = !ev.allDay && seg.startCol === seg.endCol ? timeMinutes(ev.start) : null;
    const cls = ['cal-mbar'];
    if (seg.continuesLeft) { cls.push('cal-mbar--cont-left'); }
    if (seg.continuesRight) { cls.push('cal-mbar--cont-right'); }
    if (onStartMove) { cls.push('cal-mbar--draggable'); }
    if (draggingId && ev.id === draggingId) { cls.push('cal-mbar--dragging'); }
    const color = resolveColor(categories, ev);
    return (
        <button
            type="button" title={ev.title}
            className={cls.join(' ') + statusClass(ev) + enterClass(ev.id || '')}
            style={{
                gridColumn: `${seg.startCol + colOffset} / ${seg.endCol + colOffset + 1}`,
                gridRow: seg.lane + 1,
                ...(color ? { ['--ev' as string]: color } : {})
            } as React.CSSProperties}
            onPointerDown={onStartMove ? (e) => onStartMove(ev, e) : undefined}
            onClick={(e) => { e.stopPropagation(); if (!onStartMove) { onEventClick(ev, e); } }}
            {...hoverProps(ev)}
        >
            <EventIcon ev={ev} categories={categories} />
            {tm !== null && <span className="cal-mbar-time">{hhmm(tm)}</span>}
            <span className="cal-mbar-title">{ev.title}</span>
        </button>
    );
}
