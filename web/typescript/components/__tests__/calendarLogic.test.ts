import {
    buildMonthGrid, eventDays, groupEventsByDay, splitForDay, CalEvent
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
