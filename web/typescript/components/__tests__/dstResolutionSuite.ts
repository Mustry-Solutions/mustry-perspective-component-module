// DST-gap and overlap resolution (#225), run once per process zone by the
// dstResolution.<zone>.test.ts files: the process zone plays the browser's zone,
// and must never change what a wall time resolves to in `config.timezone`.
import { emitWall, parseDate, resolveZoned, toEpochMs, wallOfDay, WallFields } from '../../shared/dateUtils';
import { computeOutputs } from '../picker/pickerLogic';
import {
    buildTicks, customWindowOnDate, MS_PER_HOUR, pageAnchorMs, pageCustomWindow, windowFor, zoneMidnightMs
} from '../timeline/timelineLogic';

/** A wall time the process zone's own `Date` moves, in a zone where it exists. */
interface BrowserGap {
    wall: string;
    timeZone: string;     // has no gap at `wall`
    iso: string;
}

// Only the zone that has this gap can show the shift: the cases for one process
// zone prove nothing about the bug in another.
const BROWSER_GAPS: { [processZone: string]: BrowserGap[] } = {
    'UTC': [],
    // The issue's example: 02:30 exists in New York on Brussels' spring-forward day.
    'Europe/Brussels': [{ wall: '2026-03-29T02:30:00', timeZone: 'America/New_York', iso: '2026-03-29T02:30:00-04:00' }],
    'America/New_York': [{ wall: '2026-03-08T02:30:00', timeZone: 'Europe/Brussels', iso: '2026-03-08T02:30:00+01:00' }],
    'Australia/Sydney': [{ wall: '2026-10-04T02:30:00', timeZone: 'America/Chicago', iso: '2026-10-04T02:30:00-05:00' }],
    'Australia/Lord_Howe': [{ wall: '2026-10-04T02:15:00', timeZone: 'Asia/Kolkata', iso: '2026-10-04T02:15:00+05:30' }],
    'America/Havana': [{ wall: '2026-03-08T00:30:00', timeZone: 'Europe/Brussels', iso: '2026-03-08T00:30:00+01:00' }]
};

// [zone, wall time in its gap, the real time it resolves to].
const GAPS: Array<[string, string, string]> = [
    // East of UTC
    ['Europe/Brussels', '2026-03-29T02:30:00', '2026-03-29T03:30:00+02:00'],
    ['Europe/London', '2026-03-29T01:30:00', '2026-03-29T02:30:00+01:00'],
    ['Australia/Sydney', '2026-10-04T02:30:00', '2026-10-04T03:30:00+11:00'],
    ['Pacific/Auckland', '2026-09-27T02:30:00', '2026-09-27T03:30:00+13:00'],
    // West of UTC: these went back an hour before #225
    ['America/New_York', '2026-03-08T02:30:00', '2026-03-08T03:30:00-04:00'],
    ['America/Chicago', '2026-03-08T02:30:00', '2026-03-08T03:30:00-05:00'],
    ['America/Santiago', '2026-09-06T00:30:00', '2026-09-06T01:30:00-03:00'],
    // Half-hour offsets with a whole-hour gap
    ['America/St_Johns', '2026-03-08T02:30:00', '2026-03-08T03:30:00-02:30'],
    ['Australia/Adelaide', '2026-10-04T02:30:00', '2026-10-04T03:30:00+10:30'],
    // Gaps that are not an hour: 30 minutes, two hours, a whole skipped day
    ['Australia/Lord_Howe', '2026-10-04T02:15:00', '2026-10-04T02:45:00+11:00'],
    ['Antarctica/Troll', '2026-03-29T01:30:00', '2026-03-29T03:30:00+02:00'],
    ['Pacific/Apia', '2011-12-30T12:00:00', '2011-12-31T12:00:00+14:00'],
    // The gap swallows midnight
    ['America/Havana', '2026-03-08T00:00:00', '2026-03-08T01:00:00-04:00']
];

// [zone, wall time it shows twice, the occurrence it resolves to, which one]. This
// is what the code has always done, recorded here rather than endorsed: the
// occurrence depends on which side of UTC the zone is.
const OVERLAPS: Array<[string, string, string, 'first' | 'second']> = [
    ['America/New_York', '2026-11-01T01:30:00', '2026-11-01T01:30:00-04:00', 'first'],
    ['America/Chicago', '2026-11-01T01:30:00', '2026-11-01T01:30:00-05:00', 'first'],
    ['America/St_Johns', '2026-11-01T01:30:00', '2026-11-01T01:30:00-02:30', 'first'],
    ['America/Havana', '2026-11-01T00:30:00', '2026-11-01T00:30:00-04:00', 'first'],
    ['America/Santiago', '2026-04-04T23:30:00', '2026-04-04T23:30:00-03:00', 'first'],
    ['Europe/Brussels', '2026-10-25T02:30:00', '2026-10-25T02:30:00+01:00', 'second'],
    ['Europe/London', '2026-10-25T01:30:00', '2026-10-25T01:30:00+00:00', 'second'],
    ['Antarctica/Troll', '2026-10-25T02:30:00', '2026-10-25T02:30:00+00:00', 'second'],
    ['Australia/Sydney', '2026-04-05T02:30:00', '2026-04-05T02:30:00+10:00', 'second'],
    ['Australia/Adelaide', '2026-04-05T02:30:00', '2026-04-05T02:30:00+09:30', 'second'],
    ['Australia/Lord_Howe', '2026-04-05T01:45:00', '2026-04-05T01:45:00+10:30', 'second'],
    ['Pacific/Auckland', '2026-04-05T02:30:00', '2026-04-05T02:30:00+12:00', 'second']
];

function fields(wall: string): Required<WallFields> {
    const [y, mo, d, h, mi, s] = wall.split(/[-T:]/).map(Number);
    return { y, mo, d, h, mi, s };
}

const localDate = (f: Required<WallFields>): Date => new Date(f.y, f.mo - 1, f.d, f.h, f.mi, f.s);

const pickerOutputs = (date: string, sec: number, timezone: string) => computeOutputs({
    startDate: date, startTimeSec: sec, endDate: date, endTimeSec: 86399,
    granularity: 'second', timezone, minSpanDays: 0, maxSpanDays: 0, durationLabelThresholdHours: 48,
    labels: { sameDay: 'Same day', durationDays: '{n} {days}', dayOne: 'day', dayMany: 'days' }
});

export function dstResolutionSuite(processZone: string): void {
    describe(`DST resolution with the process in ${processZone}`, () => {
        it('really is running in that zone', () => {
            expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(processZone);
            // UTC is the only zone with no gap to test: an empty list anywhere else
            // would turn the browser-gap tests below into skips and prove nothing.
            if (processZone !== 'UTC') {
                expect(BROWSER_GAPS[processZone].length).toBeGreaterThan(0);
            }
            for (const g of BROWSER_GAPS[processZone]) {
                const f = fields(g.wall);
                expect(localDate(f).getHours() * 60 + localDate(f).getMinutes()).not.toBe(f.h * 60 + f.mi);
            }
        });

        describe.each(GAPS)('gap in %s at %s', (zone, wall, iso) => {
            const epoch = Date.parse(iso);

            it('resolves forward', () => {
                expect(resolveZoned(fields(wall), zone)).toEqual({ epochMs: epoch, iso });
            });
            it('toEpochMs and emitWall agree', () => {
                expect(toEpochMs(wall, zone)).toBe(epoch);
                expect(emitWall(wall, false, zone)).toBe(iso);
            });
            it('emitting and reading again is stable', () => {
                const emitted = emitWall(wall, false, zone);
                expect(toEpochMs(emitted, zone)).toBe(epoch);
                expect(toEpochMs(emitted.slice(0, 19), zone)).toBe(epoch);
            });
        });

        describe.each(OVERLAPS)('overlap in %s at %s', (zone, wall, iso, occurrence) => {
            it(`keeps the ${occurrence} occurrence`, () => {
                expect(resolveZoned(fields(wall), zone)).toEqual({ epochMs: Date.parse(iso), iso });
                expect(toEpochMs(wall, zone)).toBe(Date.parse(iso));
                expect(emitWall(wall, false, zone)).toBe(iso);
                // The occurrence the name claims: the same wall time an hour (or the
                // zone's change) earlier or later is the other one.
                const other = occurrence === 'first' ? 1 : -1;
                const change = zone === 'Antarctica/Troll' ? 2 : zone === 'Australia/Lord_Howe' ? 0.5 : 1;
                const otherMs = Date.parse(iso) + other * change * MS_PER_HOUR;
                const otherWall = new Intl.DateTimeFormat('sv-SE', {
                    timeZone: zone, dateStyle: 'short', timeStyle: 'medium'
                }).format(otherMs).replace(' ', 'T');
                expect(otherWall).toBe(wall);
            });
        });

        it('leaves the edges of a gap alone', () => {
            const ny = 'America/New_York';
            expect(emitWall('2026-03-08T01:59:59', false, ny)).toBe('2026-03-08T01:59:59-05:00');
            expect(emitWall('2026-03-08T02:00:00', false, ny)).toBe('2026-03-08T03:00:00-04:00');
            expect(emitWall('2026-03-08T02:59:59', false, ny)).toBe('2026-03-08T03:59:59-04:00');
            expect(emitWall('2026-03-08T03:00:00', false, ny)).toBe('2026-03-08T03:00:00-04:00');
            const bx = 'Europe/Brussels';
            expect(emitWall('2026-03-29T01:59:59', false, bx)).toBe('2026-03-29T01:59:59+01:00');
            expect(emitWall('2026-03-29T03:00:00', false, bx)).toBe('2026-03-29T03:00:00+02:00');
        });

        it('leaves the edges of an overlap alone', () => {
            const ny = 'America/New_York';
            expect(emitWall('2026-11-01T00:59:59', false, ny)).toBe('2026-11-01T00:59:59-04:00');
            expect(emitWall('2026-11-01T02:00:00', false, ny)).toBe('2026-11-01T02:00:00-05:00');
            const bx = 'Europe/Brussels';
            expect(emitWall('2026-10-25T01:59:59', false, bx)).toBe('2026-10-25T01:59:59+02:00');
            expect(emitWall('2026-10-25T03:00:00', false, bx)).toBe('2026-10-25T03:00:00+01:00');
        });

        it('rolls over out-of-range fields like Date', () => {
            expect(resolveZoned({ y: 2026, mo: 3, d: 32 }, 'UTC').iso).toBe('2026-04-01T00:00:00+00:00');
            expect(toEpochMs('2026-03-08T24:00:00', 'UTC')).toBe(Date.UTC(2026, 2, 9));
        });

        describe('browser-local path (no timezone)', () => {
            it('matches Date for gap and overlap alike', () => {
                for (const [, wall] of [...GAPS, ...OVERLAPS]) {
                    const f = fields(wall);
                    expect(resolveZoned(f, '').epochMs).toBe(localDate(f).getTime());
                    expect(toEpochMs(wall, '')).toBe(localDate(f).getTime());
                }
            });
            it('the zoned gap rule is the same as Date in the zone itself', () => {
                for (const [zone, wall] of GAPS.filter((c) => c[0] === processZone)) {
                    const f = fields(wall);
                    expect(resolveZoned(f, zone).epochMs).toBe(localDate(f).getTime());
                }
            });
        });

        describe('the browser\'s own gap cannot move a wall time', () => {
            const cases = BROWSER_GAPS[processZone];
            const run = cases.length ? it : it.skip;

            run('resolveZoned, emitWall and toEpochMs keep the fields', () => {
                for (const g of cases) {
                    expect(resolveZoned(fields(g.wall), g.timeZone).iso).toBe(g.iso);
                    expect(emitWall(g.wall, false, g.timeZone)).toBe(g.iso);
                    expect(toEpochMs(g.wall, g.timeZone)).toBe(Date.parse(g.iso));
                }
            });
            run('the picker outputs keep the picked time', () => {
                for (const g of cases) {
                    const f = fields(g.wall);
                    const out = pickerOutputs(g.wall.slice(0, 10), f.h * 3600 + f.mi * 60, g.timeZone);
                    expect(out.startDateTime).toBe(g.iso);
                    expect(out.startEpochMs).toBe(Date.parse(g.iso));
                }
            });
            run('a timeline custom window keeps its wall start on a picked date', () => {
                for (const g of cases) {
                    const f = fields(g.wall);
                    const onOtherDay = toEpochMs(`2026-06-15T${g.wall.slice(11)}`, g.timeZone)!;
                    const w = { startMs: onOtherDay, endMs: onOtherDay + 30 * 60000 };
                    expect(customWindowOnDate(w, f.y, f.mo, f.d, g.timeZone).startMs).toBe(Date.parse(g.iso));
                }
            });
            run('shift ticks stay on the shift start', () => {
                for (const g of cases) {
                    const w = windowFor(toEpochMs(g.wall.slice(0, 10), g.timeZone)!, 'shift', g.timeZone);
                    const start = g.wall.slice(11, 16);
                    const { lower } = buildTicks(w, 'shift', g.timeZone, 'en-US', [{ label: 'A', start }]);
                    expect(lower.map((t) => t.ms)).toEqual([Date.parse(g.iso)]);
                }
            });
        });

        describe('timeline windows', () => {
            it('a midnight in a gap starts the day at its first real instant (Havana)', () => {
                const zone = 'America/Havana';
                const first = Date.parse('2026-03-08T01:00:00-04:00');
                const noon = Date.parse('2026-03-08T12:00:00-04:00');
                expect(zoneMidnightMs(noon, zone)).toBe(first);
                const w = windowFor(zoneMidnightMs(noon, zone), 'day', zone);
                expect(w.startMs).toBe(first);
                expect(w.endMs - w.startMs).toBe(23 * MS_PER_HOUR);
            });
            it('paging over a midnight gap neither sticks nor skips a day', () => {
                const zone = 'America/Havana';
                const sat = Date.parse('2026-03-07T00:00:00-05:00');
                const sun = pageAnchorMs(sat, 1, 'day', zone);
                expect(sun).toBe(Date.parse('2026-03-08T01:00:00-04:00'));
                const mon = pageAnchorMs(sun, 1, 'day', zone);
                expect(mon).toBe(Date.parse('2026-03-09T00:00:00-04:00'));
                expect(pageAnchorMs(mon, -1, 'day', zone)).toBe(sun);
                expect(pageAnchorMs(sun, -1, 'day', zone)).toBe(sat);
            });
            it('a shift starting in the gap ticks at the same real time east and west', () => {
                for (const [zone, date, iso] of [
                    ['America/New_York', '2026-03-08', '2026-03-08T03:30:00-04:00'],
                    ['Europe/Brussels', '2026-03-29', '2026-03-29T03:30:00+02:00']
                ]) {
                    const w = windowFor(toEpochMs(date, zone)!, 'shift', zone);
                    const { lower } = buildTicks(w, 'shift', zone, 'en-US', [{ label: 'A', start: '02:30' }]);
                    expect(lower.map((t) => t.ms)).toEqual([Date.parse(iso)]);
                }
            });
            it('a whole-hour custom window paged onto a gap ends forward of it', () => {
                const zone = 'America/New_York';
                const w = {
                    startMs: Date.parse('2026-03-07T02:30:00-05:00'),
                    endMs: Date.parse('2026-03-07T14:30:00-05:00')
                };
                const next = pageCustomWindow(w, 1, zone);
                expect(next.startMs).toBe(w.endMs);
                expect(next.endMs).toBe(Date.parse('2026-03-08T03:30:00-04:00'));
            });
        });

        describe('wallOfDay', () => {
            it('reads only the day from a date whose midnight may be in a gap', () => {
                expect(wallOfDay(parseDate('2026-03-08')!, 0)).toEqual({ y: 2026, mo: 3, d: 8, h: 0, mi: 0, s: 0 });
                expect(wallOfDay(parseDate('2026-03-29')!, 2 * 3600 + 30 * 60 + 5))
                    .toEqual({ y: 2026, mo: 3, d: 29, h: 2, mi: 30, s: 5 });
            });
        });
    });
}
