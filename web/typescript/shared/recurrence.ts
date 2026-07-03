// Recurrence (rrule) expansion, shared by every component that renders recurring
// items (calendar events, timeline bars, …). Pure and framework-free; operates on
// any item shape that carries id/start/end/rrule and preserves the rest verbatim.
import { addDays, daysBetween, fmtDate, parseDate } from './dateUtils';

export interface RRule {
    freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;     // every N units (default 1)
    count?: number;        // max occurrences in the series
    until?: string;        // ISO 'YYYY-MM-DD', inclusive
    byweekday?: number[];  // weekly only: 0=Sun .. 6=Sat
    exdate?: string[];     // 'YYYY-MM-DD' occurrence dates to skip (deleted / overridden)
}

/** What expansion needs from an item; everything else is carried through untouched. */
export interface RecurringItem {
    id: string;
    start: string;   // ISO 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss'
    end?: string;
    rrule?: RRule;
}

const MAX_OCC = 1000;

/** Occurrence start dates of a recurring series within [winStart, winEnd).
 *
 *  An UNBOUNDED series (no `count`) is fast-forwarded past whole intervals that fall
 *  before `winStart`, so cost — and the MAX_OCC safety cap — scale with the window size,
 *  not with how far the window is from the base. Without this, a never-ending daily event
 *  would vanish once viewed more than MAX_OCC days (~2.7y) after its start. Count-bounded
 *  series must be enumerated from the base (their `count` is the real bound), so they are
 *  left as-is. The starting index is biased low; the `< base` / `< winStart` guards drop
 *  any extras. */
function occurrenceStartDates(base: Date, r: RRule, winStart: Date, winEnd: Date): Date[] {
    const interval = Math.max(1, r.interval || 1);
    const until = r.until ? parseDate(r.until) : null;
    const hasCount = !!(r.count && r.count > 0);
    const limit = hasCount ? (r.count as number) : MAX_OCC;
    const dates: Date[] = [];
    const pastUntil = (d: Date) => until !== null && d.getTime() > until.getTime();
    const skipDays = Math.max(0, daysBetween(base, winStart));

    if (r.freq === 'weekly' && r.byweekday && r.byweekday.length) {
        const wds = r.byweekday.slice().sort((a, b) => a - b);
        const weekRef = addDays(base, -base.getDay()); // Sunday of the base's week
        const k0 = hasCount ? 0 : Math.max(0, Math.floor(skipDays / (7 * interval)) - 1);
        for (let k = k0; dates.length < limit && k < k0 + MAX_OCC; k++) {
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

function expandOne<T extends RecurringItem>(ev: T, winStart: Date, winEnd: Date): T[] {
    const base = parseDate(ev.start);
    if (!base || !ev.rrule) {
        return [ev];
    }
    const startTime = ev.start.length > 10 ? ev.start.slice(10) : '';
    const baseEnd = ev.end ? parseDate(ev.end) : null;
    const endOffsetDays = baseEnd ? daysBetween(base, baseEnd) : 0;
    const endTime = ev.end && ev.end.length > 10 ? ev.end.slice(10) : '';
    const exdate = new Set(ev.rrule.exdate || []);   // dates removed/overridden (EXDATE)
    const out: T[] = [];
    for (const d of occurrenceStartDates(base, ev.rrule, winStart, winEnd)) {
        if (d.getTime() < winStart.getTime()) {
            continue; // before the visible window
        }
        if (exdate.has(fmtDate(d))) {
            continue; // excluded occurrence (deleted, or replaced by a standalone override)
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

/** Expand recurring items into concrete occurrences within [winStart, winEnd). */
export function expandEvents<T extends RecurringItem>(events: T[], winStart: Date, winEnd: Date): T[] {
    const out: T[] = [];
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
