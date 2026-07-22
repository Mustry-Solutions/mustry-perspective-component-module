import {
    applyPaint, applyResize, draftEquals, draftFromItem, draftToFlat, minuteAtFraction,
    paintPreview, removeRange, resizePreview, snapMinute
} from '../schedule/scheduleEditLogic';
import { MINUTES_PER_DAY, normalizeSchedule } from '../schedule/scheduleLogic';

const item = () => normalizeSchedule({
    name: 'Days', description: 'Weekday shift', observeHolidays: true,
    monday: true, mondayTime: '8:00-12:00, 12:30-17:00',
    tuesday: true, tuesdayTime: '8:00-17:00'
});

describe('draftFromItem / draftEquals', () => {
    it('captures per-day ranges and metadata', () => {
        const d = draftFromItem(item());
        expect(d.description).toBe('Weekday shift');
        expect(d.ranges.monday).toEqual([{ start: 480, end: 720 }, { start: 750, end: 1020 }]);
        expect(d.ranges.sunday).toEqual([]);
    });
    it('keeps per-day ranges when allDays is set, so untoggling restores them', () => {
        const d = draftFromItem(normalizeSchedule({ name: 'x', allDays: true, monday: true, mondayTime: '8:00-17:00' }));
        expect(d.allDays).toBe(true);
        expect(d.ranges.monday).toEqual([{ start: 480, end: 1020 }]);
        expect(d.ranges.tuesday).toEqual([]);
    });
    it('equal drafts compare equal; any edit breaks equality', () => {
        const a = draftFromItem(item());
        const b = draftFromItem(item());
        expect(draftEquals(a, b)).toBe(true);
        b.ranges.monday = removeRange(b.ranges.monday, 0);
        expect(draftEquals(a, b)).toBe(false);
        const c = draftFromItem(item());
        c.observeHolidays = false;
        expect(draftEquals(a, c)).toBe(false);
    });
});

describe('draftToFlat', () => {
    it('serializes explicitly and passes alternating fields through', () => {
        const src = normalizeSchedule({
            name: 'Nights', repeatAlternating: true, startingAt: '2026-01-05',
            monday: true, mondayTime: '22:00-24:00'
        });
        const flat = draftToFlat(src, draftFromItem(src));
        expect(flat.name).toBe('Nights');
        expect(flat.repeatAlternating).toBe(true);
        expect(flat.startingAt).toBe('2026-01-05');
        expect(flat.monday).toBe(true);
        expect(flat.mondayTime).toBe('22:00-24:00');
        expect(flat.tuesday).toBe(false);
        expect(flat.tuesdayTime).toBe('');
    });
    it('round-trips through normalizeSchedule unchanged', () => {
        const src = item();
        const flat = draftToFlat(src, draftFromItem(src));
        expect(draftEquals(draftFromItem(normalizeSchedule(flat)), draftFromItem(src))).toBe(true);
    });
});

describe('pointer geometry', () => {
    it('snaps to the nearest step and clamps to the day', () => {
        expect(snapMinute(487, 30)).toBe(480);
        expect(snapMinute(496, 30)).toBe(510);
        expect(snapMinute(-10, 30)).toBe(0);
        expect(snapMinute(2000, 30)).toBe(MINUTES_PER_DAY);
    });
    it('maps a column fraction to a snapped minute inside the window', () => {
        expect(minuteAtFraction(1 / 3, 0, 24, 30)).toBe(480);   // 8:00 on a full-day axis
        expect(minuteAtFraction(0.5, 8, 16, 30)).toBe(720);     // 12:00 on an 8-16 axis
        expect(minuteAtFraction(-0.2, 0, 24, 30)).toBe(0);
        expect(minuteAtFraction(1.2, 0, 24, 30)).toBe(MINUTES_PER_DAY);
    });
});

describe('paint', () => {
    it('orders the preview and enforces a minimum of one snap step', () => {
        expect(paintPreview(600, 480, 30)).toEqual({ start: 480, end: 600 });
        expect(paintPreview(480, 480, 30)).toEqual({ start: 480, end: 510 });
    });
    it('merges the painted range into the day', () => {
        expect(applyPaint([{ start: 480, end: 600 }], { start: 570, end: 720 }))
            .toEqual([{ start: 480, end: 720 }]);
    });
});

describe('resize', () => {
    const r = { start: 480, end: 720 };
    it('moves an edge but cannot invert past the other edge', () => {
        expect(resizePreview(r, 'start', 540, 30)).toEqual({ start: 540, end: 720 });
        expect(resizePreview(r, 'start', 900, 30)).toEqual({ start: 690, end: 720 });
        expect(resizePreview(r, 'end', 900, 30)).toEqual({ start: 480, end: 900 });
        expect(resizePreview(r, 'end', 300, 30)).toEqual({ start: 480, end: 510 });
    });
    it('re-merges when the resized block reaches a neighbour', () => {
        const day = [{ start: 480, end: 600 }, { start: 660, end: 720 }];
        expect(applyResize(day, 0, { start: 480, end: 660 }))
            .toEqual([{ start: 480, end: 720 }]);
    });
});

describe('removeRange', () => {
    it('removes exactly the indexed range', () => {
        expect(removeRange([{ start: 1, end: 2 }, { start: 3, end: 4 }], 0))
            .toEqual([{ start: 3, end: 4 }]);
    });
});
