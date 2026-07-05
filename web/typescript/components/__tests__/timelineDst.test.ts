// DST regression tests for the timeline's window/paging/tick math and the
// shared instant emitter, pinned on the 2026 US transitions in America/Chicago:
// spring-forward Sun 2026-03-08 (23h day), fall-back Sun 2026-11-01 (25h day).
import { msToZonedIso, toEpochMs } from '../../shared/dateUtils';
import { expandEvents } from '../../shared/recurrence';
import {
    buildTicks, MS_PER_HOUR, pageAnchorMs, windowFor, zoneMidnightMs
} from '../timeline/timelineLogic';

const CHI = 'America/Chicago';
const t = (s: string): number => toEpochMs(s, CHI)!;

describe('zoneMidnightMs', () => {
    it('walks wall-calendar days across both DST seams', () => {
        expect(zoneMidnightMs(t('2026-03-08T12:00:00'), CHI)).toBe(t('2026-03-08T00:00:00'));
        expect(zoneMidnightMs(t('2026-03-08T00:00:00'), CHI, 1)).toBe(t('2026-03-09T00:00:00'));
        expect(zoneMidnightMs(t('2026-11-01T00:00:00'), CHI, 1)).toBe(t('2026-11-02T00:00:00'));
    });
});

describe('windowFor', () => {
    it('day windows span the real wall day: 23h on spring-forward, 25h on fall-back', () => {
        const spring = windowFor(t('2026-03-08T00:00:00'), 'day', CHI);
        expect(spring.endMs - spring.startMs).toBe(23 * MS_PER_HOUR);
        const fall = windowFor(t('2026-11-01T00:00:00'), 'day', CHI);
        expect(fall.endMs - fall.startMs).toBe(25 * MS_PER_HOUR);
        const plain = windowFor(t('2026-07-03T00:00:00'), 'day', CHI);
        expect(plain.endMs - plain.startMs).toBe(24 * MS_PER_HOUR);
    });
    it('a week window containing a DST day is 167h / 169h, ending on a midnight', () => {
        const spring = windowFor(t('2026-03-02T00:00:00'), 'week', CHI);   // Mon, contains Mar 8
        expect(spring.endMs - spring.startMs).toBe(167 * MS_PER_HOUR);
        expect(spring.endMs).toBe(t('2026-03-09T00:00:00'));
        const fall = windowFor(t('2026-10-26T00:00:00'), 'week', CHI);     // Mon, contains Nov 1
        expect(fall.endMs - fall.startMs).toBe(169 * MS_PER_HOUR);
        expect(fall.endMs).toBe(t('2026-11-02T00:00:00'));
    });
    it('hour windows stay a plain epoch span', () => {
        const w = windowFor(t('2026-03-08T00:00:00'), 'hour', CHI);
        expect(w.endMs - w.startMs).toBe(8 * MS_PER_HOUR);
    });
});

describe('pageAnchorMs', () => {
    it('paging a day across a seam lands on the next real midnight, and back', () => {
        const springDay = t('2026-03-08T00:00:00');
        const next = pageAnchorMs(springDay, 1, 'day', CHI);
        expect(next).toBe(t('2026-03-09T00:00:00'));
        expect(pageAnchorMs(next, -1, 'day', CHI)).toBe(springDay);
    });
    it('week paging never drifts off midnight even after crossing both seams', () => {
        let a = t('2026-02-23T00:00:00');   // Monday before spring-forward
        for (let i = 0; i < 40; i++) {      // ~9 months of Next, over both transitions
            a = pageAnchorMs(a, 1, 'week', CHI);
            expect(zoneMidnightMs(a, CHI)).toBe(a);   // still exactly a zone midnight
        }
        expect(a).toBe(t('2026-11-30T00:00:00'));     // 40 calendar weeks later
    });
    it('hour zoom pages by pure epoch time', () => {
        const a = t('2026-03-07T22:00:00');
        expect(pageAnchorMs(a, 1, 'hour', CHI)).toBe(a + 8 * MS_PER_HOUR);
    });
});

describe('buildTicks across DST', () => {
    it('spring-forward day: 23 hourly ticks, 02:00 skipped, px stays epoch-true', () => {
        const w = windowFor(t('2026-03-08T00:00:00'), 'day', CHI);
        const { upper, lower } = buildTicks(w, 'day', CHI, 'en-US');
        expect(upper).toHaveLength(1);
        expect(upper[0].px).toBe(0);
        expect(lower).toHaveLength(23);
        expect(lower[2].px).toBe(2 * w.pxPerHour);          // third tick 2h in...
        expect(lower[2].label).toContain('03');             // ...is 03:00 (02:00 doesn't exist)
    });
    it('fall-back day: 25 hourly ticks with 01:00 appearing twice', () => {
        const w = windowFor(t('2026-11-01T00:00:00'), 'day', CHI);
        const { lower } = buildTicks(w, 'day', CHI, 'en-US');
        expect(lower).toHaveLength(25);
        expect(lower[1].label).toBe(lower[2].label);        // both wall 01:00
        expect(lower[2].px - lower[1].px).toBe(w.pxPerHour);
    });
    it('week ticks land upper marks on every real midnight', () => {
        const w = windowFor(t('2026-03-02T00:00:00'), 'week', CHI);
        const { upper } = buildTicks(w, 'week', CHI, 'en-US');
        expect(upper).toHaveLength(7);
        // Mar 8 is 23h wide: the Mar 9 midnight would be beyond the window; the
        // last tick (Mar 8) sits 6*24h minus nothing — days before the seam are 24h.
        expect(upper[6].ms).toBe(t('2026-03-08T00:00:00'));
        expect(upper[6].px).toBe(6 * 24 * w.pxPerHour);
    });
});

describe('recurrence normalization of absolute-instant bases', () => {
    it('an offset/Z base recurs by zone wall clock, DST-correct', () => {
        // 2026-03-07T14:00Z = 08:00 CST in Chicago, the day before spring-forward.
        const series = {
            id: 's', start: '2026-03-07T14:00:00Z', end: '2026-03-07T16:00:00Z',
            rrule: { freq: 'daily' as const }
        };
        const occ = expandEvents([series], new Date(2026, 2, 6), new Date(2026, 2, 10), CHI);
        expect(occ.map((o) => o.start)).toEqual([
            '2026-03-07T08:00:00', '2026-03-08T08:00:00', '2026-03-09T08:00:00'
        ]);
        expect(occ[0].end).toBe('2026-03-07T10:00:00');
        // Same WALL time on both sides of the seam = 23h apart on the epoch.
        expect(toEpochMs(occ[1].start, CHI)! - toEpochMs(occ[0].start, CHI)!).toBe(23 * MS_PER_HOUR);
        // No occurrence carries the base's offset glued onto a new date.
        expect(occ.some((o) => /Z|[+-]\d\d:\d\d$/.test(o.start))).toBe(false);
    });

    it('naive and date-only bases pass through the default (no-zone) path unchanged', () => {
        const naive = { id: 'n', start: '2026-06-10T09:00:00', rrule: { freq: 'daily' as const } };
        const occ = expandEvents([naive], new Date(2026, 5, 10), new Date(2026, 5, 12));
        expect(occ.map((o) => o.start)).toEqual(['2026-06-10T09:00:00', '2026-06-11T09:00:00']);
    });
});

describe('msToZonedIso in the ambiguous fall-back hour', () => {
    it('emits the offset of the instant, so both 01:30s stay distinct', () => {
        const early = Date.UTC(2026, 10, 1, 6, 30);   // 01:30 CDT
        const late = Date.UTC(2026, 10, 1, 7, 30);    // 01:30 CST, one hour later
        expect(msToZonedIso(early, CHI)).toBe('2026-11-01T01:30:00-05:00');
        expect(msToZonedIso(late, CHI)).toBe('2026-11-01T01:30:00-06:00');
        // round-trip: the emitted string identifies the exact instant
        expect(new Date(msToZonedIso(early, CHI)).getTime()).toBe(early);
        expect(new Date(msToZonedIso(late, CHI)).getTime()).toBe(late);
    });
    it('spring-forward instants emit the post-transition offset', () => {
        const ms = Date.UTC(2026, 2, 8, 8, 30);   // 03:30 CDT (02:30 doesn't exist)
        expect(msToZonedIso(ms, CHI)).toBe('2026-03-08T03:30:00-05:00');
    });
});
