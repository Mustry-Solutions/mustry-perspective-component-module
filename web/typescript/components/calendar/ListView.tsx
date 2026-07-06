// Agenda list of the visible window's events, grouped by day.
import * as React from 'react';
import { intlFormat } from '../../shared/dateUtils';
import { CalEvent, DayCol, groupEventsByDay, isOccurrence, timeMinutes } from '../calendarLogic';
import { CalLabels, Category } from './types';
import { EventIcon, resolveColor, statusClass } from '../../shared/eventStyle';

interface ListViewProps {
    cols: DayCol[];
    events: CalEvent[];
    locale: string;
    categories: Category[];
    emptyMessage: string;
    labels: CalLabels;
    enterClass: (id: string) => string;
    hoverProps: (ev: CalEvent) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };
    onEventClick: (ev: CalEvent, e: React.MouseEvent) => void;
}

export function ListView({ cols, events, locale, categories, emptyMessage, labels, enterClass, hoverProps, onEventClick }: ListViewProps): React.ReactElement {
    const byDay = groupEventsByDay(events);
    const dayFmt = intlFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    const timeFmt = intlFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const rows = cols
        .map((c) => ({ c, evs: byDay[c.iso] || [] }))
        .filter((r) => r.evs.length > 0);
    return (
        <div className="cal-list cal-anim-view" key="list">
            {rows.length === 0 && <div className="cal-list-empty">{emptyMessage || labels.noEvents}</div>}
            {rows.map(({ c, evs }) => (
                <div className="cal-list-day" key={c.iso}>
                    <div className={`cal-list-date${c.isToday ? ' cal-list-date--today' : ''}`}>{dayFmt.format(c.date)}</div>
                    {evs.map((ev, i) => {
                        const tm = timeMinutes(ev.start);
                        return (
                            <button
                                type="button" className={`cal-list-event${statusClass(ev)}${enterClass(ev.id || '')}`} key={ev.id || i}
                                onClick={(e) => onEventClick(ev, e)}
                                {...hoverProps(ev)}
                            >
                                <span className="cal-list-dot" style={{ background: resolveColor(categories, ev) || 'var(--cal-accent)' }} />
                                <span className="cal-list-time">
                                    {tm === null ? labels.allDayTime : timeFmt.format(new Date(2000, 0, 1, Math.floor(tm / 60), tm % 60))}
                                </span>
                                {isOccurrence(ev) && (
                                    <span className="cal-ev-recur" aria-hidden="true">↻</span>
                                )}
                                <EventIcon ev={ev} categories={categories} />
                                <span className="cal-list-title">{ev.title}</span>
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
