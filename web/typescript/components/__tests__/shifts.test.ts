import { parseShifts, shiftStartMinutes, visibleShifts } from '../../shared/shifts';

describe('shiftStartMinutes', () => {
    it('parses HH:mm into minutes-from-midnight', () => {
        expect(shiftStartMinutes('06:00')).toBe(360);
        expect(shiftStartMinutes('6:30')).toBe(390);    // single-digit hour allowed
        expect(shiftStartMinutes('00:00')).toBe(0);
        expect(shiftStartMinutes('23:59')).toBe(1439);
    });

    it('rejects malformed or out-of-range values', () => {
        expect(shiftStartMinutes('')).toBeNull();
        expect(shiftStartMinutes('24:00')).toBeNull();
        expect(shiftStartMinutes('06:60')).toBeNull();
        expect(shiftStartMinutes('6')).toBeNull();
        expect(shiftStartMinutes('06:0')).toBeNull();
        expect(shiftStartMinutes('noon')).toBeNull();
    });
});

describe('parseShifts', () => {
    it('coerces entries and drops the malformed ones (mirrors the timeline rules)', () => {
        expect(parseShifts([
            { label: 'Early', start: '06:00' },
            { label: 'Broken', start: '25:00' },   // invalid hour
            { label: 'NoStart' },                  // missing start
            null,                                  // null row
            { start: '14:00' }                     // no label is fine (empty string)
        ])).toEqual([
            { label: 'Early', start: '06:00' },
            { label: '', start: '14:00' }
        ]);
    });

    it('handles a missing/empty list', () => {
        expect(parseShifts(undefined)).toEqual([]);
        expect(parseShifts(null)).toEqual([]);
        expect(parseShifts([])).toEqual([]);
    });
});

describe('visibleShifts', () => {
    const shifts = [
        { label: 'Early', start: '06:00' },
        { label: 'Late', start: '14:00' },
        { label: 'Night', start: '22:00' }
    ];

    it('keeps only the starts inside the visible window (start-inclusive, end-exclusive)', () => {
        // window 06:00-22:00: Early sits on the top edge, Night on the excluded bottom edge
        expect(visibleShifts(shifts, 6 * 60, 22 * 60)).toEqual([
            { label: 'Early', min: 360 },
            { label: 'Late', min: 840 }
        ]);
    });

    it('the full day window shows every shift', () => {
        expect(visibleShifts(shifts, 0, 24 * 60).map((s) => s.label)).toEqual(['Early', 'Late', 'Night']);
    });

    it('a narrow window can show none', () => {
        expect(visibleShifts(shifts, 8 * 60, 12 * 60)).toEqual([]);
    });
});
