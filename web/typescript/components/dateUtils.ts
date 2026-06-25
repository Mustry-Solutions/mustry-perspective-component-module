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

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export function monthLabel(d: Date): string {
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function weekdayHeaders(mondayFirst: boolean): string[] {
    const base = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return mondayFirst ? [...base.slice(1), base[0]] : base;
}
