import {
    buildMonthGrid, eventDays, groupEventsByDay, layoutWeekSegments, clampWeekLanes,
    weekDays, timeMinutes, isTimed, layoutDayEvents,
    snapMinutes, minuteFromOffset, isoDateTime, eventsToCsv,
    backgroundBandsForDay, CalEvent
} from '../calendarLogic';
import { expandEvents } from '../../shared/recurrence';

const td = new Date(2026, 5, 17); // fixed "today": Wed 2026-06-17 (Jun 1 2026 is a Monday)

describe('buildMonthGrid', () => {
    it('Monday-first June 2026 starts on Jun 1, spans 6 weeks', () => {
        const g = buildMonthGrid(new Date(2026, 5, 10), true, true, td);
        expect(g.weeks.length).toBe(6);
        expect(g.weeks[0].length).toBe(7);
        expect(g.weeks[0][0].iso).toBe('2026-06-01');
        expect(g.visibleStart).toBe('2026-06-01');
        expect(g.visibleEnd).toBe('2026-07-13'); // 42 days from Jun 1
        expect(g.weeks[5][6].iso).toBe('2026-07-12');
    });

    it('Sunday-first shifts the grid start back to the prior Sunday', () => {
        const g = buildMonthGrid(new Date(2026, 5, 10), false, true, td);
        expect(g.weeks[0][0].iso).toBe('2026-05-31');
        expect(g.visibleStart).toBe('2026-05-31');
    });

    it('flags inMonth / today / weekend correctly', () => {
        const g = buildMonthGrid(new Date(2026, 5, 10), true, true, td);
        const all = g.weeks.flat();
        expect(all.find((c) => c.iso === '2026-06-17')!.isToday).toBe(true);
        expect(all.find((c) => c.iso === '2026-06-01')!.inMonth).toBe(true);
        expect(all.find((c) => c.iso === '2026-07-12')!.inMonth).toBe(false);
        expect(all.find((c) => c.iso === '2026-06-06')!.isWeekend).toBe(true); // a Saturday
    });

    it('hides weekends when showWeekends is false (5-day weeks)', () => {
        const g = buildMonthGrid(new Date(2026, 5, 10), true, false, td);
        expect(g.weeks[0].length).toBe(5);
        expect(g.weeks.flat().every((c) => !c.isWeekend)).toBe(true);
    });
});

describe('eventDays', () => {
    it('single day for a dated event', () => {
        expect(eventDays({ id: '1', title: 'A', start: '2026-06-10' })).toEqual(['2026-06-10']);
    });

    it('uses only the start day for a timed event', () => {
        expect(eventDays({ id: '1', title: 'A', start: '2026-06-10T09:30:00' })).toEqual(['2026-06-10']);
    });

    it('all-day multi-day spans with an exclusive end', () => {
        expect(eventDays({ id: '1', title: 'A', start: '2026-06-10', end: '2026-06-13', allDay: true }))
            .toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
    });

    it('empty for a missing/invalid start', () => {
        expect(eventDays({ id: '1', title: 'A', start: '' })).toEqual([]);
    });
});

describe('groupEventsByDay', () => {
    const events: CalEvent[] = [
        { id: 'b', title: 'Bravo', start: '2026-06-10T10:00:00' },
        { id: 'a', title: 'Alpha', start: '2026-06-10T08:00:00' },
        { id: 'm', title: 'Multi', start: '2026-06-10', end: '2026-06-12', allDay: true }
    ];

    it('buckets by day and sorts each day by start then title', () => {
        const g = groupEventsByDay(events);
        expect(g['2026-06-10'].map((e) => e.id)).toEqual(['m', 'a', 'b']); // 'm' start is the bare date (earliest)
        expect(g['2026-06-11'].map((e) => e.id)).toEqual(['m']);
        expect(g['2026-06-12']).toBeUndefined(); // exclusive end
    });

    it('skips malformed events', () => {
        const g = groupEventsByDay([{ id: 'x', title: 'X', start: '' }]);
        expect(Object.keys(g)).toHaveLength(0);
    });
});

describe('layoutWeekSegments / clampWeekLanes', () => {
    // Mon 2026-06-22 .. Sun 2026-06-28
    const week = ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'];

    it('a single-day event is a one-column bar', () => {
        const segs = layoutWeekSegments(week, [{ id: 'a', title: 'a', start: '2026-06-24' }]);
        expect(segs[0]).toMatchObject({ startCol: 2, endCol: 2, lane: 0, continuesLeft: false, continuesRight: false });
    });

    it('a multi-day all-day event spans columns (exclusive end)', () => {
        // 22 -> 25 exclusive = 22,23,24
        const segs = layoutWeekSegments(week, [{ id: 'm', title: 'm', start: '2026-06-22', end: '2026-06-25', allDay: true }]);
        expect(segs[0]).toMatchObject({ startCol: 0, endCol: 2, continuesLeft: false, continuesRight: false });
    });

    it('marks continuesLeft/Right when the event overflows the week', () => {
        const segs = layoutWeekSegments(week, [{ id: 'x', title: 'x', start: '2026-06-20', end: '2026-07-02', allDay: true }]);
        expect(segs[0]).toMatchObject({ startCol: 0, endCol: 6, continuesLeft: true, continuesRight: true });
    });

    it('overlapping spans get separate lanes; longer span on top', () => {
        const segs = layoutWeekSegments(week, [
            { id: 'long', title: 'long', start: '2026-06-23', end: '2026-06-26', allDay: true }, // 23,24,25
            { id: 'short', title: 'short', start: '2026-06-24', allDay: true }                    // 24
        ]);
        expect(segs.find((s) => s.event.id === 'long')!.lane).toBe(0);
        expect(segs.find((s) => s.event.id === 'short')!.lane).toBe(1);
    });

    it('reuses a lane when spans do not overlap in columns', () => {
        const segs = layoutWeekSegments(week, [
            { id: 'a', title: 'a', start: '2026-06-22', end: '2026-06-24', allDay: true }, // 22,23
            { id: 'b', title: 'b', start: '2026-06-25', end: '2026-06-27', allDay: true }  // 25,26
        ]);
        expect(segs.every((s) => s.lane === 0)).toBe(true);
    });

    it('clampWeekLanes reserves the last lane for "+N more" and counts per day', () => {
        const segs = layoutWeekSegments(week, [
            { id: 'a', title: 'a', start: '2026-06-24', allDay: true },
            { id: 'b', title: 'b', start: '2026-06-24', allDay: true },
            { id: 'c', title: 'c', start: '2026-06-24', allDay: true }
        ]);
        const { visible, more } = clampWeekLanes(segs, 7, 2);   // cap 2 -> 1 visible lane + a more row
        expect(visible).toHaveLength(1);
        expect(more[2]).toBe(2);   // Wed (col 2) hides 2
    });

    it('clampWeekLanes shows all when within capacity', () => {
        const segs = layoutWeekSegments(week, [{ id: 'a', title: 'a', start: '2026-06-24' }]);
        const { visible, more } = clampWeekLanes(segs, 3, 3);
        expect(visible).toHaveLength(1);
        expect(more.every((n) => n === 0)).toBe(true);
    });
});

describe('weekDays', () => {
    it('Monday-first week of Wed 2026-06-24 is Mon 22 .. Sun 28', () => {
        const cols = weekDays(new Date(2026, 5, 24), true, true, td);
        expect(cols.map((c) => c.iso)).toEqual([
            '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'
        ]);
    });

    it('hides weekends -> Mon..Fri', () => {
        const cols = weekDays(new Date(2026, 5, 24), true, false, td);
        expect(cols.map((c) => c.iso)).toEqual([
            '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26'
        ]);
    });
});

describe('timeMinutes / isTimed', () => {
    it('parses the time part', () => {
        expect(timeMinutes('2026-06-10T09:30:00')).toBe(570);
        expect(timeMinutes('2026-06-10')).toBeNull();
    });
    it('classifies timed vs all-day', () => {
        expect(isTimed({ id: '1', title: 'A', start: '2026-06-10T09:00:00' })).toBe(true);
        expect(isTimed({ id: '1', title: 'A', start: '2026-06-10' })).toBe(false);
        expect(isTimed({ id: '1', title: 'A', start: '2026-06-10T09:00:00', allDay: true })).toBe(false);
    });
});

describe('layoutDayEvents (overlap packing)', () => {
    const day = '2026-06-24';
    const ev = (id: string, s: string, e?: string): CalEvent => ({ id, title: id, start: `${day}T${s}`, end: e ? `${day}T${e}` : undefined });
    const lay = (evs: CalEvent[]) => layoutDayEvents(evs, day, 0, 1440, 30);

    it('non-overlapping events each get a single lane', () => {
        const r = lay([ev('a', '09:00', '10:00'), ev('b', '11:00', '12:00')]);
        expect(r.map((x) => [x.event.id, x.lane, x.lanes])).toEqual([['a', 0, 1], ['b', 0, 1]]);
    });

    it('two overlapping events split into two lanes', () => {
        const r = lay([ev('a', '09:00', '10:30'), ev('b', '10:00', '11:00')]);
        expect(r.find((x) => x.event.id === 'a')).toMatchObject({ lane: 0, lanes: 2 });
        expect(r.find((x) => x.event.id === 'b')).toMatchObject({ lane: 1, lanes: 2 });
    });

    it('transitive overlap forms one cluster; a freed lane is reused', () => {
        // c[0-30] & a[0-60] overlap; b[30-90] overlaps a -> all one cluster, 2 lanes
        const r = lay([ev('a', '00:00', '01:00'), ev('b', '00:30', '01:30'), ev('c', '00:00', '00:30')]);
        expect(r.every((x) => x.lanes === 2)).toBe(true);
        const b = r.find((x) => x.event.id === 'b')!;
        const c = r.find((x) => x.event.id === 'c')!;
        expect(b.lane).toBe(c.lane); // b reuses c's lane after c ends
    });

    it('uses the default duration when an event has no end', () => {
        const r = layoutDayEvents([ev('a', '09:00')], day, 0, 1440, 45);
        expect(r[0]).toMatchObject({ startMin: 540, endMin: 585 });
    });

    it('clamps to the window and drops events outside it', () => {
        const r = layoutDayEvents([ev('a', '06:00', '10:00'), ev('z', '23:00', '23:30')], day, 8 * 60, 18 * 60, 30);
        expect(r.map((x) => x.event.id)).toEqual(['a']); // 'z' is outside 08:00-18:00
        expect(r[0].startMin).toBe(8 * 60); // clamped from 06:00 to the window start
    });

    it('ignores all-day events', () => {
        const r = lay([{ id: 'all', title: 'all', start: day, allDay: true }, ev('a', '09:00', '10:00')]);
        expect(r.map((x) => x.event.id)).toEqual(['a']);
    });

    describe('timed multi-day segments', () => {
        // overnight: 2026-06-24 22:00 -> 2026-06-25 06:00
        const overnight: CalEvent = { id: 'on', title: 'on', start: '2026-06-24T22:00', end: '2026-06-25T06:00' };

        it('start day: from start to the window end, marked continuesDown', () => {
            const r = layoutDayEvents([overnight], '2026-06-24', 0, 1440, 30);
            expect(r[0]).toMatchObject({ startMin: 22 * 60, endMin: 1440, continuesDown: true });
            expect(r[0].continuesUp).toBeFalsy();
        });

        it('end day: from the window start to the end time, marked continuesUp', () => {
            const r = layoutDayEvents([overnight], '2026-06-25', 0, 1440, 30);
            expect(r[0]).toMatchObject({ startMin: 0, endMin: 6 * 60, continuesUp: true });
            expect(r[0].continuesDown).toBeFalsy();
        });

        it('middle day: spans the whole window, continues both ways', () => {
            const threeDay: CalEvent = { id: '3', title: '3', start: '2026-06-24T10:00', end: '2026-06-26T11:00' };
            const r = layoutDayEvents([threeDay], '2026-06-25', 0, 1440, 30);
            expect(r[0]).toMatchObject({ startMin: 0, endMin: 1440, continuesUp: true, continuesDown: true });
        });

        it('does not render on days outside the span', () => {
            expect(layoutDayEvents([overnight], '2026-06-26', 0, 1440, 30)).toHaveLength(0);
            expect(layoutDayEvents([overnight], '2026-06-23', 0, 1440, 30)).toHaveLength(0);
        });

        it('skips the end day when the event ends exactly at midnight', () => {
            const tilMidnight: CalEvent = { id: 'm', title: 'm', start: '2026-06-24T20:00', end: '2026-06-25T00:00' };
            expect(layoutDayEvents([tilMidnight], '2026-06-25', 0, 1440, 30)).toHaveLength(0);
            expect(layoutDayEvents([tilMidnight], '2026-06-24', 0, 1440, 30)[0]).toMatchObject({ endMin: 1440, continuesDown: true });
        });
    });
});

describe('editing gesture math', () => {
    it('snapMinutes rounds to the nearest step', () => {
        expect(snapMinutes(7, 15)).toBe(0);
        expect(snapMinutes(8, 15)).toBe(15);
        expect(snapMinutes(547, 15)).toBe(540);
        expect(snapMinutes(548, 15)).toBe(555);
    });

    it('minuteFromOffset maps pixels to snapped, clamped minutes', () => {
        // 42px/hour, window 0..1440, snap 15
        expect(minuteFromOffset(0, 42, 0, 1440, 15)).toBe(0);
        expect(minuteFromOffset(42, 42, 0, 1440, 15)).toBe(60);     // one hour down
        expect(minuteFromOffset(63, 42, 0, 1440, 15)).toBe(90);     // 1.5h
        expect(minuteFromOffset(-100, 42, 0, 1440, 15)).toBe(0);    // clamped to window start
        expect(minuteFromOffset(99999, 42, 0, 1440, 15)).toBe(1440); // clamped to window end
    });

    it('minuteFromOffset respects a non-zero window start', () => {
        // window 8:00..18:00; offset 0 is the top = 480 min
        expect(minuteFromOffset(0, 42, 480, 1080, 15)).toBe(480);
        expect(minuteFromOffset(42, 42, 480, 1080, 15)).toBe(540);
    });

    it('isoDateTime builds a zero-padded ISO datetime', () => {
        expect(isoDateTime('2026-06-24', 540)).toBe('2026-06-24T09:00:00');
        expect(isoDateTime('2026-06-24', 9 * 60 + 5)).toBe('2026-06-24T09:05:00');
        expect(isoDateTime('2026-06-24', 0)).toBe('2026-06-24T00:00:00');
    });
});

describe('backgroundBandsForDay', () => {
    it('returns timed background events as clamped bands, excludes normal events', () => {
        const events: CalEvent[] = [
            { id: 'dt', title: 'Downtime', start: '2026-06-24T02:00:00', end: '2026-06-24T04:00:00', color: '#fee', display: 'background' },
            { id: 'n', title: 'Normal', start: '2026-06-24T09:00:00' }
        ];
        const bands = backgroundBandsForDay(events, '2026-06-24', 0, 1440);
        expect(bands).toEqual([{ id: 'dt', startMin: 120, endMin: 240, color: '#fee' }]);
    });

    it('excludes background events from the packed layout', () => {
        const events: CalEvent[] = [
            { id: 'dt', title: 'Downtime', start: '2026-06-24T02:00:00', end: '2026-06-24T04:00:00', display: 'background' }
        ];
        expect(layoutDayEvents(events, '2026-06-24', 0, 1440, 30)).toEqual([]);
    });
});

describe('expandEvents (recurrence)', () => {
    const win = (a: string, b: string) => [new Date(a + 'T00:00:00'), new Date(b + 'T00:00:00')] as [Date, Date];

    it('passes through non-recurring events unchanged', () => {
        const e: CalEvent = { id: '1', title: 'One', start: '2026-06-10T09:00:00' };
        const [s, en] = win('2026-06-01', '2026-07-01');
        expect(expandEvents([e], s, en)).toEqual([e]);
    });

    it('daily with interval + count preserves the time of day', () => {
        const e: CalEvent = { id: 'd', title: 'Daily', start: '2026-06-01T09:00:00', end: '2026-06-01T09:30:00', rrule: { freq: 'daily', interval: 2, count: 3 } };
        const [s, en] = win('2026-06-01', '2026-07-01');
        const occ = expandEvents([e], s, en);
        expect(occ.map((o) => o.start)).toEqual(['2026-06-01T09:00:00', '2026-06-03T09:00:00', '2026-06-05T09:00:00']);
        expect(occ.map((o) => o.end)).toEqual(['2026-06-01T09:30:00', '2026-06-03T09:30:00', '2026-06-05T09:30:00']);
        expect(occ.every((o) => o.rrule === undefined)).toBe(true);
        expect(new Set(occ.map((o) => o.id)).size).toBe(3); // unique per occurrence
    });

    it('weekly byweekday emits each listed weekday', () => {
        // base Mon 2026-06-01; Mondays(1) and Wednesdays(3)
        const e: CalEvent = { id: 'w', title: 'WK', start: '2026-06-01', allDay: true, rrule: { freq: 'weekly', byweekday: [1, 3], until: '2026-06-14' } };
        const [s, en] = win('2026-06-01', '2026-07-01');
        expect(expandEvents([e], s, en).map((o) => o.start)).toEqual([
            '2026-06-01', '2026-06-03', '2026-06-08', '2026-06-10'
        ]); // Mon/Wed of weeks 1 & 2, stopped by until 06-14
    });

    it('monthly keeps the day-of-month and respects until', () => {
        const e: CalEvent = { id: 'm', title: 'M', start: '2026-01-15', allDay: true, rrule: { freq: 'monthly', until: '2026-04-30' } };
        const [s, en] = win('2026-01-01', '2027-01-01');
        expect(expandEvents([e], s, en).map((o) => o.start)).toEqual([
            '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'
        ]);
    });

    it('only emits occurrences inside the window', () => {
        const e: CalEvent = { id: 'd', title: 'D', start: '2026-06-01', allDay: true, rrule: { freq: 'daily' } };
        const [s, en] = win('2026-06-10', '2026-06-13');
        expect(expandEvents([e], s, en).map((o) => o.start)).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
    });

    it('yearly keeps the month/day and respects interval', () => {
        const e: CalEvent = { id: 'y', title: 'Y', start: '2026-03-04', allDay: true, rrule: { freq: 'yearly', count: 3 } };
        const [s, en] = win('2026-01-01', '2031-01-01');
        expect(expandEvents([e], s, en).map((o) => o.start)).toEqual(['2026-03-04', '2027-03-04', '2028-03-04']);
    });

    it('yearly on Feb 29 skips common years', () => {
        const e: CalEvent = { id: 'leap', title: 'Leap', start: '2024-02-29', allDay: true, rrule: { freq: 'yearly', count: 2 } };
        const [s, en] = win('2024-01-01', '2033-01-01');
        // next Feb-29 after 2024 is 2028 (2025-2027 are skipped)
        expect(expandEvents([e], s, en).map((o) => o.start)).toEqual(['2024-02-29', '2028-02-29']);
    });

    it('an unbounded daily series still renders far past the MAX_OCC horizon', () => {
        // ~9 years out — well over MAX_OCC (1000) days from the base; the old from-base
        // generator would cap out before reaching the window and the event would vanish.
        const e: CalEvent = { id: 'd', title: 'D', start: '2026-01-01', allDay: true, rrule: { freq: 'daily' } };
        const [s, en] = win('2035-06-01', '2035-06-04');
        expect(expandEvents([e], s, en).map((o) => o.start)).toEqual(['2035-06-01', '2035-06-02', '2035-06-03']);
    });

    it('an unbounded weekly series stays on its weekday far in the future', () => {
        const e: CalEvent = { id: 'w', title: 'W', start: '2026-01-05', allDay: true, rrule: { freq: 'weekly' } }; // Mon
        const [s, en] = win('2033-01-01', '2033-02-01');
        const days = expandEvents([e], s, en).map((o) => o.start);
        expect(days.length).toBeGreaterThan(0);
        days.forEach((ds) => expect(new Date(ds + 'T00:00:00').getDay()).toBe(1)); // all Mondays
    });

    it('an unbounded monthly series renders far in the future on the same day-of-month', () => {
        const e: CalEvent = { id: 'm', title: 'M', start: '2026-01-15', allDay: true, rrule: { freq: 'monthly' } };
        const [s, en] = win('2040-03-01', '2040-04-01');
        expect(expandEvents([e], s, en).map((o) => o.start)).toEqual(['2040-03-15']);
    });

    it('exdate removes the listed occurrences (and does not extend a count series)', () => {
        const e: CalEvent = {
            id: 'd', title: 'D', start: '2026-06-01', allDay: true,
            rrule: { freq: 'daily', count: 4, exdate: ['2026-06-02', '2026-06-03'] }
        };
        const [s, en] = win('2026-06-01', '2026-06-30');
        // count=4 generates Jun 1..4; exdate removes 2 and 3 -> only 1 and 4 remain
        expect(expandEvents([e], s, en).map((o) => o.start)).toEqual(['2026-06-01', '2026-06-04']);
    });
});

describe('eventsToCsv', () => {
    it('emits a header and one row per event', () => {
        const csv = eventsToCsv([
            { id: '1', title: 'Standup', start: '2026-06-24T09:00', end: '2026-06-24T09:30', category: 'meeting' },
            { id: '2', title: 'Lunch', start: '2026-06-24T12:00', allDay: false, status: 'done' }
        ]);
        const lines = csv.split('\r\n');
        expect(lines[0]).toBe('id,title,start,end,allDay,category,status,color,description,rrule');
        expect(lines[1]).toBe('1,Standup,2026-06-24T09:00,2026-06-24T09:30,false,meeting,,,,');
        expect(lines[2]).toBe('2,Lunch,2026-06-24T12:00,,false,,done,,,');
        expect(lines).toHaveLength(3);
    });

    it('quotes and escapes cells with commas, quotes, or newlines', () => {
        const csv = eventsToCsv([
            { id: '1', title: 'A, B', start: 's', description: 'has "quotes"\nand newline' }
        ]);
        const row = csv.split('\r\n')[1];
        expect(row).toContain('"A, B"');
        expect(row).toContain('"has ""quotes""\nand newline"');
    });

    it('serialises rrule as JSON and handles an empty list', () => {
        expect(eventsToCsv([]).split('\r\n')).toHaveLength(1);   // header only
        const csv = eventsToCsv([{ id: '1', title: 'R', start: 's', rrule: { freq: 'daily', count: 3 } }]);
        expect(csv.split('\r\n')[1]).toContain('"{""freq"":""daily"",""count"":3}"');
    });
});
