// Pure editing logic for the Schedule Manager's M1 milestone — no DOM,
// node-tested. The draft model, the paint/resize/remove operations on a day's
// availability, the pointer→minute mapping the gesture controller delegates
// to, and the draft→flat-bean serialization that onScheduleSave emits.

import {
    DAY_KEYS, DayKey, MINUTES_PER_DAY, ScheduleItem, TimeRange, dayRanges, formatTimeRanges,
    mergeRanges, parseTimeRanges
} from './scheduleLogic';

/** The editable slice of a schedule. Week A only; alternating stays read-only
 *  (the A/B bean layout is unverified — flipping it blind could corrupt saves). */
export interface ScheduleDraft {
    description: string;
    observeHolidays: boolean;
    allDays: boolean;
    ranges: { [K in DayKey]: TimeRange[] };
}

export function draftFromItem(item: ScheduleItem): ScheduleDraft {
    const ranges = {} as { [K in DayKey]: TimeRange[] };
    for (const day of DAY_KEYS) {
        // dayRanges resolves allDays/blank-time to explicit ranges; keep the
        // draft's per-day ranges independent of the allDays flag so toggling
        // it off restores what the days said before.
        ranges[day] = item.allDays
            ? (item.days[day].enabled ? mergeRanges(dayRangesRaw(item, day)) : [])
            : dayRanges(item, day);
    }
    return {
        description: item.description,
        observeHolidays: item.observeHolidays,
        allDays: item.allDays,
        ranges
    };
}

/** Per-day ranges ignoring the allDays override (blank-while-enabled = all day). */
function dayRangesRaw(item: ScheduleItem, day: DayKey): TimeRange[] {
    const d = item.days[day];
    if (!d.enabled) {
        return [];
    }
    if (d.time.trim() === '') {
        return [{ start: 0, end: MINUTES_PER_DAY }];
    }
    return mergeRanges(parseTimeRanges(d.time));
}

export function draftEquals(a: ScheduleDraft, b: ScheduleDraft): boolean {
    if (a.description !== b.description || a.observeHolidays !== b.observeHolidays || a.allDays !== b.allDays) {
        return false;
    }
    return DAY_KEYS.every((day) => {
        const ra = a.ranges[day];
        const rb = b.ranges[day];
        return ra.length === rb.length && ra.every((r, i) => r.start === rb[i].start && r.end === rb[i].end);
    });
}

/**
 * Serialize a draft back to the flat BasicScheduleModel mirror that
 * onScheduleSave emits (and system.user.editSchedule accepts back).
 * Times are always written explicitly ('0:00-24:00' rather than the
 * blank-means-all-day shorthand) so the round-trip is unambiguous.
 * repeatAlternating/startingAt pass through from the bound item untouched.
 */
export function draftToFlat(item: ScheduleItem, draft: ScheduleDraft): { [key: string]: any } {
    const out: { [key: string]: any } = {
        name: item.name,
        description: draft.description,
        observeHolidays: draft.observeHolidays,
        allDays: draft.allDays,
        repeatAlternating: item.repeatAlternating,
        startingAt: item.startingAt
    };
    for (const day of DAY_KEYS) {
        const ranges = draft.ranges[day];
        out[day] = ranges.length > 0;
        out[`${day}Time`] = formatTimeRanges(ranges);
    }
    return out;
}

// --- pointer geometry ------------------------------------------------------

/** Snap a minute to the grid (round to nearest), clamped to the day. */
export function snapMinute(minute: number, snap: number): number {
    const s = snap > 0 ? snap : 30;
    return Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minute / s) * s));
}

/**
 * Map a pointer's y position inside a day column to a snapped minute.
 * `yFraction` is (clientY - colTop) / colHeight, clamped here.
 */
export function minuteAtFraction(yFraction: number, startHour: number, endHour: number, snap: number): number {
    const windowStart = startHour * 60;
    const span = (endHour - startHour) * 60;
    const f = Math.max(0, Math.min(1, yFraction));
    return snapMinute(windowStart + f * span, snap);
}

/** The preview range while painting: anchor→current, ordered, never empty. */
export function paintPreview(anchorMinute: number, currentMinute: number, snap: number): TimeRange {
    const s = snap > 0 ? snap : 30;
    const lo = Math.min(anchorMinute, currentMinute);
    const hi = Math.max(anchorMinute, currentMinute);
    return hi - lo < s
        ? { start: lo, end: Math.min(lo + s, MINUTES_PER_DAY) }
        : { start: lo, end: hi };
}

/** Commit a painted range into a day: merge with what's there. */
export function applyPaint(ranges: TimeRange[], painted: TimeRange): TimeRange[] {
    return mergeRanges([...ranges, painted]);
}

/**
 * The preview while dragging a block edge. The dragged edge follows the
 * pointer but cannot invert past the block's other edge (min length = snap)
 * nor leave the day.
 */
export function resizePreview(range: TimeRange, edge: 'start' | 'end', minute: number, snap: number): TimeRange {
    const s = snap > 0 ? snap : 30;
    if (edge === 'start') {
        return { start: Math.max(0, Math.min(minute, range.end - s)), end: range.end };
    }
    return { start: range.start, end: Math.min(MINUTES_PER_DAY, Math.max(minute, range.start + s)) };
}

/** Commit a resize: replace the range, re-merge (it may now touch a neighbour). */
export function applyResize(ranges: TimeRange[], index: number, resized: TimeRange): TimeRange[] {
    const next = ranges.map((r, i) => (i === index ? resized : r));
    return mergeRanges(next);
}

/** Remove one range from a day (a deliberate click on a block). */
export function removeRange(ranges: TimeRange[], index: number): TimeRange[] {
    return ranges.filter((_, i) => i !== index);
}
