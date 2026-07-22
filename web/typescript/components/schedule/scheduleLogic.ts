// Pure schedule-model logic for the Schedule Manager — no DOM, node-tested.
//
// The data model mirrors Ignition's BasicScheduleModel bean (flat per-day
// `monday` enabled flags + `mondayTime` range strings) so bound data maps 1:1
// onto what system.user.getSchedules() returns and what addSchedule/editSchedule
// expect back. Range strings use the gateway's 24h format: "8:00-17:00", with
// multiple ranges comma-separated ("8:00-12:00, 12:30-17:00"); "24:00" (or a
// bare "24") is a valid end-of-day. A day that is enabled with a BLANK time
// counts as available all day, matching the gateway UI's behaviour.

export const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DayKey = typeof DAY_KEYS[number];

export const MINUTES_PER_DAY = 1440;

/** Minutes since midnight; start < end, both within 0..1440. */
export interface TimeRange {
    start: number;
    end: number;
}

export interface DayAvailability {
    enabled: boolean;
    /** Raw gateway range string ('' = all day when enabled). */
    time: string;
}

/** One schedule, normalized from the flat bean-mirror in data.schedules. */
export interface ScheduleItem {
    name: string;
    description: string;
    observeHolidays: boolean;
    allDays: boolean;
    /** Week A / week B alternation. This milestone renders week A only. */
    repeatAlternating: boolean;
    /** Informational ISO date ('' when unset) — anchors alternating weeks. */
    startingAt: string;
    days: { [K in DayKey]: DayAvailability };
}

/** "8:30" | "8" | "24:00" → minutes since midnight, or null when malformed. */
export function parseTimeToken(token: string): number | null {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(token);
    if (!m) {
        return null;
    }
    const hours = Number(m[1]);
    const minutes = m[2] === undefined ? 0 : Number(m[2]);
    if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) {
        return null;
    }
    return hours * 60 + minutes;
}

/**
 * Parse a gateway range string ("8:00-12:00, 13:00-17:00") into ranges.
 * Tolerant by design: malformed or empty segments are dropped (bad data must
 * not blank the whole grid), inverted ranges are dropped, values clamp to the
 * day. Returns [] for a blank string.
 */
export function parseTimeRanges(text: string): TimeRange[] {
    const out: TimeRange[] = [];
    for (const part of text.split(',')) {
        if (part.trim() === '') {
            continue;
        }
        const dash = part.indexOf('-');
        if (dash < 0) {
            continue;
        }
        const start = parseTimeToken(part.slice(0, dash));
        const end = parseTimeToken(part.slice(dash + 1));
        if (start === null || end === null || start >= end) {
            continue;
        }
        out.push({ start, end: Math.min(end, MINUTES_PER_DAY) });
    }
    return out;
}

/** Minutes since midnight → "H:MM" (the gateway's own 24h spelling). */
export function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${m < 10 ? '0' : ''}${m}`;
}

/** Canonical gateway spelling of a range list: "8:00-12:00, 13:00-17:00". */
export function formatTimeRanges(ranges: TimeRange[]): string {
    return ranges.map((r) => `${formatMinutes(r.start)}-${formatMinutes(r.end)}`).join(', ');
}

/** Sort + merge overlapping/touching ranges (the invariant editing must keep). */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
    const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
    const out: TimeRange[] = [];
    for (const r of sorted) {
        const last = out[out.length - 1];
        if (last && r.start <= last.end) {
            last.end = Math.max(last.end, r.end);
        } else {
            out.push({ ...r });
        }
    }
    return out;
}

/**
 * Normalize one raw entry of data.schedules (the flat bean mirror — untyped,
 * item schema deliberately open) into a ScheduleItem. Missing fields default
 * to disabled/blank so partial rows render instead of throwing.
 */
export function normalizeSchedule(raw: any): ScheduleItem {
    const src = raw || {};
    const days = {} as { [K in DayKey]: DayAvailability };
    for (const day of DAY_KEYS) {
        days[day] = {
            enabled: !!src[day],
            time: src[`${day}Time`] == null ? '' : String(src[`${day}Time`])
        };
    }
    return {
        name: src.name == null ? '' : String(src.name),
        description: src.description == null ? '' : String(src.description),
        observeHolidays: !!src.observeHolidays,
        allDays: !!src.allDays,
        repeatAlternating: !!src.repeatAlternating,
        startingAt: src.startingAt == null ? '' : String(src.startingAt),
        days
    };
}

/** Effective availability for one day, merged, honouring allDays/enabled/blank-time. */
export function dayRanges(item: ScheduleItem, day: DayKey): TimeRange[] {
    if (item.allDays) {
        return [{ start: 0, end: MINUTES_PER_DAY }];
    }
    const d = item.days[day];
    if (!d.enabled) {
        return [];
    }
    if (d.time.trim() === '') {
        return [{ start: 0, end: MINUTES_PER_DAY }];
    }
    return mergeRanges(parseTimeRanges(d.time));
}

/**
 * Is the schedule active at `minute` of `dayIndex` (0 = Monday .. 6 = Sunday)?
 * Alternating schedules are evaluated against week A this milestone.
 */
export function isActiveAt(item: ScheduleItem, dayIndex: number, minute: number): boolean {
    const day = DAY_KEYS[((dayIndex % 7) + 7) % 7];
    return dayRanges(item, day).some((r) => minute >= r.start && minute < r.end);
}

/** Display order of the seven days for the configured week start. */
export function orderedDays(firstDayOfWeek: 'monday' | 'sunday'): DayKey[] {
    return firstDayOfWeek === 'sunday' ? ['sunday', ...DAY_KEYS.slice(0, 6)] : [...DAY_KEYS];
}

/** Valid [startHour, endHour) display window; anything nonsensical → full day. */
export function clampHourWindow(startHour: number, endHour: number): [number, number] {
    const s = Math.floor(startHour);
    const e = Math.ceil(endHour);
    if (!isFinite(s) || !isFinite(e) || s < 0 || e > 24 || s >= e) {
        return [0, 24];
    }
    return [s, e];
}

/** The next moment a schedule's active state flips, or null when it never
 *  does (always-active like allDays, or never-active). */
export interface Transition {
    /** Whole days ahead of the probe day (0 = later today). */
    dayOffset: number;
    /** 0 = Monday .. 6 = Sunday of the transition. */
    dayIndex: number;
    /** Minute of that day (0..1439; a range ending 24:00 reports 0:00 next day). */
    minute: number;
    /** True when the schedule turns ON at that moment, false when it turns off. */
    becomesActive: boolean;
}

/**
 * Scan forward from `minute` of `dayIndex` (0 = Monday) for the next
 * active/inactive flip. Looks 8 days out so a weekly wrap (only active
 * earlier on this weekday) is still found; ranges touching across midnight
 * (…-24:00 + 0:00-…) merge into one continuous interval, so no false flip
 * fires at midnight. Alternating schedules are evaluated against week A.
 */
export function nextTransition(item: ScheduleItem, dayIndex: number, minute: number): Transition | null {
    const start = ((dayIndex % 7) + 7) % 7;
    const intervals: TimeRange[] = [];
    for (let offset = 0; offset <= 7; offset++) {
        const day = DAY_KEYS[(start + offset) % 7];
        for (const r of dayRanges(item, day)) {
            intervals.push({ start: offset * MINUTES_PER_DAY + r.start, end: offset * MINUTES_PER_DAY + r.end });
        }
    }
    const merged = mergeRanges(intervals);
    const current = merged.find((r) => minute >= r.start && minute < r.end);
    let boundary: number;
    let becomesActive: boolean;
    if (current) {
        boundary = current.end;
        becomesActive = false;
    } else {
        const next = merged.find((r) => r.start > minute);
        if (!next) {
            return null;
        }
        boundary = next.start;
        becomesActive = true;
    }
    if (boundary >= 8 * MINUTES_PER_DAY) {
        return null; // active through the whole scan window: effectively always-on
    }
    const dayOffset = Math.floor(boundary / MINUTES_PER_DAY);
    return {
        dayOffset,
        dayIndex: (start + dayOffset) % 7,
        minute: boundary % MINUTES_PER_DAY,
        becomesActive
    };
}

/** Hours to label on the time gutter — every hour, or every 2/3 when cramped. */
export function hourTicks(startHour: number, endHour: number): number[] {
    const span = endHour - startHour;
    const step = span <= 12 ? 1 : span <= 18 ? 2 : 3;
    const out: number[] = [];
    for (let h = startHour; h < endHour; h += step) {
        out.push(h);
    }
    return out;
}
