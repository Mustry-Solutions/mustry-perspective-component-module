// Pure, framework-free logic for the Calendar component. Month-grid construction
// and event placement live here so they can be unit-tested without rendering.
// (Later milestones add time-grid overlap packing and recurrence expansion here.)

import {
    addDays, fmtDate, firstCellOffset, parseDate, sameDay, startOfMonth, today
} from './dateUtils';

export interface CalEvent {
    id: string;
    title: string;
    start: string;   // ISO 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss'
    end?: string;
    allDay?: boolean;
    color?: string;
}

export interface DayCell {
    iso: string;       // 'YYYY-MM-DD'
    date: Date;        // local midnight
    inMonth: boolean;  // belongs to the displayed month (vs. spill-over)
    isToday: boolean;
    isWeekend: boolean;
}

export interface MonthGrid {
    weeks: DayCell[][];
    visibleStart: string;  // first cell, ISO
    visibleEnd: string;    // one past the last cell, ISO (half-open)
}

const WEEKS = 6; // fixed height so the grid doesn't jump between months

/** Build a 6-week month grid starting on the configured week-start day. */
export function buildMonthGrid(
    viewMonth: Date, mondayFirst: boolean, showWeekends: boolean, todayDate: Date = today()
): MonthGrid {
    const monthStart = startOfMonth(viewMonth);
    const gridStart = addDays(monthStart, -firstCellOffset(monthStart, mondayFirst));
    const weeks: DayCell[][] = [];
    for (let w = 0; w < WEEKS; w++) {
        const row: DayCell[] = [];
        for (let d = 0; d < 7; d++) {
            const date = addDays(gridStart, w * 7 + d);
            const dow = date.getDay();
            const isWeekend = dow === 0 || dow === 6;
            if (!showWeekends && isWeekend) {
                continue;
            }
            row.push({
                iso: fmtDate(date),
                date,
                inMonth: date.getMonth() === monthStart.getMonth()
                    && date.getFullYear() === monthStart.getFullYear(),
                isToday: sameDay(date, todayDate),
                isWeekend
            });
        }
        weeks.push(row);
    }
    return {
        weeks,
        visibleStart: fmtDate(gridStart),
        visibleEnd: fmtDate(addDays(gridStart, WEEKS * 7))
    };
}

/** The ISO day(s) an event occupies (all-day multi-day uses an exclusive end). */
export function eventDays(ev: CalEvent): string[] {
    const start = parseDate(ev.start);
    if (!start) {
        return [];
    }
    if (ev.allDay && ev.end) {
        const end = parseDate(ev.end);
        if (end && end.getTime() > start.getTime()) {
            const days: string[] = [];
            for (let d = start; d.getTime() < end.getTime(); d = addDays(d, 1)) {
                days.push(fmtDate(d));
            }
            return days;
        }
    }
    return [fmtDate(start)];
}

/** Group events by ISO day; each day's list sorted by start, then title. */
export function groupEventsByDay(events: CalEvent[]): { [iso: string]: CalEvent[] } {
    const map: { [iso: string]: CalEvent[] } = {};
    for (const ev of events) {
        if (!ev || !ev.start) {
            continue;
        }
        for (const iso of eventDays(ev)) {
            (map[iso] || (map[iso] = [])).push(ev);
        }
    }
    for (const iso of Object.keys(map)) {
        map[iso].sort((a, b) =>
            a.start < b.start ? -1
                : a.start > b.start ? 1
                    : (a.title || '').localeCompare(b.title || ''));
    }
    return map;
}

/** Split a day's events into the chips to show and the hidden overflow count. */
export function splitForDay(dayEvents: CalEvent[], maxPerDay: number): { shown: CalEvent[]; more: number } {
    if (!dayEvents || dayEvents.length === 0) {
        return { shown: [], more: 0 };
    }
    if (maxPerDay <= 0 || dayEvents.length <= maxPerDay) {
        return { shown: dayEvents, more: 0 };
    }
    // Reserve one slot for the "+N more" line.
    const shown = dayEvents.slice(0, maxPerDay - 1);
    return { shown, more: dayEvents.length - shown.length };
}
