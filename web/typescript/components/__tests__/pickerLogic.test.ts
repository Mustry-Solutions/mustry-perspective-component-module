import { fmtDate, secondsOfDay } from '../dateUtils';
import {
    resolveLayout, effMin, effMax, rollingRange, calendarRange, presetRange,
    presetConflict, stepSeconds, snapSec, effStartSec, effEndSec, durationLabel,
    computeOutputs, PresetContext, PresetDef
} from '../pickerLogic';

describe('resolveLayout', () => {
    const base = { width: 800, height: 600, compactBelowWidth: 360, compactBelowHeight: 320, twoMonthsAboveWidth: 720 };

    it('honours an explicit layout regardless of size', () => {
        expect(resolveLayout({ ...base, width: 10, height: 10, layout: 'oneMonth' })).toBe('oneMonth');
        expect(resolveLayout({ ...base, width: 9999, layout: 'compact' })).toBe('compact');
        expect(resolveLayout({ ...base, layout: 'twoMonths' })).toBe('twoMonths');
    });

    it('falls back to compact when too short or too narrow', () => {
        expect(resolveLayout({ ...base, layout: 'auto', height: 200 })).toBe('compact');
        expect(resolveLayout({ ...base, layout: 'auto', width: 300 })).toBe('compact');
    });

    it('picks two months when wide enough, else one', () => {
        expect(resolveLayout({ ...base, layout: 'auto', width: 800 })).toBe('twoMonths');
        expect(resolveLayout({ ...base, layout: 'auto', width: 500 })).toBe('oneMonth');
    });
});

describe('effMin / effMax', () => {
    const td = new Date(2026, 5, 17); // fixed "today"

    it('use an explicit bound when set, in any mode', () => {
        expect(fmtDate(effMin('none', '2026-06-01', td)!)).toBe('2026-06-01');
        expect(fmtDate(effMax('none', '2026-12-31', td)!)).toBe('2026-12-31');
    });

    it('default to today only in the matching disable mode', () => {
        expect(fmtDate(effMin('past', '', td)!)).toBe('2026-06-17');
        expect(effMin('future', '', td)).toBeNull();
        expect(effMin('none', '', td)).toBeNull();

        expect(fmtDate(effMax('future', '', td)!)).toBe('2026-06-17');
        expect(effMax('past', '', td)).toBeNull();
        expect(effMax('none', '', td)).toBeNull();
    });
});

describe('rollingRange', () => {
    const now = new Date(2026, 5, 17, 10, 30, 0); // Wed 2026-06-17 10:30

    it('rolls forward (start = now)', () => {
        const r = rollingRange(7, 'days', now, true);
        expect(r.start).toBe(now);
        expect(fmtDate(r.end)).toBe('2026-06-24');
    });

    it('rolls backward (end = now)', () => {
        const r = rollingRange(7, 'days', now, false);
        expect(r.end).toBe(now);
        expect(fmtDate(r.start)).toBe('2026-06-10');
    });

    it('supports hours / weeks / months', () => {
        expect(fmtDate(rollingRange(24, 'hours', now, true).end)).toBe('2026-06-18');
        expect(fmtDate(rollingRange(2, 'weeks', now, false).start)).toBe('2026-06-03');
        expect(fmtDate(rollingRange(1, 'months', now, true).end)).toBe('2026-07-17');
    });
});

describe('calendarRange', () => {
    const now = new Date(2026, 5, 17, 10, 30, 0); // Wed 2026-06-17; Jun 1 2026 is a Monday
    const range = (period: any, mondayFirst = true) => calendarRange(period, now, mondayFirst);
    const span = (p: any, mf = true) => {
        const r = range(p, mf);
        return [fmtDate(r.start), fmtDate(r.end), secondsOfDay(r.start), secondsOfDay(r.end)];
    };

    it('today / yesterday are full single days', () => {
        expect(span('today')).toEqual(['2026-06-17', '2026-06-17', 0, 86399]);
        expect(span('yesterday')).toEqual(['2026-06-16', '2026-06-16', 0, 86399]);
    });

    it('this* is period-to-date (start of period .. end of today)', () => {
        expect(span('thisWeek', true)).toEqual(['2026-06-15', '2026-06-17', 0, 86399]);  // Mon-first
        expect(span('thisWeek', false)).toEqual(['2026-06-14', '2026-06-17', 0, 86399]); // Sun-first
        expect(span('thisMonth')).toEqual(['2026-06-01', '2026-06-17', 0, 86399]);
        expect(span('thisYear')).toEqual(['2026-01-01', '2026-06-17', 0, 86399]);
    });

    it('last* is the full previous period (honouring weekStart)', () => {
        expect(span('lastWeek', true)).toEqual(['2026-06-08', '2026-06-14', 0, 86399]);  // Mon..Sun
        expect(span('lastWeek', false)).toEqual(['2026-06-07', '2026-06-13', 0, 86399]); // Sun..Sat
        expect(span('lastMonth')).toEqual(['2026-05-01', '2026-05-31', 0, 86399]);
        expect(span('lastYear')).toEqual(['2025-01-01', '2025-12-31', 0, 86399]);
    });
});

describe('presetRange dispatch', () => {
    const ctx: PresetContext = { now: new Date(2026, 5, 17, 10, 30, 0), forward: false, mondayFirst: true };
    const rolling: PresetDef = { label: 'Last 7 days', type: 'rolling', amount: 7, unit: 'days', period: 'today' };
    const calendar: PresetDef = { label: 'This month', type: 'calendar', amount: 1, unit: 'days', period: 'thisMonth' };

    it('routes to rolling vs calendar by type', () => {
        expect(fmtDate(presetRange(rolling, ctx).start)).toBe('2026-06-10');
        expect(fmtDate(presetRange(calendar, ctx).start)).toBe('2026-06-01');
    });
});

describe('presetConflict', () => {
    const now = new Date(2026, 5, 17, 10, 30, 0);
    const last7: PresetDef = { label: 'Last 7 days', type: 'rolling', amount: 7, unit: 'days', period: 'today' };
    const mk = (over: any) => presetConflict(last7, {
        now, forward: false, mondayFirst: true, min: null, max: null, minSpanDays: 0, maxSpanDays: 0, ...over
    });

    it('passes when within bounds and span', () => {
        expect(mk({})).toBe('');
    });

    it('flags starting before the earliest selectable date', () => {
        expect(mk({ min: new Date(2026, 5, 12) })).toMatch(/before the earliest/i);
    });

    it('flags exceeding the max span', () => {
        expect(mk({ maxSpanDays: 3 })).toMatch(/at most|maximum|exceeds/i);
    });

    it('flags shorter than the min span', () => {
        expect(mk({ minSpanDays: 30 })).toMatch(/minimum|at least|shorter/i);
    });
});

describe('granularity helpers', () => {
    it('stepSeconds per granularity', () => {
        expect(stepSeconds('day')).toBe(86400);
        expect(stepSeconds('hour')).toBe(3600);
        expect(stepSeconds('minute')).toBe(60);
        expect(stepSeconds('second')).toBe(1);
    });

    it('snapSec floors to the step and clamps', () => {
        expect(snapSec(3661, 'minute')).toBe(3660);
        expect(snapSec(3661, 'hour')).toBe(3600);
        expect(snapSec(90000, 'second')).toBe(86399);
    });

    it('effStart/effEnd cover whole days in day mode', () => {
        expect(effStartSec(12345, 'day')).toBe(0);
        expect(effEndSec(12345, 'day')).toBe(86399);
        expect(effStartSec(3661, 'minute')).toBe(3660);
    });
});

describe('durationLabel', () => {
    it('is empty when invalid', () => {
        expect(durationLabel(3, 72, false, 'day', 48, 'Same day')).toBe('');
    });

    it('day mode: same-day, singular, plural', () => {
        expect(durationLabel(0, 24, true, 'day', 48, 'Same day')).toBe('Same day');
        expect(durationLabel(1, 24, true, 'day', 48, 'Same day')).toBe('1 day');
        expect(durationLabel(3, 72, true, 'day', 48, 'Same day')).toBe('3 days');
    });

    it('non-day: days above threshold, else H/M/S', () => {
        expect(durationLabel(3, 72, true, 'second', 48, 'Same day')).toBe('3 days');
        expect(durationLabel(0, 2.5, true, 'second', 48, 'Same day')).toBe('2h 30m');
        expect(durationLabel(0, 0.5, true, 'second', 48, 'Same day')).toBe('30m 0s');
        expect(durationLabel(0, 0.01, true, 'second', 48, 'Same day')).toBe('36s');
    });
});

describe('computeOutputs', () => {
    const baseInput = {
        startTimeSec: 0, endTimeSec: 86399, granularity: 'second' as const,
        timezone: 'UTC', minSpanDays: 0, maxSpanDays: 0,
        durationLabelThresholdHours: 48, sameDayLabel: 'Same day'
    };

    it('returns the empty contract with no selection', () => {
        const out = computeOutputs({ ...baseInput, startDate: '', endDate: '' });
        expect(out.isValid).toBe(false);
        expect(out).toMatchObject({ startDateTime: '', startEpochMs: 0, durationDays: 0, durationLabel: '' });
    });

    it('computes a valid UTC range', () => {
        const out = computeOutputs({ ...baseInput, startDate: '2026-06-10', endDate: '2026-06-15' });
        expect(out.isValid).toBe(true);
        expect(out.startDateTime).toBe('2026-06-10T00:00:00+00:00');
        expect(out.endDateTime).toBe('2026-06-15T23:59:59+00:00');
        expect(out.startEpochMs).toBe(Date.UTC(2026, 5, 10, 0, 0, 0));
        expect(out.endEpochMs).toBe(Date.UTC(2026, 5, 15, 23, 59, 59));
        expect(out.durationDays).toBe(5);
        expect(out.durationLabel).toBe('5 days');
    });

    it('marks a range invalid when it violates spanDays', () => {
        const out = computeOutputs({ ...baseInput, startDate: '2026-06-10', endDate: '2026-06-15', minSpanDays: 10 });
        expect(out.isValid).toBe(false);
        expect(out.durationLabel).toBe(''); // empty while invalid
    });

    it('day granularity: same-day range is valid and labelled', () => {
        const out = computeOutputs({ ...baseInput, granularity: 'day', startDate: '2026-06-10', endDate: '2026-06-10' });
        expect(out.isValid).toBe(true);
        expect(out.durationDays).toBe(0);
        expect(out.durationLabel).toBe('Same day');
    });
});
