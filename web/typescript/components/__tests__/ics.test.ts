import { buildIcs, icsFold, icsText, IcsItem } from '../../shared/ics';
import { CalEvent, eventsToIcs } from '../calendar/calendarLogic';
import { TimelineEvent, timelineEventsToIcs } from '../timeline/timelineLogic';

const NOW = new Date('2026-03-01T12:00:00Z');
const BRUSSELS = { timezone: 'Europe/Brussels', now: NOW };

/** The unfolded content lines of one export. */
function lines(items: IcsItem[], opts: Parameters<typeof buildIcs>[1] = BRUSSELS): string[] {
    return buildIcs(items, opts).replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}

function veventLines(items: IcsItem[], opts?: Parameters<typeof buildIcs>[1]): string[] {
    const all = lines(items, opts);
    return all.slice(all.indexOf('BEGIN:VEVENT'), all.lastIndexOf('END:VEVENT') + 1);
}

function value(all: string[], prefix: string): string | undefined {
    const hit = all.find((l) => l.startsWith(prefix));
    return hit === undefined ? undefined : hit.slice(prefix.length);
}

describe('icsText', () => {
    it('escapes backslash first, then separators and line breaks', () => {
        expect(icsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    });

    it('treats CRLF and a lone CR as line breaks, so a value cannot start a new content line', () => {
        expect(icsText('a\r\nb\rc')).toBe('a\\nb\\nc');
        expect(buildIcs([{ id: '1', start: '2026-03-16T08:00:00', title: 'x\r\nATTENDEE:evil' }], BRUSSELS))
            .not.toContain('\r\nATTENDEE');
    });

    it('drops control characters but keeps tabs', () => {
        expect(icsText('a\u0000b\u001fc\td')).toBe('abc\td');
    });
});

describe('icsFold', () => {
    const octets = (s: string) => Buffer.byteLength(s, 'utf8');

    it('leaves a line of exactly 75 octets alone', () => {
        const line = 'x'.repeat(75);
        expect(icsFold(line)).toBe(line);
    });

    it('folds at 75 octets, counting the continuation space', () => {
        const parts = icsFold('x'.repeat(200)).split('\r\n');
        expect(parts.length).toBeGreaterThan(2);
        parts.forEach((p) => expect(octets(p)).toBeLessThanOrEqual(75));
        expect(parts[1].startsWith(' ')).toBe(true);
    });

    it('never splits a multi-byte character or a surrogate pair', () => {
        const source = 'é€😀'.repeat(60);
        const parts = icsFold(source).split('\r\n');
        parts.forEach((p) => {
            expect(octets(p)).toBeLessThanOrEqual(75);
            expect(p).not.toContain('�');
        });
        expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(source);
    });
});

describe('buildIcs: calendar wrapper', () => {
    it('writes a CRLF-terminated VCALENDAR', () => {
        const text = buildIcs([], BRUSSELS);
        expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
        expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    });

    it('stamps every event and omits VTIMEZONE when no timed series needs it', () => {
        const all = lines([{ id: '1', start: '2026-03-16T08:00:00' }]);
        expect(value(all, 'DTSTAMP:')).toBe('20260301T120000Z');
        expect(all).not.toContain('BEGIN:VTIMEZONE');
    });

    it('derives the UID from the id alone, so an edited export keeps it', () => {
        const a = value(lines([{ id: 'job-7', title: 'A', start: '2026-03-16T08:00:00' }]), 'UID:');
        const b = value(lines([{ id: 'job-7', title: 'B', start: '2026-04-20T10:00:00' }]), 'UID:');
        expect(a).toBe('job-7@mustry-perspective');
        expect(b).toBe(a);
    });

    it('exports an id seen twice once', () => {
        const item = { id: 'a', start: '2026-03-16T08:00:00' };
        expect(lines([item, item]).filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    });

    it('skips unreadable and out-of-range starts instead of throwing', () => {
        const all = lines([
            { id: 'bad', start: 'not a date' },
            { id: 'huge', start: '99999999999999999' },
            { id: 'badSeries', start: 'nope', rrule: { freq: 'daily' } },
            { id: 'ok', start: '2026-03-16T08:00:00' }
        ]);
        expect(all.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    });

    it('falls back to a usable zone for an unknown timezone', () => {
        const all = lines([{ id: '1', start: '2026-03-16T08:00:00', rrule: { freq: 'weekly' } }],
            { timezone: 'Not/AZone', now: NOW });
        expect(value(all, 'TZID:')).not.toBe('Not/AZone');
    });
});

describe('buildIcs: one-off events', () => {
    it('writes timed events in UTC, resolved in the given zone', () => {
        const all = veventLines([{ id: '1', start: '2026-07-01T08:00:00', end: '2026-07-01T09:30:00' }]);
        expect(value(all, 'DTSTART:')).toBe('20260701T060000Z');
        expect(value(all, 'DTEND:')).toBe('20260701T073000Z');
    });

    it('keeps absolute instants absolute', () => {
        const all = veventLines([{ id: '1', start: '2026-07-01T08:00:00-05:00' }]);
        expect(value(all, 'DTSTART:')).toBe('20260701T130000Z');
    });

    it('uses the default duration when there is no usable end', () => {
        const opts = { ...BRUSSELS, defaultDurationMin: 60 };
        expect(value(veventLines([{ id: '1', start: '2026-07-01T08:00:00' }], opts), 'DURATION:')).toBe('PT60M');
        const backwards = veventLines([{ id: '1', start: '2026-07-01T08:00:00', end: '2026-07-01T07:00:00' }], opts);
        expect(value(backwards, 'DTEND:')).toBeUndefined();
        expect(value(backwards, 'DURATION:')).toBe('PT60M');
    });

    it('writes no end at all without a default duration', () => {
        const all = veventLines([{ id: '1', start: '2026-07-01T08:00:00' }]);
        expect(value(all, 'DTEND:')).toBeUndefined();
        expect(value(all, 'DURATION:')).toBeUndefined();
    });

    it('writes a one-day all-day event with the next day as its exclusive end', () => {
        const all = veventLines([{ id: '1', start: '2026-03-03', allDay: true }]);
        expect(value(all, 'DTSTART;VALUE=DATE:')).toBe('20260303');
        expect(value(all, 'DTEND;VALUE=DATE:')).toBe('20260304');
    });

    it('keeps a multi-day all-day end as is: it is already exclusive', () => {
        const all = veventLines([{ id: '1', start: '2026-03-03', end: '2026-03-06', allDay: true }]);
        expect(value(all, 'DTEND;VALUE=DATE:')).toBe('20260306');
    });

    it('treats an all-day end on the start day as one day', () => {
        const all = veventLines([{ id: '1', start: '2026-03-03', end: '2026-03-03', allDay: true }]);
        expect(value(all, 'DTEND;VALUE=DATE:')).toBe('20260304');
    });

    it('maps status and transparency, and leaves other statuses out', () => {
        expect(veventLines([{ id: '1', start: '2026-07-01T08:00:00', status: 'tentative' }])).toContain('STATUS:TENTATIVE');
        expect(veventLines([{ id: '1', start: '2026-07-01T08:00:00', status: 'cancelled' }])).toContain('STATUS:CANCELLED');
        expect(value(veventLines([{ id: '1', start: '2026-07-01T08:00:00', status: 'done' }]), 'STATUS:')).toBeUndefined();
        expect(veventLines([{ id: '1', start: '2026-07-01T08:00:00', transparent: true }])).toContain('TRANSP:TRANSPARENT');
    });
});

describe('buildIcs: recurring series', () => {
    const series = (rrule: IcsItem['rrule'], extra: Partial<IcsItem> = {}): IcsItem => ({
        id: 's', start: '2026-03-16T08:00:00', end: '2026-03-16T09:00:00', rrule, ...extra
    });

    it('keeps a timed series in its local zone, so 08:00 holds across DST', () => {
        const all = veventLines([series({ freq: 'weekly' })]);
        expect(value(all, 'DTSTART;TZID=Europe/Brussels:')).toBe('20260316T080000');
        expect(value(all, 'DTEND;TZID=Europe/Brussels:')).toBe('20260316T090000');
        expect(value(all, 'RRULE:')).toBe('FREQ=WEEKLY');
    });

    it('normalises an absolute series start to the zone wall clock', () => {
        const all = veventLines([series({ freq: 'daily' }, { start: '2026-07-01T06:00:00Z', end: '2026-07-01T07:00:00Z' })]);
        expect(value(all, 'DTSTART;TZID=Europe/Brussels:')).toBe('20260701T080000');
    });

    it('accepts a start without seconds', () => {
        const all = veventLines([series({ freq: 'daily' }, { start: '2026-03-16T08:30', end: '2026-03-16T09:45' })]);
        expect(value(all, 'DTSTART;TZID=Europe/Brussels:')).toBe('20260316T083000');
        expect(value(all, 'DTEND;TZID=Europe/Brussels:')).toBe('20260316T094500');
    });

    it('keeps an overnight series ending the next day', () => {
        const all = veventLines([series({ freq: 'daily' }, { start: '2026-03-16T22:00:00', end: '2026-03-17T06:00:00' })]);
        expect(value(all, 'DTEND;TZID=Europe/Brussels:')).toBe('20260317T060000');
    });

    it('generates a VTIMEZONE with both real transitions in their local onset times', () => {
        const all = lines([series({ freq: 'weekly' })]);
        expect(all).toContain('BEGIN:VTIMEZONE');
        const text = all.join('\n');
        expect(text).toContain('BEGIN:DAYLIGHT\nDTSTART:20260329T020000\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nEND:DAYLIGHT');
        expect(text).toContain('BEGIN:STANDARD\nDTSTART:20261025T030000\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nEND:STANDARD');
    });

    it('opens the VTIMEZONE no later than the series start', () => {
        const all = lines([series({ freq: 'weekly' })]);
        const first = all[all.indexOf('TZID:Europe/Brussels') + 2];
        expect(first.slice('DTSTART:'.length) < '20260316T080000').toBe(true);
    });

    it('writes a single observance for a zone without DST', () => {
        const all = lines([series({ freq: 'weekly' })], { timezone: 'Asia/Tokyo', now: NOW });
        expect(all.filter((l) => l === 'BEGIN:STANDARD')).toHaveLength(1);
        expect(all).not.toContain('BEGIN:DAYLIGHT');
        expect(all).toContain('TZOFFSETTO:+0900');
    });

    it('handles a half-hour zone', () => {
        expect(lines([series({ freq: 'weekly' })], { timezone: 'Asia/Kolkata', now: NOW })).toContain('TZOFFSETTO:+0530');
    });

    it('writes interval, weekdays and a non-default week start', () => {
        const all = veventLines([series({ freq: 'weekly', interval: 2, byweekday: [1, 3], wkst: 0 })]);
        expect(value(all, 'RRULE:')).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;WKST=SU');
    });

    it('moves DTSTART to the first real occurrence when the start is not a listed weekday', () => {
        // 2026-03-16 is a Monday; the series only runs on Wednesdays.
        const all = veventLines([series({ freq: 'weekly', byweekday: [3] })]);
        expect(value(all, 'DTSTART;TZID=Europe/Brussels:')).toBe('20260318T080000');
        expect(value(all, 'DTEND;TZID=Europe/Brussels:')).toBe('20260318T090000');
    });

    it('writes UNTIL in UTC for a timed series, covering the whole inclusive day', () => {
        const all = veventLines([series({ freq: 'daily', until: '2026-07-10' })]);
        expect(value(all, 'RRULE:')).toBe('FREQ=DAILY;UNTIL=20260710T215959Z');
    });

    it('writes UNTIL as a date for an all-day series', () => {
        const all = veventLines([{ id: 's', start: '2026-03-16', allDay: true, rrule: { freq: 'daily', until: '2026-07-10' } }]);
        expect(value(all, 'RRULE:')).toBe('FREQ=DAILY;UNTIL=20260710');
    });

    it('writes only COUNT or UNTIL, whichever ends the series first', () => {
        expect(value(veventLines([series({ freq: 'daily', count: 3, until: '2026-12-31' })]), 'RRULE:')).toBe('FREQ=DAILY;COUNT=3');
        expect(value(veventLines([series({ freq: 'daily', count: 300, until: '2026-03-18' })]), 'RRULE:'))
            .toBe('FREQ=DAILY;UNTIL=20260318T225959Z');
    });

    it('writes EXDATE with the series start time', () => {
        const all = veventLines([series({ freq: 'daily', exdate: ['2026-03-18', '2026-03-20', 'junk'] })]);
        expect(value(all, 'EXDATE;TZID=Europe/Brussels:')).toBe('20260318T080000,20260320T080000');
    });

    it('writes EXDATE as dates for an all-day series', () => {
        const all = veventLines([{ id: 's', start: '2026-03-16', allDay: true, rrule: { freq: 'daily', exdate: ['2026-03-18'] } }]);
        expect(value(all, 'EXDATE;VALUE=DATE:')).toBe('20260318');
    });

    it('keeps a multi-day all-day series its length, and needs no VTIMEZONE', () => {
        const all = lines([{ id: 's', start: '2026-03-16', end: '2026-03-19', allDay: true, rrule: { freq: 'monthly' } }]);
        expect(value(all, 'DTEND;VALUE=DATE:')).toBe('20260319');
        expect(all).not.toContain('BEGIN:VTIMEZONE');
    });

    it('skips a series that ends before its first occurrence', () => {
        expect(lines([series({ freq: 'weekly', byweekday: [3], until: '2026-03-17' })])).not.toContain('BEGIN:VEVENT');
    });
});

describe('eventsToIcs (calendar)', () => {
    const opts = { ...BRUSSELS, defaultDurationMin: 60 };
    const ev = (e: Partial<CalEvent>): CalEvent => ({ id: '1', title: 'T', start: '2026-07-01T08:00:00', ...e });

    it('exports loaded and recurring events, a series bound via both once', () => {
        const s = ev({ id: 's', rrule: { freq: 'daily' } });
        const text = eventsToIcs([ev({}), s], [s], [], opts).replace(/\r\n /g, '');
        expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    });

    it('uses the category label, the id when unknown', () => {
        const cats = [{ id: 'pm', label: 'Maintenance' }];
        expect(eventsToIcs([ev({ category: 'pm' })], [], cats, opts)).toContain('CATEGORIES:Maintenance');
        expect(eventsToIcs([ev({ category: 'other' })], [], cats, opts)).toContain('CATEGORIES:other');
    });

    it('exports a date-only start as all-day, as the calendar renders it', () => {
        expect(eventsToIcs([ev({ start: '2026-07-01' })], [], [], opts)).toContain('DTSTART;VALUE=DATE:20260701');
    });

    it('keeps an epoch-ms start timed', () => {
        expect(eventsToIcs([ev({ start: String(Date.UTC(2026, 6, 1, 6)) })], [], [], opts)).toContain('DTSTART:20260701T060000Z');
    });

    it('marks background overlays as not blocking time', () => {
        expect(eventsToIcs([ev({ display: 'background' })], [], [], opts)).toContain('TRANSP:TRANSPARENT');
    });
});

describe('timelineEventsToIcs', () => {
    const ev = (e: Partial<TimelineEvent>): TimelineEvent => ({ id: '1', resourceId: 'r1', title: 'T', start: '2026-07-01T08:00:00', ...e });
    const resources = [{ id: 'r1', label: 'Filler, Line 1' }];

    it('uses the resource label as the location, escaped', () => {
        expect(timelineEventsToIcs([ev({})], [], resources, BRUSSELS)).toContain('LOCATION:Filler\\, Line 1');
    });

    it('falls back to the resource id', () => {
        expect(timelineEventsToIcs([ev({ resourceId: 'x' })], [], resources, BRUSSELS)).toContain('LOCATION:x');
    });

    it('keeps a date-only start timed: the timeline has no all-day concept', () => {
        expect(timelineEventsToIcs([ev({ start: '2026-07-01' })], [], resources, BRUSSELS)).toContain('DTSTART:20260630T220000Z');
    });

    it('marks state and background bands as not blocking time', () => {
        expect(timelineEventsToIcs([ev({ display: 'state' })], [], resources, BRUSSELS)).toContain('TRANSP:TRANSPARENT');
        expect(timelineEventsToIcs([ev({ display: 'background' })], [], resources, BRUSSELS)).toContain('TRANSP:TRANSPARENT');
        expect(timelineEventsToIcs([ev({})], [], resources, BRUSSELS)).not.toContain('TRANSP:');
    });
});
