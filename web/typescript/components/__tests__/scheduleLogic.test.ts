import {
    clampHourWindow, dayRanges, formatMinutes, formatTimeRanges, hourTicks, isActiveAt,
    mergeRanges, MINUTES_PER_DAY, normalizeSchedule, orderedDays, parseTimeRanges, parseTimeToken,
    ScheduleItem
} from '../schedule/scheduleLogic';

function sched(overrides: any = {}): ScheduleItem {
    return normalizeSchedule({
        name: 'Day Shift',
        monday: true, mondayTime: '8:00-17:00',
        tuesday: true, tuesdayTime: '8:00-17:00',
        ...overrides
    });
}

describe('parseTimeToken', () => {
    it('parses H:MM', () => expect(parseTimeToken('8:30')).toBe(510));
    it('parses bare hours', () => expect(parseTimeToken('17')).toBe(1020));
    it('parses 24:00 as end of day', () => expect(parseTimeToken('24:00')).toBe(MINUTES_PER_DAY));
    it('parses bare 24', () => expect(parseTimeToken('24')).toBe(MINUTES_PER_DAY));
    it('tolerates surrounding whitespace', () => expect(parseTimeToken(' 9:05 ')).toBe(545));
    it('rejects past end of day', () => expect(parseTimeToken('24:30')).toBeNull());
    it('rejects hour 25', () => expect(parseTimeToken('25:00')).toBeNull());
    it('rejects minutes over 59', () => expect(parseTimeToken('8:75')).toBeNull());
    it('rejects garbage', () => expect(parseTimeToken('8h30')).toBeNull());
    it('rejects empty', () => expect(parseTimeToken('')).toBeNull());
});

describe('parseTimeRanges', () => {
    it('parses a single range', () => {
        expect(parseTimeRanges('8:00-17:00')).toEqual([{ start: 480, end: 1020 }]);
    });
    it('parses comma-separated ranges', () => {
        expect(parseTimeRanges('8:00-12:00, 12:30-17:00')).toEqual([
            { start: 480, end: 720 }, { start: 750, end: 1020 }
        ]);
    });
    it('parses the full day', () => {
        expect(parseTimeRanges('0:00-24:00')).toEqual([{ start: 0, end: MINUTES_PER_DAY }]);
    });
    it('returns [] for blank', () => expect(parseTimeRanges('')).toEqual([]));
    it('drops malformed segments but keeps good ones', () => {
        expect(parseTimeRanges('nope, 8:00-9:00, 13:xx-14:00')).toEqual([{ start: 480, end: 540 }]);
    });
    it('drops inverted ranges', () => expect(parseTimeRanges('17:00-8:00')).toEqual([]));
    it('drops empty ranges', () => expect(parseTimeRanges('8:00-8:00')).toEqual([]));
});

describe('format round-trip', () => {
    it('formats minutes as H:MM', () => {
        expect(formatMinutes(480)).toBe('8:00');
        expect(formatMinutes(545)).toBe('9:05');
        expect(formatMinutes(MINUTES_PER_DAY)).toBe('24:00');
    });
    it('round-trips the canonical spelling', () => {
        const text = '8:00-12:00, 12:30-17:00';
        expect(formatTimeRanges(parseTimeRanges(text))).toBe(text);
    });
});

describe('mergeRanges', () => {
    it('merges overlapping ranges', () => {
        expect(mergeRanges([{ start: 480, end: 600 }, { start: 540, end: 720 }]))
            .toEqual([{ start: 480, end: 720 }]);
    });
    it('merges touching ranges', () => {
        expect(mergeRanges([{ start: 480, end: 600 }, { start: 600, end: 720 }]))
            .toEqual([{ start: 480, end: 720 }]);
    });
    it('sorts and keeps disjoint ranges apart', () => {
        expect(mergeRanges([{ start: 750, end: 1020 }, { start: 480, end: 720 }]))
            .toEqual([{ start: 480, end: 720 }, { start: 750, end: 1020 }]);
    });
    it('does not mutate its input', () => {
        const input = [{ start: 540, end: 720 }, { start: 480, end: 600 }];
        mergeRanges(input);
        expect(input[0]).toEqual({ start: 540, end: 720 });
    });
});

describe('normalizeSchedule', () => {
    it('maps the flat bean mirror into per-day availability', () => {
        const s = sched();
        expect(s.name).toBe('Day Shift');
        expect(s.days.monday).toEqual({ enabled: true, time: '8:00-17:00' });
        expect(s.days.sunday).toEqual({ enabled: false, time: '' });
    });
    it('defaults every field on an empty object', () => {
        const s = normalizeSchedule({});
        expect(s.name).toBe('');
        expect(s.allDays).toBe(false);
        expect(s.days.friday.enabled).toBe(false);
    });
    it('survives null', () => expect(normalizeSchedule(null).name).toBe(''));
});

describe('dayRanges', () => {
    it('returns merged parsed ranges for an enabled day', () => {
        const s = sched({ mondayTime: '8:00-12:00, 11:00-17:00' });
        expect(dayRanges(s, 'monday')).toEqual([{ start: 480, end: 1020 }]);
    });
    it('is empty for a disabled day', () => expect(dayRanges(sched(), 'sunday')).toEqual([]));
    it('treats enabled + blank time as all day (gateway behaviour)', () => {
        const s = sched({ wednesday: true, wednesdayTime: '' });
        expect(dayRanges(s, 'wednesday')).toEqual([{ start: 0, end: MINUTES_PER_DAY }]);
    });
    it('allDays overrides per-day settings', () => {
        const s = sched({ allDays: true });
        expect(dayRanges(s, 'sunday')).toEqual([{ start: 0, end: MINUTES_PER_DAY }]);
    });
});

describe('isActiveAt', () => {
    const s = sched(); // Mon+Tue 8:00-17:00
    it('is active inside a range', () => expect(isActiveAt(s, 0, 480)).toBe(true));
    it('end is exclusive', () => expect(isActiveAt(s, 0, 1020)).toBe(false));
    it('is inactive outside the range', () => expect(isActiveAt(s, 0, 300)).toBe(false));
    it('is inactive on a disabled day', () => expect(isActiveAt(s, 6, 600)).toBe(false));
    it('allDays is active at midnight sunday', () => {
        expect(isActiveAt(sched({ allDays: true }), 6, 0)).toBe(true);
    });
});

describe('orderedDays', () => {
    it('defaults to monday-first', () => {
        expect(orderedDays('monday')[0]).toBe('monday');
        expect(orderedDays('monday')[6]).toBe('sunday');
    });
    it('rotates for sunday-first', () => {
        expect(orderedDays('sunday')[0]).toBe('sunday');
        expect(orderedDays('sunday')[1]).toBe('monday');
    });
});

describe('clampHourWindow', () => {
    it('passes a valid window through', () => expect(clampHourWindow(6, 22)).toEqual([6, 22]));
    it('falls back to the full day on inverted input', () => {
        expect(clampHourWindow(20, 8)).toEqual([0, 24]);
    });
    it('falls back on out-of-bounds input', () => expect(clampHourWindow(-1, 25)).toEqual([0, 24]));
});

describe('hourTicks', () => {
    it('labels every hour on a short window', () => {
        expect(hourTicks(8, 17)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    });
    it('thins to every 3 hours on the full day', () => {
        expect(hourTicks(0, 24)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    });
});
