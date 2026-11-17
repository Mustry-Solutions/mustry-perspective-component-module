/** @jest-environment ./jest-tz-environment.js
 *  @jest-environment-options {"tz": "Europe/Brussels"} */
// #247: Brussels springs forward 02:00 -> 03:00 on 2026-03-29. A picker set to
// another zone must not move a 02:xx wall time that only Brussels skips.
import { computeOutputs, realtimeSelection } from '../picker/pickerLogic';
import { combine, formatPattern, formatWallPattern, parseDate, wallOfDay } from '../../shared/dateUtils';

const NY = 'America/New_York';
const LABELS = { dayOne: 'day', dayMany: 'days', sameDay: 'Same day', durationDays: '{n} {days}' };

describe('picker in a browser with a DST gap at the selected time (#247)', () => {
    it('the process really is in Brussels with a gap at 02:30 on 2026-03-29', () => {
        expect(new Date(2026, 2, 29, 2, 30).getHours()).toBe(3);
    });

    it('a realtime "last 1 hour" in New York ends now, at 02:30, not 03:30', () => {
        const now = new Date('2026-03-29T06:30:00Z');   // 02:30 EDT
        const s = realtimeSelection(1, 'hours', now, false, NY);
        expect(s).toEqual({ startDate: '2026-03-29', startTimeSec: 5400, endDate: '2026-03-29', endTimeSec: 9000 });
        const out = computeOutputs({
            ...s, granularity: 'second', timezone: NY, minSpanDays: 0, maxSpanDays: 0, durationLabelThresholdHours: 48, labels: LABELS
        });
        expect(out.endEpochMs).toBe(now.getTime());
        expect(out.durationHours).toBe(1);
    });

    it('the trigger label shows the selected 02:30, where a browser Date shows 03:30', () => {
        const day = parseDate('2026-03-29') as Date;
        expect(formatPattern(combine(day, 9000), 'YYYY-MM-DD HH:mm')).toBe('2026-03-29 03:30');   // the old path
        expect(formatWallPattern(wallOfDay(day, 9000), 'YYYY-MM-DD HH:mm')).toBe('2026-03-29 02:30');
    });
});
