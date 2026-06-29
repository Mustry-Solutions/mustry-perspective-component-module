// Pure, framework-free logic for the Calendar component. Month-grid construction
// and event placement live here so they can be unit-tested without rendering.
// (Later milestones add time-grid overlap packing and recurrence expansion here.)

import {
    addDays, daysBetween, fmtDate, firstCellOffset, pad2, parseDate, sameDay,
    startOfMonth, startOfWeek, today
} from './dateUtils';

export interface RRule {
    freq: 'daily' | 'weekly' | 'monthly';
    interval?: number;     // every N units (default 1)
    count?: number;        // max occurrences in the series
    until?: string;        // ISO 'YYYY-MM-DD', inclusive
    byweekday?: number[];  // weekly only: 0=Sun .. 6=Sat
}

export interface CalEvent {
    id: string;
    title: string;
    start: string;   // ISO 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss'
    end?: string;
    allDay?: boolean;
    color?: string;
    category?: string;     // category id; supplies the colour unless `color` overrides it
    status?: string;       // 'tentative' | 'cancelled' | 'done' — anything else renders normal
    description?: string;  // shown in the hover detail popover
    display?: string;      // 'background' renders a translucent band behind events
    rrule?: RRule;         // when set, the event recurs (expanded per visible window)
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

/** Quote a CSV cell only when it contains a comma, quote, or newline (RFC 4180). */
function csvCell(v: string): string {
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Serialise events to CSV text (one row per event, CRLF line endings). */
export function eventsToCsv(events: CalEvent[]): string {
    const cols = ['id', 'title', 'start', 'end', 'allDay', 'category', 'status', 'color', 'description', 'rrule'];
    const rows = [cols.join(',')];
    for (const ev of events || []) {
        if (!ev) {
            continue;
        }
        rows.push([
            ev.id || '',
            ev.title || '',
            ev.start || '',
            ev.end || '',
            ev.allDay ? 'true' : 'false',
            ev.category || '',
            ev.status || '',
            ev.color || '',
            ev.description || '',
            ev.rrule ? JSON.stringify(ev.rrule) : ''
        ].map((c) => csvCell(String(c))).join(','));
    }
    return rows.join('\r\n');
}

/** A horizontal event bar within one month week-row. */
export interface WeekSeg {
    event: CalEvent;
    startCol: number;       // first column (0-based) the bar occupies in the week
    endCol: number;         // last column (inclusive)
    lane: number;           // row within the cell's event area
    continuesLeft: boolean;  // event started before this week
    continuesRight: boolean; // event continues after this week
}

/**
 * Lay out a month week-row's events as horizontal bars: each event becomes a
 * column-span segment, packed into lanes so nothing overlaps. Multi-day all-day
 * events span columns; everything else is a single column. Bars are ordered with
 * the longest spans on top, then by start column / all-day / time.
 */
export function layoutWeekSegments(weekIsos: string[], events: CalEvent[]): WeekSeg[] {
    const cols = weekIsos.length;
    if (cols === 0) {
        return [];
    }
    const first = weekIsos[0];
    const last = weekIsos[cols - 1];
    const segs: WeekSeg[] = [];
    for (const ev of events) {
        if (!ev || !ev.start || ev.display === 'background') {
            continue;
        }
        const days = eventDays(ev);
        if (!days.length) {
            continue;
        }
        const evStart = days[0];
        const evEnd = days[days.length - 1];
        if (evEnd < first || evStart > last) {
            continue; // not in this week
        }
        let startCol = -1;
        let endCol = -1;
        for (let i = 0; i < cols; i++) {
            if (weekIsos[i] >= evStart && weekIsos[i] <= evEnd) {
                if (startCol < 0) { startCol = i; }
                endCol = i;
            }
        }
        if (startCol < 0) {
            continue; // covers only hidden (weekend) days in this week
        }
        segs.push({
            event: ev, startCol, endCol, lane: 0,
            continuesLeft: evStart < weekIsos[startCol],
            continuesRight: evEnd > weekIsos[endCol]
        });
    }
    segs.sort((a, b) => {
        const sa = a.endCol - a.startCol;
        const sb = b.endCol - b.startCol;
        if (sa !== sb) { return sb - sa; }                       // longer spans on top
        if (a.startCol !== b.startCol) { return a.startCol - b.startCol; }
        const aAll = a.event.allDay ? 0 : 1;
        const bAll = b.event.allDay ? 0 : 1;
        if (aAll !== bAll) { return aAll - bAll; }               // all-day before timed
        return (a.event.start || '').localeCompare(b.event.start || '');
    });
    const laneEnd: number[] = [];   // laneEnd[l] = last column occupied in lane l
    for (const s of segs) {
        let placed = false;
        for (let l = 0; l < laneEnd.length; l++) {
            if (laneEnd[l] < s.startCol) {
                s.lane = l;
                laneEnd[l] = s.endCol;
                placed = true;
                break;
            }
        }
        if (!placed) {
            s.lane = laneEnd.length;
            laneEnd.push(s.endCol);
        }
    }
    return segs;
}

/**
 * Given laid-out week segments and the number of lanes that fit a cell (`cap`),
 * return the bars to show plus a per-column "+N more" count. When anything
 * overflows, the last visible lane is reserved for the "+N more" indicator.
 */
export function clampWeekLanes(
    segs: WeekSeg[], cols: number, cap: number
): { visible: WeekSeg[]; more: number[]; lanesShown: number } {
    const more = new Array(cols).fill(0);
    const maxLane = segs.reduce((m, s) => Math.max(m, s.lane), -1);
    if (cap <= 0 || maxLane < cap) {
        return { visible: segs, more, lanesShown: maxLane + 1 };
    }
    const lanesShown = Math.max(0, cap - 1);   // reserve the last lane for "+N more"
    const visible: WeekSeg[] = [];
    for (const s of segs) {
        if (s.lane < lanesShown) {
            visible.push(s);
        } else {
            for (let c = s.startCol; c <= s.endCol; c++) {
                more[c]++;
            }
        }
    }
    return { visible, more, lanesShown };
}

// --- week / day time-grid ---------------------------------------------------

export interface DayCol {
    iso: string;
    date: Date;
    isToday: boolean;
    isWeekend: boolean;
}

/** The day columns of the week containing `cursor` (respecting week-start & weekends). */
export function weekDays(
    cursor: Date, mondayFirst: boolean, showWeekends: boolean, todayDate: Date = today()
): DayCol[] {
    const start = startOfWeek(cursor, mondayFirst);
    const cols: DayCol[] = [];
    for (let i = 0; i < 7; i++) {
        const date = addDays(start, i);
        const dow = date.getDay();
        const isWeekend = dow === 0 || dow === 6;
        if (!showWeekends && isWeekend) {
            continue;
        }
        cols.push({ iso: fmtDate(date), date, isToday: sameDay(date, todayDate), isWeekend });
    }
    return cols;
}

/** Minutes-from-midnight of an ISO datetime's time part, or null if it has none. */
export function timeMinutes(iso: string): number | null {
    const m = /T(\d{2}):(\d{2})/.exec(iso);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** An event is "timed" if it has a time-of-day and isn't flagged all-day. */
export function isTimed(ev: CalEvent): boolean {
    return !ev.allDay && timeMinutes(ev.start) !== null;
}

export interface TimedLayout {
    event: CalEvent;
    startMin: number;  // clamped to the visible window
    endMin: number;
    lane: number;      // 0-based column within its overlap cluster
    lanes: number;     // total columns in that cluster
    continuesUp?: boolean;    // event began on an earlier day (segment top is a continuation)
    continuesDown?: boolean;  // event continues onto a later day (segment bottom is a continuation)
}

/**
 * Lay out the timed events of one day on a vertical time grid: clamp to the visible
 * window, then pack overlapping events into side-by-side lanes. Events that
 * transitively overlap form a cluster; each gets a lane index and the cluster's lane
 * count, from which the renderer derives left/width.
 */
export function layoutDayEvents(
    events: CalEvent[], dayIso: string, winStart: number, winEnd: number, defaultDur: number
): TimedLayout[] {
    const items: TimedLayout[] = [];
    for (const ev of events) {
        if (!ev || !ev.start || ev.display === 'background' || !isTimed(ev)) {
            continue;
        }
        // Multi-day timed events render a clamped segment on each day they cross.
        const startDay = ev.start.slice(0, 10);
        const endDay = ev.end && ev.end.length >= 10 ? ev.end.slice(0, 10) : startDay;
        if (dayIso < startDay || dayIso > endDay) {
            continue; // not on this day
        }
        const isStart = dayIso === startDay;
        const isEnd = dayIso === endDay;
        const sMin = isStart ? (timeMinutes(ev.start) as number) : winStart;
        let eMin: number | null = isEnd ? (ev.end ? timeMinutes(ev.end) : null) : winEnd;
        if (eMin === null || eMin <= sMin) {
            if (isStart && isEnd) {
                eMin = sMin + defaultDur;   // single-day, no/invalid end -> default duration
            } else {
                continue;                   // e.g. ends at 00:00 on the end day -> nothing to show
            }
        }
        const top = Math.max(sMin, winStart);
        const bot = Math.min(eMin, winEnd);
        if (bot <= winStart || top >= winEnd) {
            continue; // entirely outside the visible window
        }
        items.push({
            event: ev, startMin: top, endMin: Math.max(bot, top + 1), lane: 0, lanes: 1,
            continuesUp: !isStart, continuesDown: !isEnd
        });
    }
    items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

    let i = 0;
    while (i < items.length) {
        // Grow a cluster of transitively-overlapping events.
        let j = i;
        let clusterEnd = items[i].endMin;
        while (j + 1 < items.length && items[j + 1].startMin < clusterEnd) {
            j++;
            clusterEnd = Math.max(clusterEnd, items[j].endMin);
        }
        // Greedy lane assignment within the cluster.
        const laneEnds: number[] = [];
        for (let k = i; k <= j; k++) {
            let placed = false;
            for (let l = 0; l < laneEnds.length; l++) {
                if (laneEnds[l] <= items[k].startMin) {
                    items[k].lane = l;
                    laneEnds[l] = items[k].endMin;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                items[k].lane = laneEnds.length;
                laneEnds.push(items[k].endMin);
            }
        }
        for (let k = i; k <= j; k++) {
            items[k].lanes = laneEnds.length;
        }
        i = j + 1;
    }
    return items;
}

// --- editing gesture math (pure) -------------------------------------------

/** Round minutes to the nearest `snap`. */
export function snapMinutes(min: number, snap: number): number {
    return Math.round(min / snap) * snap;
}

/** Convert a pixel offset within a day column into snapped, window-clamped minutes. */
export function minuteFromOffset(
    offsetY: number, slotPx: number, winStartMin: number, winEndMin: number, snap: number
): number {
    const m = winStartMin + (offsetY / slotPx) * 60;
    return Math.max(winStartMin, Math.min(winEndMin, snapMinutes(m, snap)));
}

/** Build an ISO 'YYYY-MM-DDTHH:mm:ss' from a day and minutes-from-midnight. */
export function isoDateTime(dayIso: string, min: number): string {
    return `${dayIso}T${pad2(Math.floor(min / 60))}:${pad2(min % 60)}:00`;
}

/** All-day (and date-only) events covering `dayIso`, sorted by title. */
export function allDayEventsForDay(events: CalEvent[], dayIso: string): CalEvent[] {
    return (events || [])
        .filter((ev) => ev && ev.start && ev.display !== 'background' && !isTimed(ev) && eventDays(ev).indexOf(dayIso) >= 0)
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

export interface BgBand {
    id: string;
    startMin: number;
    endMin: number;
    color?: string;
}

/** Timed background events on `dayIso` as clamped bands (no packing — full width). */
export function backgroundBandsForDay(events: CalEvent[], dayIso: string, winStart: number, winEnd: number): BgBand[] {
    const out: BgBand[] = [];
    for (const ev of events) {
        if (!ev || ev.display !== 'background' || !ev.start || !isTimed(ev) || ev.start.slice(0, 10) !== dayIso) {
            continue;
        }
        const sMin = timeMinutes(ev.start) as number;
        let eMin = ev.end && ev.end.slice(0, 10) === dayIso ? timeMinutes(ev.end) : winEnd;
        if (eMin === null || eMin <= sMin) {
            eMin = sMin + 60;
        }
        const top = Math.max(sMin, winStart);
        const bot = Math.min(eMin, winEnd);
        if (bot <= winStart || top >= winEnd) {
            continue;
        }
        out.push({ id: ev.id, startMin: top, endMin: Math.max(bot, top + 1), color: ev.color });
    }
    return out;
}

// --- recurrence expansion ---------------------------------------------------

const MAX_OCC = 1000;

/** Occurrence start dates of a recurring series, from its base up to `winEnd`. */
function occurrenceStartDates(base: Date, r: RRule, winEnd: Date): Date[] {
    const interval = Math.max(1, r.interval || 1);
    const until = r.until ? parseDate(r.until) : null;
    const limit = r.count && r.count > 0 ? r.count : MAX_OCC;
    const dates: Date[] = [];
    const pastUntil = (d: Date) => until !== null && d.getTime() > until.getTime();

    if (r.freq === 'weekly' && r.byweekday && r.byweekday.length) {
        const wds = r.byweekday.slice().sort((a, b) => a - b);
        const weekRef = addDays(base, -base.getDay()); // Sunday of the base's week
        for (let k = 0; dates.length < limit && k < MAX_OCC; k++) {
            const weekBase = addDays(weekRef, k * interval * 7);
            if (weekBase.getTime() >= winEnd.getTime() || (until && weekBase.getTime() > until.getTime())) {
                break;
            }
            for (const wd of wds) {
                const d = addDays(weekBase, wd);
                if (d.getTime() < base.getTime() || pastUntil(d) || d.getTime() >= winEnd.getTime()) {
                    continue;
                }
                if (dates.length < limit) {
                    dates.push(d);
                }
            }
        }
        return dates;
    }

    for (let n = 0; dates.length < limit && n < MAX_OCC; n++) {
        let d: Date;
        if (r.freq === 'daily') {
            d = addDays(base, n * interval);
        } else if (r.freq === 'weekly') {
            d = addDays(base, n * interval * 7);
        } else {
            d = new Date(base.getFullYear(), base.getMonth() + n * interval, base.getDate());
            if (d.getDate() !== base.getDate()) {
                continue; // skipped a short month (e.g. day 31)
            }
        }
        if (pastUntil(d) || d.getTime() >= winEnd.getTime()) {
            break;
        }
        dates.push(d);
    }
    return dates;
}

function expandOne(ev: CalEvent, winStart: Date, winEnd: Date): CalEvent[] {
    const base = parseDate(ev.start);
    if (!base || !ev.rrule) {
        return [ev];
    }
    const startTime = ev.start.length > 10 ? ev.start.slice(10) : '';
    const baseEnd = ev.end ? parseDate(ev.end) : null;
    const endOffsetDays = baseEnd ? daysBetween(base, baseEnd) : 0;
    const endTime = ev.end && ev.end.length > 10 ? ev.end.slice(10) : '';
    const out: CalEvent[] = [];
    for (const d of occurrenceStartDates(base, ev.rrule, winEnd)) {
        if (d.getTime() < winStart.getTime()) {
            continue; // before the visible window
        }
        out.push({
            ...ev,
            id: `${ev.id}::${fmtDate(d)}`,
            start: fmtDate(d) + startTime,
            end: ev.end ? fmtDate(addDays(d, endOffsetDays)) + endTime : undefined,
            rrule: undefined
        });
    }
    return out;
}

/** Expand recurring events into concrete occurrences within [winStart, winEnd). */
export function expandEvents(events: CalEvent[], winStart: Date, winEnd: Date): CalEvent[] {
    const out: CalEvent[] = [];
    for (const ev of events) {
        if (!ev || !ev.start) {
            continue;
        }
        if (ev.rrule && ev.rrule.freq) {
            for (const occ of expandOne(ev, winStart, winEnd)) {
                out.push(occ);
            }
        } else {
            out.push(ev);
        }
    }
    return out;
}
