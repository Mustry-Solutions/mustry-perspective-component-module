import {
    buildMonthGrid, eventDays, groupEventsByDay, splitForDay,
    weekDays, timeMinutes, isTimed, layoutDayEvents, allDayEventsForDay,
    snapMinutes, minuteFromOffset, isoDateTime, CalEvent
} from '../calendarLogic';

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

describe('splitForDay', () => {
    const mk = (n: number): CalEvent[] =>
        Array.from({ length: n }, (_, i) => ({ id: `${i}`, title: `E${i}`, start: '2026-06-10' }));

    it('shows all when under the cap', () => {
        expect(splitForDay(mk(3), 3)).toEqual({ shown: mk(3), more: 0 });
    });

    it('reserves a slot for "+N more" when over the cap', () => {
        const r = splitForDay(mk(6), 3);
        expect(r.shown).toHaveLength(2); // cap-1
        expect(r.more).toBe(4);
    });

    it('0 cap shows everything', () => {
        expect(splitForDay(mk(10), 0).more).toBe(0);
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

describe('allDayEventsForDay', () => {
    it('returns all-day / date-only events covering the day, sorted', () => {
        const events: CalEvent[] = [
            { id: 'm', title: 'Multi', start: '2026-06-22', end: '2026-06-25', allDay: true },
            { id: 't', title: 'Timed', start: '2026-06-24T09:00:00' },
            { id: 'd', title: 'DateOnly', start: '2026-06-24' }
        ];
        expect(allDayEventsForDay(events, '2026-06-24').map((e) => e.id)).toEqual(['d', 'm']);
    });
});
