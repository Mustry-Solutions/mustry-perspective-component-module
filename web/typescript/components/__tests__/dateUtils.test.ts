import {
    pad2, startOfDay, startOfMonth, addMonths, addDays, daysInMonth,
    startOfWeek, firstCellOffset, daysBetween, sameDay, minDate, maxDate,
    fmtDate, parseDate, clampSec, secToHms, hmsToSec, secondsOfDay, combine,
    formatPattern, resolveZoned, instantToZonedIso, todayInZone, nowMinutesInZone,
    shiftWallDays, toWeekStart, weekStartDay, weekdayHeaders, emitWall, toEpochMs, msToZonedIso,
    wallClockInZone
} from '../../shared/dateUtils';

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
        expect(startOfWeek(monday, 1).getDate()).toBe(15);
    });

    it('Sunday-first returns the prior Sunday', () => {
        expect(startOfWeek(monday, 0).getDate()).toBe(14);
    });

    it('resolves a mid-week day correctly', () => {
        const thu = new Date(2026, 5, 18);
        expect(startOfWeek(thu, 1).getDate()).toBe(15);  // back to Monday
        expect(startOfWeek(thu, 0).getDate()).toBe(14); // back to Sunday
    });

    it('starts on any weekday', () => {
        const thu = new Date(2026, 5, 18);
        expect(startOfWeek(thu, 6).getDate()).toBe(13);  // Saturday-first: back to Sat 13
        expect(startOfWeek(thu, 3).getDate()).toBe(17);  // Wednesday-first: back to Wed 17
        expect(startOfWeek(thu, 4).getDate()).toBe(18);  // Thursday-first: that Thursday
    });
});

describe('firstCellOffset', () => {
    it('offsets the first cell by week-start', () => {
        const june = new Date(2026, 5, 1); // a Monday
        expect(firstCellOffset(june, 1)).toBe(0);  // Monday-first: no offset
        expect(firstCellOffset(june, 0)).toBe(1); // Sunday-first: one blank
        expect(firstCellOffset(june, 6)).toBe(2); // Saturday-first: Sat, Sun blank
        expect(firstCellOffset(june, 2)).toBe(6); // Tuesday-first: Monday is the last cell
    });
});

describe('config.weekStart', () => {
    it('accepts every day and reads anything else as Monday', () => {
        expect(weekStartDay(toWeekStart('sunday'))).toBe(0);
        expect(weekStartDay(toWeekStart('wednesday'))).toBe(3);
        expect(weekStartDay(toWeekStart('saturday'))).toBe(6);
        expect(toWeekStart('Saturday')).toBe('monday');
        expect(toWeekStart('')).toBe('monday');
    });

    it('rotates the weekday headers to the first day', () => {
        expect(weekdayHeaders(0, 'en-US')).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
        expect(weekdayHeaders(1, 'en-US')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
        expect(weekdayHeaders(6, 'en-US')).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
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

    // A wall time in the spring-forward gap does not exist. Whichever instant it
    // resolves to, the ISO string must name that same instant (#144).
    it('Europe/Brussels spring-forward gap: ISO and epoch name the same instant', () => {
        const r = resolveZoned(new Date(2026, 2, 29, 2, 30, 0), 'Europe/Brussels');
        expect(r.epochMs).toBe(Date.UTC(2026, 2, 29, 1, 30, 0));
        expect(r.iso).toBe('2026-03-29T03:30:00+02:00');
        expect(Date.parse(r.iso)).toBe(r.epochMs);
    });

    it('America/New_York spring-forward gap: ISO and epoch name the same instant', () => {
        // Only the agreement is asserted: the wall Date carries process-local
        // fields, and a process running in a US zone has already shifted 02:30.
        const r = resolveZoned(new Date(2026, 2, 8, 2, 30, 0), 'America/New_York');
        expect(Date.parse(r.iso)).toBe(r.epochMs);
    });

    it('keeps every zone right when calls alternate between zones', () => {
        // One cached formatter per zone (#145): a mix-up between zones, or a
        // formatter reused across them, would show up as a wrong offset here.
        const summer = Date.UTC(2026, 6, 1, 12, 0, 0);
        const winter = Date.UTC(2026, 0, 15, 12, 0, 0);
        const cases: Array<[string, number, string]> = [
            ['Europe/Brussels', summer, '2026-07-01T14:00:00+02:00'],
            ['America/Chicago', summer, '2026-07-01T07:00:00-05:00'],
            ['Asia/Kolkata', summer, '2026-07-01T17:30:00+05:30'],
            ['Europe/Brussels', winter, '2026-01-15T13:00:00+01:00'],
            ['America/Chicago', winter, '2026-01-15T06:00:00-06:00'],
            ['Pacific/Auckland', winter, '2026-01-16T01:00:00+13:00'],
            ['UTC', winter, '2026-01-15T12:00:00+00:00']
        ];
        for (let round = 0; round < 2; round++) {
            for (const [zone, ms, iso] of cases) {
                expect(msToZonedIso(ms, zone)).toBe(iso);
                expect(toEpochMs(iso.slice(0, 19), zone)).toBe(ms);
            }
        }
    });

    it('an unknown zone falls back to local time on every call', () => {
        const wall = new Date(2026, 5, 15, 12, 0, 0);
        for (let i = 0; i < 2; i++) {
            expect(resolveZoned(wall, 'Not/AZone').epochMs).toBe(wall.getTime());
        }
    });

    it('emitWall in the gap writes back the instant toEpochMs reads', () => {
        const out = emitWall('2026-03-29T02:30:00', false, 'Europe/Brussels');
        expect(out).toBe('2026-03-29T03:30:00+02:00');
        expect(Date.parse(out)).toBe(toEpochMs('2026-03-29T02:30:00', 'Europe/Brussels'));
    });
});

describe('instantToZonedIso (timezone normalisation)', () => {
    it('converts a UTC instant to a zone wall-clock (DST-correct)', () => {
        expect(instantToZonedIso('2026-06-24T14:00:00Z', 'America/Chicago')).toBe('2026-06-24T09:00:00');
        expect(instantToZonedIso('2026-01-15T14:00:00Z', 'America/Chicago')).toBe('2026-01-15T08:00:00');
    });
    it('handles offset-bearing input and date crossing', () => {
        expect(instantToZonedIso('2026-06-24T09:00:00-05:00', 'America/Chicago')).toBe('2026-06-24T09:00:00');
        expect(instantToZonedIso('2026-06-24T22:00:00Z', 'Pacific/Auckland')).toBe('2026-06-25T10:00:00');
    });
    it('converts epoch-ms instants', () => {
        const ms = Date.UTC(2026, 5, 24, 14, 0, 0);
        expect(instantToZonedIso(String(ms), 'America/Chicago')).toBe('2026-06-24T09:00:00');
    });
    it('leaves date-only and naive datetimes untouched', () => {
        expect(instantToZonedIso('2026-06-24', 'America/Chicago')).toBe('2026-06-24');
        expect(instantToZonedIso('2026-06-24T09:00:00', 'America/Chicago')).toBe('2026-06-24T09:00:00');
    });
    it('empty zone keeps a browser-local wall clock for an offset instant', () => {
        expect(instantToZonedIso('2026-06-24T14:00:00Z', '')).toMatch(/^2026-06-\d\dT\d\d:00:00$/);
    });
});

describe('shiftWallDays (month-drag day move)', () => {
    it('shifts the date part and keeps the time of day', () => {
        expect(shiftWallDays('2026-07-03T09:30:00', 2)).toBe('2026-07-05T09:30:00');
        expect(shiftWallDays('2026-07-03T09:30:00', -4)).toBe('2026-06-29T09:30:00');
    });
    it('date-only values stay date-only (all-day events)', () => {
        expect(shiftWallDays('2026-07-03', 7)).toBe('2026-07-10');
    });
    it('crosses month and year boundaries', () => {
        expect(shiftWallDays('2026-12-30T23:00:00', 3)).toBe('2027-01-02T23:00:00');
    });
    it('zero delta and unparseable input pass through unchanged', () => {
        expect(shiftWallDays('2026-07-03T09:30:00', 0)).toBe('2026-07-03T09:30:00');
        expect(shiftWallDays('garbage', 5)).toBe('garbage');
    });
});

describe('todayInZone / nowMinutesInZone', () => {
    it('returns a Date and a 0..1439 minute value', () => {
        expect(todayInZone('America/Chicago') instanceof Date).toBe(true);
        const m = nowMinutesInZone('America/Chicago');
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThan(1440);
    });

    it('todayInZone reads the date of a given instant in the zone', () => {
        // 03:00Z on Jun 26 is Jun 25 (22:00) in Chicago and Jun 26 (12:00) in Tokyo.
        const instant = new Date('2026-06-26T03:00:00Z');
        expect(fmtDate(todayInZone('America/Chicago', instant))).toBe('2026-06-25');
        expect(fmtDate(todayInZone('Asia/Tokyo', instant))).toBe('2026-06-26');
    });

    it('an unknown zone falls back to the browser zone instead of throwing', () => {
        const instant = new Date('2026-06-26T03:00:00Z');
        expect(todayInZone('Not/AZone', instant).getTime()).toBe(todayInZone('', instant).getTime());
    });
});

describe('wallClockInZone', () => {
    it('is a local Date whose fields are the zone wall clock', () => {
        const w = wallClockInZone(new Date('2026-06-25T13:00:00Z'), 'America/Chicago');
        expect([fmtDate(w), secondsOfDay(w)]).toEqual(['2026-06-25', 8 * 3600]);
    });

    it('blank zone keeps the instant (browser-local)', () => {
        const instant = new Date(2026, 5, 25, 13, 0, 0);
        expect(wallClockInZone(instant, '').getTime()).toBe(instant.getTime());
    });
});
