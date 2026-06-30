import {
    colAtX, hasMoved, movePreview, resizePreview, createPreview, commitDecision, GestureFlags
} from '../calendar/gestureLogic';
import { hourHeightPx, SLOT_PX } from '../calendar/types';

describe('hourHeightPx (grid resolution)', () => {
    it('keeps the base height for coarse grids and grows so fine slots stay grabbable', () => {
        expect(hourHeightPx(60)).toBe(SLOT_PX);   // unchanged at 60 min
        expect(hourHeightPx(30)).toBe(SLOT_PX);   // 30-min slot = 21px, still fine
        expect(hourHeightPx(15)).toBe(56);        // 14px per 15-min slot
        expect(hourHeightPx(5)).toBe(168);        // 14px per 5-min slot (tall, scrollable)
    });
});

describe('colAtX', () => {
    const cols = [
        { day: 'mon', left: 0, right: 100 },
        { day: 'tue', left: 100, right: 200 },
        { day: 'wed', left: 200, right: 300 }
    ];
    it('finds the column containing x (left-inclusive, right-exclusive)', () => {
        expect(colAtX(cols, 0)!.day).toBe('mon');
        expect(colAtX(cols, 99)!.day).toBe('mon');
        expect(colAtX(cols, 100)!.day).toBe('tue');  // boundary belongs to the next column
        expect(colAtX(cols, 250)!.day).toBe('wed');
    });
    it('returns null outside every column', () => {
        expect(colAtX(cols, -1)).toBeNull();
        expect(colAtX(cols, 300)).toBeNull();
        expect(colAtX([], 50)).toBeNull();
    });
});

describe('hasMoved', () => {
    it('is false within the threshold and true past it', () => {
        expect(hasMoved(0, 0)).toBe(false);
        expect(hasMoved(2, 2)).toBe(false);   // 4, not > 4
        expect(hasMoved(3, 2)).toBe(true);    // 5 > 4
        expect(hasMoved(-5, 0)).toBe(true);   // uses absolute values
    });
});

describe('movePreview', () => {
    it('shifts by the delta and preserves duration', () => {
        expect(movePreview(540, 60, 30, 0, 1440)).toEqual({ startMin: 570, endMin: 630 });
    });
    it('clamps to the start of the window', () => {
        expect(movePreview(60, 60, -120, 0, 1440)).toEqual({ startMin: 0, endMin: 60 });
    });
    it('clamps so the block stays inside the end of the window', () => {
        expect(movePreview(1380, 60, 120, 0, 1440)).toEqual({ startMin: 1380, endMin: 1440 });
    });
    it('respects a custom day window', () => {
        // window 8:00-18:00 (480..1080), drag a 60-min block down past the end
        expect(movePreview(1000, 60, 200, 480, 1080)).toEqual({ startMin: 1020, endMin: 1080 });
    });
});

describe('resizePreview', () => {
    it('extends the end by the delta', () => {
        expect(resizePreview(540, 600, 30, 1440, 15)).toEqual({ startMin: 540, endMin: 630 });
    });
    it('keeps a minimum duration (>= start + snap)', () => {
        expect(resizePreview(540, 600, -120, 1440, 15)).toEqual({ startMin: 540, endMin: 555 });
    });
    it('clamps the end to the window', () => {
        expect(resizePreview(540, 1400, 120, 1440, 15)).toEqual({ startMin: 540, endMin: 1440 });
    });
});

describe('createPreview', () => {
    it('orders the anchor and current pointer', () => {
        expect(createPreview(600, 720, 15)).toEqual({ startMin: 600, endMin: 720 });
        expect(createPreview(720, 600, 15)).toEqual({ startMin: 600, endMin: 720 });
    });
    it('enforces a minimum length on a near-zero drag', () => {
        expect(createPreview(600, 605, 15)).toEqual({ startMin: 600, endMin: 615 });
        expect(createPreview(600, 600, 15)).toEqual({ startMin: 600, endMin: 615 });
    });
});

describe('commitDecision', () => {
    const f = (o: Partial<GestureFlags> = {}): GestureFlags =>
        ({ editable: false, selectable: false, useEditor: false, useEditorForEdit: false, ...o });

    it('move: a real drag commits a move only when editable', () => {
        expect(commitDecision('move', true, true, f({ editable: true }))).toBe('move');
        // not editable -> treated as a click
        expect(commitDecision('move', true, true, f({ editable: false }))).toBe('eventClick');
    });
    it('move: a plain click opens the editor or fires onEventClick', () => {
        expect(commitDecision('move', false, false, f({ editable: true, useEditorForEdit: true }))).toBe('editEvent');
        expect(commitDecision('move', false, false, f({ editable: true }))).toBe('eventClick');
    });
    it('resize: only commits when actually dragged', () => {
        expect(commitDecision('resize', true, true, f({ editable: true }))).toBe('resize');
        expect(commitDecision('resize', false, true, f({ editable: true }))).toBe('none');
        expect(commitDecision('resize', true, false, f({ editable: true }))).toBe('none');
    });
    it('create: a dragged range selects (or opens the editor when built-in)', () => {
        expect(commitDecision('create', true, true, f({ selectable: true }))).toBe('select');
        expect(commitDecision('create', true, true, f({ selectable: true, useEditor: true }))).toBe('selectEditor');
        // dragged but not selectable -> falls through to the click handling
        expect(commitDecision('create', true, true, f({ selectable: false }))).toBe('dateClick');
    });
    it('create: a plain click opens the create editor or fires onDateClick', () => {
        expect(commitDecision('create', false, false, f({ useEditor: true }))).toBe('createEditor');
        expect(commitDecision('create', false, false, f())).toBe('dateClick');
    });
});
