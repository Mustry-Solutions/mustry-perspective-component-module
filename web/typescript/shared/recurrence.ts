// Recurrence (rrule) expansion, shared by every component that renders recurring
// items (calendar events, timeline bars, …). Pure and framework-free; operates on
// any item shape that carries id/start/end/rrule and preserves the rest verbatim.
import { addDays, daysBetween, fmtDate, instantToZonedIso, parseDate, toEpochMs } from './dateUtils';

export interface RRule {
    freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;     // every N units (default 1)
    count?: number;        // max occurrences in the series
    until?: string;        // ISO 'YYYY-MM-DD', inclusive
    byweekday?: number[];  // weekly only: 0=Sun .. 6=Sat
    wkst?: number;         // weekly only: day a week starts on, 0=Sun .. 6=Sat (default 1 = Monday, as RFC 5545)
    exdate?: string[];     // 'YYYY-MM-DD' occurrence dates to skip (deleted / overridden)
}

/** Set by expandEvents on every occurrence it generates. Code tells an occurrence
 *  from a plain event by these fields, never by parsing its id: a plain event's id
 *  may itself contain "::" (#143). Internal only: the onChange / onEventClick
 *  payloads are built field by field and never carry them. */
export interface OccurrenceTag {
    __seriesId?: string;   // id of the series the occurrence was expanded from
    __occDate?: string;    // its start date 'YYYY-MM-DD' (the series' EXDATE key)
}

/** The series context of an expanded occurrence, or null for any other item. */
export function occurrenceOf(item: OccurrenceTag): { seriesId: string; occurrenceDate: string } | null {
    return typeof item.__seriesId === 'string' && typeof item.__occDate === 'string'
        ? { seriesId: item.__seriesId, occurrenceDate: item.__occDate }
        : null;
}

/** What expansion needs from an item; everything else is carried through untouched. */
export interface RecurringItem extends OccurrenceTag {
    id: string;
    start: string;   // ISO 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss'
    end?: string;
    rrule?: RRule;
}

const MAX_OCC = 1000;

/** The rule's week start (0=Sun .. 6=Sat); anything missing or invalid is RFC 5545's Monday. */
function weekStartOf(r: RRule): number {
    const w = r.wkst;
    return typeof w === 'number' && Number.isInteger(w) && w >= 0 && w <= 6 ? w : 1;
}

/** Occurrence start dates of a recurring series within [winStart, winEnd).
 *
 *  An UNBOUNDED series (no `count`) is fast-forwarded past whole intervals that fall
 *  before `winStart`, so cost — and the MAX_OCC safety cap — scale with the window size,
 *  not with how far the window is from the base. Without this, a never-ending daily event
 *  would vanish once viewed more than MAX_OCC days (~2.7y) after its start. Count-bounded
 *  series must be enumerated from the base (their `count` is the real bound), so they are
 *  left as-is. The starting index is biased low; the `< base` guard here and the
 *  overlap check in expandOne drop any extras. */
function occurrenceStartDates(base: Date, r: RRule, winStart: Date, winEnd: Date): Date[] {
    const interval = Math.max(1, r.interval || 1);
    const until = r.until ? parseDate(r.until) : null;
    const hasCount = !!(r.count && r.count > 0);
    const limit = hasCount ? (r.count as number) : MAX_OCC;
    const dates: Date[] = [];
    const pastUntil = (d: Date) => until !== null && d.getTime() > until.getTime();
    const skipDays = Math.max(0, daysBetween(base, winStart));

    if (r.freq === 'weekly' && r.byweekday && r.byweekday.length) {
        // Weeks are bucketed from the rule's week start (RFC 5545 WKST, default Monday),
        // so e.g. a biweekly Sat+Sun series keeps each weekend's Sat and Sun together.
        // byweekday becomes day offsets from that start, in chronological order.
        const wkst = weekStartOf(r);
        const offsets = r.byweekday.map((wd) => (((wd - wkst) % 7) + 7) % 7).sort((a, b) => a - b);
        const weekRef = addDays(base, -((base.getDay() - wkst + 7) % 7)); // start of the base's week
        const k0 = hasCount ? 0 : Math.max(0, Math.floor(skipDays / (7 * interval)) - 1);
        for (let k = k0; dates.length < limit && k < k0 + MAX_OCC; k++) {
            const weekBase = addDays(weekRef, k * interval * 7);
            if (weekBase.getTime() >= winEnd.getTime() || (until && weekBase.getTime() > until.getTime())) {
                break;
            }
            for (const off of offsets) {
                const d = addDays(weekBase, off);
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

    let n0 = 0;
    if (!hasCount) {
        if (r.freq === 'daily') {
            n0 = Math.floor(skipDays / interval) - 1;
        } else if (r.freq === 'weekly') {
            n0 = Math.floor(skipDays / (7 * interval)) - 1;
        } else if (r.freq === 'monthly') {
            const md = (winStart.getFullYear() - base.getFullYear()) * 12 + (winStart.getMonth() - base.getMonth());
            n0 = Math.floor(md / interval) - 1;
        } else { // yearly
            n0 = Math.floor((winStart.getFullYear() - base.getFullYear()) / interval) - 1;
        }
        n0 = Math.max(0, n0);
    }

    for (let n = n0; dates.length < limit && n < n0 + MAX_OCC; n++) {
        let d: Date;
        if (r.freq === 'daily') {
            d = addDays(base, n * interval);
        } else if (r.freq === 'weekly') {
            d = addDays(base, n * interval * 7);
        } else if (r.freq === 'yearly') {
            d = new Date(base.getFullYear() + n * interval, base.getMonth(), base.getDate());
            if (d.getDate() !== base.getDate()) {
                continue; // skipped a non-existent date (e.g. Feb 29 in a common year)
            }
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

function expandOne<T extends RecurringItem>(ev: T, winStart: Date, winEnd: Date, timezone: string): T[] {
    // A series recurs by ZONE-LOCAL wall clock. An absolute base instant (offset /
    // Z / epoch) is normalised to the zone's naive wall time FIRST, so occurrences
    // don't inherit the base's UTC offset glued onto new dates — each occurrence
    // re-resolves its own offset downstream (DST-correct), and the base's wall
    // DATE is read in the display zone, not the offset's. Naive and date-only
    // starts pass through instantToZonedIso unchanged.
    const startWall = instantToZonedIso(ev.start, timezone).slice(0, 19);
    const endWall = ev.end ? instantToZonedIso(ev.end, timezone).slice(0, 19) : undefined;
    const base = parseDate(startWall);
    if (!base || !ev.rrule) {
        return [ev];
    }
    const startTime = startWall.length > 10 ? startWall.slice(10) : '';
    const baseEnd = endWall ? parseDate(endWall) : null;
    const endOffsetDays = baseEnd ? daysBetween(base, baseEnd) : 0;
    const endTime = endWall && endWall.length > 10 ? endWall.slice(10) : '';
    const exdate = new Set(ev.rrule.exdate || []);   // dates removed/overridden (EXDATE)
    const out: T[] = [];
    // An occurrence that starts before the window can still run into it (a 22:00-06:00
    // night shift, a Sat-Mon weekend block), so generate from one series duration (+1
    // day of slack) earlier and keep what OVERLAPS the window, as for a plain event.
    const genStart = addDays(winStart, -(Math.max(0, endOffsetDays) + 1));
    for (const d of occurrenceStartDates(base, ev.rrule, genStart, winEnd)) {
        const occStart = fmtDate(d) + startTime;
        const occEnd = endWall ? fmtDate(addDays(d, endOffsetDays)) + endTime : undefined;
        // Both are naive wall strings, read in the same local frame as winStart.
        const startMs = toEpochMs(occStart, '') as number;
        const endMs = occEnd ? toEpochMs(occEnd, '') : null;
        if (startMs < winStart.getTime() && !(endMs !== null && endMs > winStart.getTime())) {
            continue; // over before the visible window
        }
        if (exdate.has(fmtDate(d))) {
            continue; // excluded occurrence (deleted, or replaced by a standalone override)
        }
        out.push({
            ...ev,
            id: `${ev.id}::${fmtDate(d)}`,
            start: occStart,
            end: occEnd,
            rrule: undefined,
            __seriesId: ev.id,
            __occDate: fmtDate(d)
        });
    }
    return out;
}

/** Expand recurring items into the concrete occurrences that overlap [winStart, winEnd),
 *  including one that starts before winStart but ends after it. `timezone` is the
 *  display zone occurrences recur in ('' = browser-local); non-recurring items pass
 *  through verbatim, whatever their format. */
export function expandEvents<T extends RecurringItem>(events: T[], winStart: Date, winEnd: Date, timezone = ''): T[] {
    const out: T[] = [];
    for (const ev of events) {
        if (!ev || !ev.start) {
            continue;
        }
        if (ev.rrule && ev.rrule.freq) {
            for (const occ of expandOne(ev, winStart, winEnd, timezone)) {
                out.push(occ);
            }
        } else {
            out.push(ev);
        }
    }
    return out;
}
