import {
    pad2, startOfDay, startOfMonth, addMonths, addDays, daysInMonth,
    startOfWeek, firstCellOffset, daysBetween, sameDay, minDate, maxDate,
    fmtDate, parseDate, clampSec, secToHms, hmsToSec, secondsOfDay, combine,
    fmtDateTime, formatPattern, resolveZoned
} from '../dateUtils';

describe('pad2', () => {
    it('pads to two digits', () => {
        expect(pad2(0)).toBe('00');
        expect(pad2(9)).toBe('09');
        expect(pad2(10)).toBe('10');
        expect(pad2(59)).toBe('59');
    });
});

describe('day/month arithmetic', () => {
    it('startOfDay strips the time', () => {
        const d = startOfDay(new Date(2026, 5, 15, 13, 45, 30));
        expect(d.getHours()).toBe(0);
        expect(d.getMinutes()).toBe(0);
        expect(d.getSeconds()).toBe(0);
        expect(d.getDate()).toBe(15);
    });

    it('startOfMonth returns the 1st', () => {
        expect(startOfMonth(new Date(2026, 5, 15)).getDate()).toBe(1);
    });

    it('addMonths wraps the year', () => {
        const d = addMonths(new Date(2026, 11, 1), 1);
        expect(d.getFullYear()).toBe(2027);
        expect(d.getMonth()).toBe(0);
    });

    it('addDays crosses a month boundary', () => {
        const d = addDays(new Date(2026, 5, 30), 2); // 30 Jun + 2 -> 2 Jul
        expect(d.getMonth()).toBe(6);
        expect(d.getDate()).toBe(2);
    });

    it('daysInMonth handles normal, leap, and 30-day months', () => {
        expect(daysInMonth(new Date(2026, 1, 1))).toBe(28); // Feb 2026
        expect(daysInMonth(new Date(2024, 1, 1))).toBe(29); // Feb 2024 (leap)
        expect(daysInMonth(new Date(2026, 5, 1))).toBe(30); // June
    });
});

describe('startOfWeek', () => {
    // 2026-06-15 is a Monday.
    const monday = new Date(2026, 5, 15);

    it('Monday-first returns that Monday', () => {
        expect(startOfWeek(monday, true).getDate()).toBe(15);
    });

    it('Sunday-first returns the prior Sunday', () => {
        expect(startOfWeek(monday, false).getDate()).toBe(14);
    });

    it('resolves a mid-week day correctly', () => {
        const thu = new Date(2026, 5, 18);
        expect(startOfWeek(thu, true).getDate()).toBe(15);  // back to Monday
        expect(startOfWeek(thu, false).getDate()).toBe(14); // back to Sunday
    });
});

describe('firstCellOffset', () => {
    it('offsets the first cell by week-start', () => {
        const june = new Date(2026, 5, 1); // a Monday
        expect(firstCellOffset(june, true)).toBe(0);  // Monday-first: no offset
        expect(firstCellOffset(june, false)).toBe(1); // Sunday-first: one blank
    });
});

describe('daysBetween / sameDay / minDate / maxDate', () => {
    it('counts whole days', () => {
        expect(daysBetween(new Date(2026, 5, 10), new Date(2026, 5, 15))).toBe(5);
        expect(daysBetween(new Date(2026, 5, 15), new Date(2026, 5, 15))).toBe(0);
    });

    it('sameDay compares the (normalised) instant', () => {
        expect(sameDay(new Date(2026, 5, 15), new Date(2026, 5, 15))).toBe(true);
        expect(sameDay(new Date(2026, 5, 15), new Date(2026, 5, 16))).toBe(false);
        expect(sameDay(null, new Date(2026, 5, 15))).toBe(false);
        expect(sameDay(new Date(2026, 5, 15), null)).toBe(false);
    });

    it('min/max pick the earlier/later date', () => {
        const a = new Date(2026, 5, 10);
        const b = new Date(2026, 5, 20);
        expect(minDate(a, b)).toBe(a);
        expect(maxDate(a, b)).toBe(b);
    });
});

describe('fmtDate / parseDate', () => {
    it('formats as YYYY-MM-DD with padding', () => {
        expect(fmtDate(new Date(2026, 5, 5))).toBe('2026-06-05');
    });

    it('parses a valid date string', () => {
        const p = parseDate('2026-06-05');
        expect(p).not.toBeNull();
        expect(p!.getFullYear()).toBe(2026);
        expect(p!.getMonth()).toBe(5);
        expect(p!.getDate()).toBe(5);
    });

    it('returns null for empty/garbage', () => {
        expect(parseDate('')).toBeNull();
        expect(parseDate('not-a-date')).toBeNull();
    });

    it('round-trips', () => {
        expect(fmtDate(parseDate('2026-12-31')!)).toBe('2026-12-31');
    });
});

describe('time-of-day helpers', () => {
    it('clampSec bounds and floors', () => {
        expect(clampSec(-5)).toBe(0);
        expect(clampSec(90000)).toBe(86399);
        expect(clampSec(3661.9)).toBe(3661);
        expect(clampSec(NaN)).toBe(0);
    });

    it('secToHms formats', () => {
        expect(secToHms(0)).toBe('00:00:00');
        expect(secToHms(3661)).toBe('01:01:01');
        expect(secToHms(86399)).toBe('23:59:59');
    });

    it('hmsToSec parses HH:mm[:ss]', () => {
        expect(hmsToSec('01:01:01')).toBe(3661);
        expect(hmsToSec('23:59:59')).toBe(86399);
        expect(hmsToSec('14:30')).toBe(14 * 3600 + 30 * 60);
    });

    it('round-trips through hms', () => {
        expect(hmsToSec(secToHms(45296))).toBe(45296);
    });

    it('secondsOfDay / combine are inverses', () => {
        expect(secondsOfDay(new Date(2026, 5, 15, 1, 1, 1))).toBe(3661);
        const c = combine(new Date(2026, 5, 15), 45296);
        expect(c.getDate()).toBe(15);
        expect(secondsOfDay(c)).toBe(45296);
    });
});

describe('fmtDateTime', () => {
    it('formats local wall-clock without offset', () => {
        expect(fmtDateTime(new Date(2026, 5, 5, 9, 8, 7))).toBe('2026-06-05T09:08:07');
    });
});

describe('formatPattern', () => {
    const d = new Date(2026, 5, 9, 14, 3, 7); // 2026-06-09 14:03:07

    it('formats common date patterns', () => {
        expect(formatPattern(d, 'DD/MM/YYYY')).toBe('09/06/2026');
        expect(formatPattern(d, 'YYYY-MM-DD')).toBe('2026-06-09');
        expect(formatPattern(d, 'MM/DD/YYYY')).toBe('06/09/2026');
    });

    it('formats date + time', () => {
        expect(formatPattern(d, 'DD/MM/YYYY HH:mm:ss')).toBe('09/06/2026 14:03:07');
        expect(formatPattern(d, 'DD/MM/YYYY HH:mm')).toBe('09/06/2026 14:03');
    });

    it('supports non-padded tokens and 2-digit year', () => {
        expect(formatPattern(d, 'D/M/YY')).toBe('9/6/26');
    });

    it('prefers the longest token (YYYY over YY)', () => {
        expect(formatPattern(d, 'YYYY')).toBe('2026');
        expect(formatPattern(d, 'YY')).toBe('26');
    });
});

describe('resolveZoned', () => {
    it('UTC: zero offset, epoch matches Date.UTC', () => {
        const wall = new Date(2026, 5, 15, 12, 0, 0);
        const r = resolveZoned(wall, 'UTC');
        expect(r.iso).toBe('2026-06-15T12:00:00+00:00');
        expect(r.epochMs).toBe(Date.UTC(2026, 5, 15, 12, 0, 0));
    });

    it('America/New_York is -04:00 in June (EDT)', () => {
        const wall = new Date(2026, 5, 15, 12, 0, 0);
        const r = resolveZoned(wall, 'America/New_York');
        expect(r.iso).toBe('2026-06-15T12:00:00-04:00');
        expect(r.epochMs).toBe(Date.UTC(2026, 5, 15, 16, 0, 0)); // 12:00 EDT = 16:00 UTC
    });

    it('America/New_York is -05:00 in January (EST)', () => {
        const wall = new Date(2026, 0, 15, 12, 0, 0);
        const r = resolveZoned(wall, 'America/New_York');
        expect(r.iso).toBe('2026-01-15T12:00:00-05:00');
        expect(r.epochMs).toBe(Date.UTC(2026, 0, 15, 17, 0, 0)); // 12:00 EST = 17:00 UTC
    });
});
