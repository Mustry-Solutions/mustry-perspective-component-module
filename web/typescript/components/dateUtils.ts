// Pure date helpers for the range picker. All values are local wall-clock; dates
// used for day math are normalised to local midnight.

export const MS_PER_DAY = 86400000;

export function pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

/** Local midnight of the given date. */
export function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function today(): Date {
    return startOfDay(new Date());
}

export function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function addDays(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function daysInMonth(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** First day (local midnight) of the week containing `d`, per Monday/Sunday start. */
export function startOfWeek(d: Date, mondayFirst: boolean): Date {
    const dow = d.getDay(); // 0=Sun..6=Sat
    const offset = mondayFirst ? (dow + 6) % 7 : dow;
    return addDays(startOfDay(d), -offset);
}

/** Offset (0..6) of the first day cell, honouring Monday-first or Sunday-first. */
export function firstCellOffset(monthStart: Date, mondayFirst: boolean): number {
    const dow = monthStart.getDay(); // 0=Sun .. 6=Sat
    return mondayFirst ? (dow + 6) % 7 : dow;
}

/** Whole calendar days between two values (DST-safe via day-count rounding). */
export function daysBetween(a: Date, b: Date): number {
    return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

export function sameDay(a: Date | null, b: Date | null): boolean {
    return !!a && !!b && a.getTime() === b.getTime();
}

export function minDate(a: Date, b: Date): Date {
    return a.getTime() <= b.getTime() ? a : b;
}

export function maxDate(a: Date, b: Date): Date {
    return a.getTime() >= b.getTime() ? a : b;
}

/** "YYYY-MM-DD" for a date-only value. */
export function fmtDate(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse "YYYY-MM-DD" (extra time portion ignored) to a local-midnight Date, or null. */
export function parseDate(s: string): Date | null {
    if (!s) {
        return null;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) {
        return null;
    }
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Clamp seconds-since-midnight into [0, 86399]. */
export function clampSec(sec: number): number {
    if (isNaN(sec)) {
        return 0;
    }
    return Math.max(0, Math.min(86399, Math.floor(sec)));
}

/** seconds-since-midnight -> "HH:mm:ss" */
export function secToHms(sec: number): string {
    const s = clampSec(sec);
    return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

/** "HH:mm[:ss]" -> seconds-since-midnight */
export function hmsToSec(v: string): number {
    const parts = v.split(':').map((p) => parseInt(p, 10) || 0);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    const s = parts[2] || 0;
    return clampSec(h * 3600 + m * 60 + s);
}

/** Seconds-since-midnight for the time-of-day portion of a datetime. */
export function secondsOfDay(d: Date): number {
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/** Combine a date-only value with seconds-since-midnight into a full datetime. */
export function combine(dateOnly: Date, sec: number): Date {
    const s = clampSec(sec);
    const d = new Date(dateOnly.getTime());
    d.setHours(Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60, 0);
    return d;
}

/** "YYYY-MM-DDTHH:mm:ss" local wall-clock (no timezone offset). */
export function fmtDateTime(d: Date): string {
    return `${fmtDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Format a date with a token pattern (YYYY, YY, MM, M, DD, D, HH, mm, ss). */
export function formatPattern(d: Date, pattern: string): string {
    const map: { [k: string]: string } = {
        YYYY: String(d.getFullYear()),
        YY: pad2(d.getFullYear() % 100),
        MM: pad2(d.getMonth() + 1),
        M: String(d.getMonth() + 1),
        DD: pad2(d.getDate()),
        D: String(d.getDate()),
        HH: pad2(d.getHours()),
        mm: pad2(d.getMinutes()),
        ss: pad2(d.getSeconds())
    };
    // Longer tokens first in the alternation so YYYY beats YY, MM beats M, DD beats D.
    return pattern.replace(/YYYY|YY|MM|DD|HH|mm|ss|M|D/g, (t) => map[t]);
}

export function intlFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    try {
        return new Intl.DateTimeFormat(locale || undefined, options);
    } catch (e) {
        return new Intl.DateTimeFormat(undefined, options);
    }
}

/** "June 2026" localized to `locale` ('' = browser default). */
export function monthLabel(d: Date, locale: string): string {
    return intlFormat(locale, { month: 'long', year: 'numeric' }).format(d);
}

/** Short weekday headers localized to `locale`, ordered per `mondayFirst`. */
export function weekdayHeaders(mondayFirst: boolean, locale: string): string[] {
    const fmt = intlFormat(locale, { weekday: 'short' });
    // 2024-01-07 is a Sunday; format Sun..Sat.
    const base: string[] = [];
    for (let i = 0; i < 7; i++) {
        base.push(fmt.format(new Date(2024, 0, 7 + i)));
    }
    return mondayFirst ? [...base.slice(1), base[0]] : base;
}

// --- timezone resolution (DST-correct, no external libraries) -------------

export interface ZonedResult {
    epochMs: number;   // absolute instant (UTC) of the wall-clock in the target zone
    iso: string;       // ISO 8601 with offset, e.g. "2026-06-25T09:00:00+02:00"
}

/** Offset (minutes, east-positive) of `timeZone` at the instant `date`. */
function tzOffsetMinutes(date: Date, timeZone: string): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const map: { [k: string]: number } = {};
    for (const p of dtf.formatToParts(date)) {
        if (p.type !== 'literal') {
            map[p.type] = parseInt(p.value, 10);
        }
    }
    const hour = map.hour === 24 ? 0 : map.hour;
    const asUTC = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
    return Math.round((asUTC - date.getTime()) / 60000);
}

/** Epoch ms for wall-clock fields interpreted in `timeZone` (handles DST). */
function zonedWallClockToEpoch(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): number {
    let ts = Date.UTC(y, mo - 1, d, h, mi, s);
    const off1 = tzOffsetMinutes(new Date(ts), timeZone);
    ts -= off1 * 60000;
    const off2 = tzOffsetMinutes(new Date(ts), timeZone);
    if (off2 !== off1) {
        ts -= (off2 - off1) * 60000;
    }
    return ts;
}

function offsetToStr(offMin: number): string {
    const sign = offMin >= 0 ? '+' : '-';
    const abs = Math.abs(offMin);
    return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/**
 * Resolve a wall-clock Date (its LOCAL fields are the picked values) into an
 * absolute instant + offset-bearing ISO, interpreting the wall clock in
 * `timeZone`. Empty `timeZone` = the browser/session-local zone.
 */
export function resolveZoned(wall: Date, timeZone: string): ZonedResult {
    const y = wall.getFullYear();
    const mo = wall.getMonth() + 1;
    const d = wall.getDate();
    const h = wall.getHours();
    const mi = wall.getMinutes();
    const s = wall.getSeconds();

    let epochMs: number;
    let offMin: number;
    if (!timeZone) {
        epochMs = wall.getTime();
        offMin = -wall.getTimezoneOffset();
    } else {
        try {
            epochMs = zonedWallClockToEpoch(y, mo, d, h, mi, s, timeZone);
            offMin = tzOffsetMinutes(new Date(epochMs), timeZone);
        } catch (e) {
            epochMs = wall.getTime();
            offMin = -wall.getTimezoneOffset();
        }
    }
    const iso = `${fmtDate(wall)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}${offsetToStr(offMin)}`;
    return { epochMs, iso };
}
