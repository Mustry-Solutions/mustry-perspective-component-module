/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "America/Havana"} */
// #247: a browser whose own midnight falls in a DST gap (Havana springs forward
// at 00:00 on 2026-03-08) must not move a calendar preset's 00:00 start when
// config.timezone is another zone.
import { computeOutputs, PresetDef, presetRange, realtimeSelection } from '../picker/pickerLogic';
import { fmtWallDate, todayInZone, fmtDate, wallSeconds } from '../../shared/dateUtils';

const BX = 'Europe/Brussels';
const preset = (period: PresetDef['period']): PresetDef => ({ label: '', type: 'calendar', amount: 1, unit: 'days', period });
const LABELS = { dayOne: 'day', dayMany: 'days', sameDay: 'Same day', durationDays: '{n} {days}' };

describe('picker presets in a browser whose midnight is a DST gap (#247)', () => {
    it('the process really is in Havana with a midnight gap on 2026-03-08', () => {
        expect(new Date(2026, 2, 8).getHours()).toBe(1);
    });

    it('"Today" in Brussels starts at 00:00, not 01:00', () => {
        const r = presetRange(preset('today'), { now: new Date('2026-03-08T12:00:00Z'), timeZone: BX, forward: false, firstDay: 1 });
        expect([fmtWallDate(r.start), wallSeconds(r.start)]).toEqual(['2026-03-08', 0]);
        const out = computeOutputs({
            startDate: fmtWallDate(r.start), startTimeSec: wallSeconds(r.start),
            endDate: fmtWallDate(r.end), endTimeSec: wallSeconds(r.end),
            granularity: 'second', timezone: BX, minSpanDays: 0, maxSpanDays: 0, durationLabelThresholdHours: 48, labels: LABELS
        });
        expect(out.startDateTime).toBe('2026-03-08T00:00:00+01:00');
    });

    it('a Sunday-first "This week" that starts on the gap day starts at 00:00', () => {
        const r = presetRange(preset('thisWeek'), { now: new Date('2026-03-10T12:00:00Z'), timeZone: BX, forward: false, firstDay: 0 });
        expect([fmtWallDate(r.start), wallSeconds(r.start)]).toEqual(['2026-03-08', 0]);
    });

    it('"Yesterday" ending on the gap day keeps its 23:59:59 end and 00:00 start', () => {
        const r = presetRange(preset('yesterday'), { now: new Date('2026-03-09T12:00:00Z'), timeZone: BX, forward: false, firstDay: 1 });
        expect([fmtWallDate(r.start), wallSeconds(r.start), fmtWallDate(r.end), wallSeconds(r.end)])
            .toEqual(['2026-03-08', 0, '2026-03-08', 86399]);
    });

    it('a rolling day window landing on the gap day keeps its time of day', () => {
        // 00:30 Brussels on Mar 9; a day back is Mar 8 00:30, a time Havana skips.
        const s = realtimeSelection(1, 'days', new Date('2026-03-08T23:30:00Z'), false, BX);
        expect(s).toEqual({ startDate: '2026-03-08', startTimeSec: 1800, endDate: '2026-03-09', endTimeSec: 1800 });
    });

    it('today in the zone is the zone day, as a date-only value', () => {
        expect(fmtDate(todayInZone(BX, new Date('2026-03-08T12:00:00Z')))).toBe('2026-03-08');
    });
});
