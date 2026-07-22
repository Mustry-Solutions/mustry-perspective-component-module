import {
    emptyHolidayDraft, formatIsoDate, holidayDraftEquals, holidayDraftFromItem, holidayDraftToFlat,
    nextOccurrence, normalizeHoliday, parseIsoDate, sortHolidays
} from '../holiday/holidayLogic';

describe('parseIsoDate', () => {
    it('parses a valid date', () => {
        expect(parseIsoDate('2026-07-22')).toEqual({ year: 2026, month: 7, day: 22 });
    });
    it('round-trips through formatIsoDate', () => {
        expect(formatIsoDate(parseIsoDate('2026-01-05')!)).toBe('2026-01-05');
    });
    it('rejects calendar-invalid dates (no Date-object rollover)', () => {
        expect(parseIsoDate('2026-02-31')).toBeNull();
        expect(parseIsoDate('2026-13-01')).toBeNull();
        expect(parseIsoDate('2026-00-10')).toBeNull();
    });
    it('accepts Feb 29 only in leap years', () => {
        expect(parseIsoDate('2024-02-29')).not.toBeNull();
        expect(parseIsoDate('2026-02-29')).toBeNull();
    });
    it('rejects malformed strings', () => {
        expect(parseIsoDate('22-07-2026')).toBeNull();
        expect(parseIsoDate('2026-7-2')).toBeNull();
        expect(parseIsoDate('')).toBeNull();
    });
});

describe('nextOccurrence', () => {
    const today = '2026-07-22';
    it('non-repeating: the date itself when today or later, else never', () => {
        expect(nextOccurrence(normalizeHoliday({ name: 'x', date: '2026-12-25' }), today)).toBe('2026-12-25');
        expect(nextOccurrence(normalizeHoliday({ name: 'x', date: '2026-07-22' }), today)).toBe('2026-07-22');
        expect(nextOccurrence(normalizeHoliday({ name: 'x', date: '2026-01-01' }), today)).toBeNull();
    });
    it('repeating: this year when still ahead, else next year', () => {
        const xmas = normalizeHoliday({ name: 'x', date: '2020-12-25', repeatAnnually: true });
        expect(nextOccurrence(xmas, today)).toBe('2026-12-25');
        const newYear = normalizeHoliday({ name: 'n', date: '2020-01-01', repeatAnnually: true });
        expect(nextOccurrence(newYear, today)).toBe('2027-01-01');
    });
    it('Feb-29 repeats observe on Feb 28 in non-leap years', () => {
        const leapDay = normalizeHoliday({ name: 'l', date: '2024-02-29', repeatAnnually: true });
        expect(nextOccurrence(leapDay, '2026-01-15')).toBe('2026-02-28');
        expect(nextOccurrence(leapDay, '2027-03-01')).toBe('2028-02-29');
    });
    it('unparseable dates never occur', () => {
        expect(nextOccurrence(normalizeHoliday({ name: 'x', date: 'nope' }), today)).toBeNull();
    });
});

describe('sortHolidays', () => {
    const today = '2026-07-22';
    it('upcoming first (soonest on top), past non-repeating last', () => {
        const sorted = sortHolidays([
            normalizeHoliday({ name: 'Past Party', date: '2026-03-01' }),
            normalizeHoliday({ name: 'Christmas', date: '2020-12-25', repeatAnnually: true }),
            normalizeHoliday({ name: 'Company Day', date: '2026-09-01' })
        ], today);
        expect(sorted.map((h) => h.name)).toEqual(['Company Day', 'Christmas', 'Past Party']);
    });
    it('is stable and total on ties/unparseables', () => {
        const sorted = sortHolidays([
            normalizeHoliday({ name: 'B', date: 'bad' }),
            normalizeHoliday({ name: 'A', date: 'bad' })
        ], today);
        expect(sorted.map((h) => h.name)).toEqual(['A', 'B']);
    });
});

describe('draft lifecycle', () => {
    it('captures, compares and serializes', () => {
        const item = normalizeHoliday({ name: 'X', date: '2026-08-01', repeatAnnually: true });
        const d = holidayDraftFromItem(item);
        expect(holidayDraftEquals(d, holidayDraftFromItem(item))).toBe(true);
        d.repeatAnnually = false;
        expect(holidayDraftEquals(d, holidayDraftFromItem(item))).toBe(false);
        expect(holidayDraftToFlat('  X ', d)).toEqual({ name: 'X', date: '2026-08-01', repeatAnnually: false });
    });
    it('the create draft defaults to repeat-annually (the common case)', () => {
        expect(emptyHolidayDraft()).toEqual({ date: '', repeatAnnually: true });
    });
});
