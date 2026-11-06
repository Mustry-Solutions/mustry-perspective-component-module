// #148: nothing here may depend on the browser's zone. Run once per process zone
// by the timezoneGaps.<zone>.test.ts files, the process zone playing the browser's.
import { fmtDate, todayInZone, zoneWallClock } from '../../shared/dateUtils';
import { gatewayTimeZone, managerTimeZone } from '../../shared/gatewayZone';
import { buildMonthGrid } from '../../shared/monthGrid';
import { nextOccurrence, sortHolidays, HolidayItem } from '../holiday/holidayLogic';
import { isActiveAt, normalizeSchedule, weekMomentInZone } from '../schedule/scheduleLogic';
import {
    containingAnchorMs, MS_PER_HOUR, pageAnchorMs, TIMELINE_ZOOMS, TimelineZoom, windowFor, zoomSpanMs, isSubDayZoom
} from '../timeline/timelineLogic';

const SUB_DAY: TimelineZoom[] = TIMELINE_ZOOMS.filter(isSubDayZoom);

// [zone, the instant of its 2026 fall-back, of its spring-forward]. New York and
// Brussels change at night, Havana across midnight, Santiago at the very end of
// the day, Lord Howe by half an hour.
const ZONES: Array<[string, string, string]> = [
    ['America/New_York', '2026-11-01T06:00:00Z', '2026-03-08T07:00:00Z'],
    ['Europe/Brussels', '2026-10-25T01:00:00Z', '2026-03-29T01:00:00Z'],
    ['America/Havana', '2026-11-01T05:00:00Z', '2026-03-08T05:00:00Z'],
    ['America/Santiago', '2026-04-05T03:00:00Z', '2026-09-06T04:00:00Z'],
    ['Australia/Lord_Howe', '2026-04-04T15:00:00Z', '2026-10-03T15:30:00Z']
];

const wallSeconds = (ms: number, zone: string): number => {
    const w = zoneWallClock(new Date(ms), zone);
    return w.h * 3600 + w.mi * 60 + w.s;
};

export function timezoneGapsSuite(processZone: string): void {
    it('runs in the zone it says it does', () => {
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(processZone);
    });

    describe.each(ZONES)('paging sub-day zooms in %s', (zone, fallIso, springIso) => {
        const offsetAt = (ms: number): number => {
            const w = zoneWallClock(new Date(ms), zone);
            return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
        };

        it('has its DST changes where this table says', () => {
            for (const iso of [fallIso, springIso]) {
                const at = Date.parse(iso);
                expect(offsetAt(at - 1000)).not.toBe(offsetAt(at));
            }
        });

        describe.each(SUB_DAY)('%s', (zoom) => {
            const stride = zoomSpanMs(zoom);

            // Up to 30 hours each way; the finest zooms stop at 180 pages (half an hour
            // at 'millisecond'), which still crosses the change.
            const pagesAround = (iso: string): number[] => {
                const reach = Math.min(Math.ceil(30 * MS_PER_HOUR / stride), 180);
                let a = containingAnchorMs(Date.parse(iso), zoom, zone);
                for (let i = 0; i < reach; i++) {
                    a = pageAnchorMs(a, -1, zoom, zone);
                }
                const pages = [a];
                for (let i = 0; i < reach * 2; i++) {
                    pages.push(pageAnchorMs(pages[pages.length - 1], 1, zoom, zone));
                }
                return pages;
            };

            it.each([['fall-back', fallIso], ['spring-forward', springIso]])('across %s', (_kind, iso) => {
                const pages = pagesAround(iso);
                expect(pages[0]).toBeLessThan(Date.parse(iso));
                expect(pages[pages.length - 1]).toBeGreaterThan(Date.parse(iso));
                for (let i = 1; i < pages.length; i++) {
                    const prev = pages[i - 1];
                    const page = pages[i];
                    // Never stuck, and never leaves a gap between windows.
                    expect(page).toBeGreaterThan(prev);
                    expect(windowFor(prev, zoom, zone).endMs).toBeGreaterThanOrEqual(page);
                    // Prev undoes next, and every page is one Today could land on.
                    expect(pageAnchorMs(page, -1, zoom, zone)).toBe(prev);
                    expect(containingAnchorMs(page, zoom, zone)).toBe(page);
                }
            });
        });

        it('hour zoom is on 00/08/16 the day after the change', () => {
            for (const iso of [fallIso, springIso]) {
                const dayOf = (ms: number): number => zoneWallClock(new Date(ms), zone).d;
                let a = containingAnchorMs(Date.parse(iso), 'hour', zone);
                const start = dayOf(a);
                while (dayOf(a) === start) {
                    a = pageAnchorMs(a, 1, 'hour', zone);
                }
                const b = pageAnchorMs(a, 1, 'hour', zone);
                const c = pageAnchorMs(b, 1, 'hour', zone);
                expect([a, b, c].map((ms) => wallSeconds(ms, zone) / 3600)).toEqual([0, 8, 16]);
            }
        });

        // Their strides divide the change, so the wall grid survives it. Sampled every
        // half hour around it: every page there would be thousands of calls.
        it.each([['minute', 1800, 14], ['second', 120, 3], ['millisecond', 10, 3]] as Array<[TimelineZoom, number, number]>)(
            '%s zoom stays on its wall-clock grid through the change', (zoom, gridSeconds, hours) => {
                for (const iso of [fallIso, springIso]) {
                    const at = Date.parse(iso);
                    const sample = Math.floor(MS_PER_HOUR / zoomSpanMs(zoom) / 2);
                    let a = containingAnchorMs(at - hours * MS_PER_HOUR, zoom, zone);
                    while (a < at + hours * MS_PER_HOUR) {
                        expect(wallSeconds(a, zone) % gridSeconds).toBe(0);
                        a = pageAnchorMs(a, sample, zoom, zone);
                    }
                }
            });
    });

    describe('Schedule Manager "now"', () => {
        const dayShift = normalizeSchedule({ name: 'Days', wednesday: true, wednesdayTime: '8:00-17:00' });
        const tenUtc = new Date('2026-06-17T10:00:00Z');   // a Wednesday

        it('reads the week day and minute in the given zone', () => {
            expect(weekMomentInZone('UTC', tenUtc)).toEqual({ dayIndex: 2, minute: 600 });
            expect(weekMomentInZone('America/Chicago', tenUtc)).toEqual({ dayIndex: 2, minute: 300 });
            // Tokyo has rolled over to Thursday by 15:00 UTC.
            expect(weekMomentInZone('Asia/Tokyo', new Date('2026-06-17T15:00:00Z'))).toEqual({ dayIndex: 3, minute: 0 });
        });

        it('makes isActiveAt answer for that zone, whatever the process zone', () => {
            const at = (zone: string): boolean => {
                const { dayIndex, minute } = weekMomentInZone(zone, tenUtc);
                return isActiveAt(dayShift, dayIndex, minute);
            };
            expect(at('UTC')).toBe(true);           // 10:00
            expect(at('America/Chicago')).toBe(false);   // 05:00
            expect(at('Asia/Tokyo')).toBe(false);   // 19:00
        });

        // Going through a local Date, as todayInZone may, would turn each of these
        // 02:30s into 03:30 in the process zone that has that gap.
        it.each([
            ['Europe/Brussels', '2026-03-08T01:30:00Z', 150],    // the gap in New York
            ['America/New_York', '2026-03-29T06:30:00Z', 150]    // the gap in Brussels
        ])('keeps the wall time in %s through the browser\'s own DST gap', (zone, iso, minute) => {
            expect(weekMomentInZone(zone, new Date(iso)).minute).toBe(minute);
        });

        it('an empty or unknown zone reads as the process zone instead of throwing', () => {
            const d = new Date('2026-06-17T10:00:00Z');
            const local = { dayIndex: (d.getDay() + 6) % 7, minute: d.getHours() * 60 + d.getMinutes() };
            expect(weekMomentInZone('', d)).toEqual(local);
            expect(weekMomentInZone('Not/AZone', d)).toEqual(local);
        });
    });

    describe('Holiday Manager "today"', () => {
        const eve: HolidayItem = { name: 'Plant day', date: '2026-06-17', repeatAnnually: false } as HolidayItem;
        const later: HolidayItem = { name: 'Later', date: '2026-08-01', repeatAnnually: false } as HolidayItem;
        const today = (zone: string, iso: string): string => fmtDate(todayInZone(zone, new Date(iso)));

        it('a one-off goes past at midnight in the given zone', () => {
            const iso = '2026-06-18T02:00:00Z';
            expect(today('America/Chicago', iso)).toBe('2026-06-17');
            expect(today('Asia/Tokyo', iso)).toBe('2026-06-18');
            expect(nextOccurrence(eve, today('America/Chicago', iso))).toBe('2026-06-17');
            expect(nextOccurrence(eve, today('Asia/Tokyo', iso))).toBeNull();
            expect(sortHolidays([later, eve], today('America/Chicago', iso))[0].name).toBe('Plant day');
            expect(sortHolidays([later, eve], today('Asia/Tokyo', iso))[0].name).toBe('Later');
        });
    });

    describe('the mini nav\'s today', () => {
        it('highlights the host zone\'s date', () => {
            const instant = new Date('2026-06-17T12:00:00Z');
            const highlighted = (zone: string): string[] => buildMonthGrid(new Date(2026, 5, 1), 1, true, todayInZone(zone, instant))
                .weeks.flat().filter((c) => c.isToday).map((c) => c.iso);
            expect(highlighted('Pacific/Kiritimati')).toEqual(['2026-06-18']);
            expect(highlighted('Pacific/Pago_Pago')).toEqual(['2026-06-17']);
        });
    });

    describe('the gateway zone', () => {
        const storeWith = (read: (path: string) => unknown) => ({ view: { page: { sessionProps: { read } } } });
        const chicago = storeWith((path) => (path === 'gateway.timezone.id' ? 'America/Chicago' : undefined));

        it('comes from session.props.gateway.timezone.id', () => {
            expect(gatewayTimeZone(chicago)).toBe('America/Chicago');
        });

        it('reads as empty when the session can\'t report it', () => {
            expect(gatewayTimeZone({ view: { page: {} } })).toBe('');
            expect(gatewayTimeZone(storeWith(() => undefined))).toBe('');
            expect(gatewayTimeZone(storeWith(() => { throw new Error('no tree'); }))).toBe('');
        });

        it('config.timezone wins, else the gateway zone', () => {
            expect(managerTimeZone('Asia/Tokyo', chicago)).toBe('Asia/Tokyo');
            expect(managerTimeZone('', chicago)).toBe('America/Chicago');
            expect(managerTimeZone('', { view: { page: {} } })).toBe('');
        });
    });
}
