// Pure, framework-free logic for the Calendar component: event placement and
// time-grid packing, unit-tested without rendering. Recurrence expansion and
// month-grid construction live in the shared layer.

import { csvCell } from '../../shared/csv';
import {
    addDays, fmtDate, parseDate, startOfWeek, sameDay, pad2, today, toEpochMs
} from '../../shared/dateUtils';
import { RRule } from '../../shared/recurrence';
import { DayCell, MonthGrid, buildMonthGrid } from '../../shared/monthGrid';

export type { RRule, DayCell, MonthGrid };
export { buildMonthGrid };

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

/** Whether an event is an expanded occurrence of a recurring series (id "base::date"). */
export function isOccurrence(ev: CalEvent): boolean {
    return (ev.id || '').indexOf('::') >= 0;
}

/** Serialise events to CSV text (one row per event, CRLF line endings). Recurring
 *  series definitions ride along as-is (not expanded into occurrences); a series
 *  bound via both sources exports once (dedupe by id). */
export function eventsToCsv(events: CalEvent[], recurringEvents: CalEvent[] = []): string {
    const cols = ['id', 'title', 'start', 'end', 'allDay', 'category', 'status', 'color', 'description', 'rrule'];
    const rows = [cols.join(',')];
    const seen = new Set<string>();
    for (const ev of [...(events || []), ...(recurringEvents || [])]) {
        if (!ev) {
            continue;
        }
        if (ev.id) {
            if (seen.has(ev.id)) {
                continue;
            }
            seen.add(ev.id);
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

// --- follow-now (live) mode ---------------------------------------------------

export const FOLLOW_DEFAULT_TICK_MS = 60000;

/** Follow-now tick interval, ms: config.refreshSeconds when > 0 (floored at 1s so
 *  a fractional/zero setting can't spin), else one minute. (Same rule as the
 *  timeline's followTickMs, so the two live modes read alike.) */
export function followTickMs(refreshSeconds: number): number {
    return refreshSeconds > 0 ? Math.max(1, refreshSeconds) * 1000 : FOLLOW_DEFAULT_TICK_MS;
}

/** A user action that might take over from follow-now. */
export type CalendarNav = 'page' | 'miniPick' | 'today' | 'view' | 'legend' | 'edit';

/** Whether a user action disarms follow-now: explicit navigation away (paging,
 *  a mini-nav day pick) does; Today, view switches, legend toggles and event
 *  edits keep it armed. (Mirrors the timeline's followDisarms.) */
export function followDisarms(nav: CalendarNav): boolean {
    return nav === 'page' || nav === 'miniPick';
}

/** Whether a follow-now tick actually has to re-anchor: only when the cursor's
 *  day differs from today-in-zone (the Today button's target). The no-op guard —
 *  an armed-but-current calendar must not re-render or re-write its outputs. */
/** Whether a follow tick should re-centre the week/day grid on "now" (with
 * scrollToNow on): only when the indicator drifted out of the visible band, so
 * armed mode doesn't fight the user's scrolling while the line is on screen. */
export function followScrollStale(scrollTop: number, clientHeight: number, nowY: number): boolean {
    return nowY < scrollTop + 24 || nowY > scrollTop + clientHeight - 24;
}

export function followCursorStale(cursor: Date, todayZone: Date): boolean {
    return fmtDate(cursor) !== fmtDate(todayZone);
}

// --- legend category filter (state.hiddenCategories, two-way) ------------------

/** The next hidden-category array after a legend click. The `state.hiddenCategories`
 *  prop is the source of truth: the component writes this result back and the
 *  re-render applies the filter (no internal copy). */
export function toggleHiddenCategory(hidden: ReadonlyArray<string>, id: string): string[] {
    return hidden.indexOf(id) >= 0 ? hidden.filter((c) => c !== id) : [...hidden, id];
}

/** Apply the legend filter: drop events whose category is hidden. A pre-set (or
 *  bound) hidden array therefore filters from first render. */
export function filterHiddenCategories(events: CalEvent[], hidden: ReadonlyArray<string>): CalEvent[] {
    if (!hidden || hidden.length === 0) {
        return events;
    }
    const h = new Set(hidden);
    return events.filter((ev) => !(ev.category && h.has(ev.category)));
}

// --- epoch-ms window outputs --------------------------------------------------

/** The visible ISO date window as UTC epoch-ms instants of the zone-local
 *  midnights those dates denote (half-open [startMs, endMs)) — for binding
 *  epoch/t_stamp queries directly. DST-correct: each midnight is resolved in
 *  `timeZone` (browser-local when empty), not derived by day arithmetic. */
export function visibleRangeMs(startIso: string, endIso: string, timeZone: string): { startMs: number; endMs: number } {
    return {
        startMs: toEpochMs(startIso, timeZone) ?? 0,
        endMs: toEpochMs(endIso, timeZone) ?? 0
    };
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

/** Format minutes-from-midnight as zero-padded "HH:mm". */
export function hhmm(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
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

