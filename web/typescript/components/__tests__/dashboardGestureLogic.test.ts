import {
    cellsDelta, columnUnit, geomEquals, movePreview, resizePreview
} from '../dashboard/dashboardGestureLogic';

describe('cellsDelta', () => {
    it('rounds pixel delta to whole cells', () => {
        expect(cellsDelta(0, 100)).toBe(0);
        expect(cellsDelta(140, 100)).toBe(1);
        expect(cellsDelta(160, 100)).toBe(2);
        expect(cellsDelta(-160, 100)).toBe(-2);
        expect(cellsDelta(50, 0)).toBe(0);   // unmeasured grid
    });
});

describe('columnUnit', () => {
    it('derives one column step from grid width + gap', () => {
        // 12 cols, gap 8: width = 12*cellW + 11*8. For cellW=92 -> width = 1104+88 = 1192.
        // unit = (1192 + 8)/12 = 100.
        expect(columnUnit(1192, 12, 8)).toBeCloseTo(100, 5);
        expect(columnUnit(0, 0, 8)).toBe(0);
    });
});

describe('movePreview', () => {
    const orig = { x: 3, y: 2, w: 3, h: 2 };
    it('shifts within the grid', () => {
        expect(movePreview(orig, 2, 1, 12, 1, 1)).toEqual({ x: 5, y: 3, w: 3, h: 2 });
        expect(movePreview(orig, -5, -5, 12, 1, 1)).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    });
    it('clamps x so the tile stays fully on the grid (size kept)', () => {
        expect(movePreview(orig, 20, 0, 12, 1, 1)).toEqual({ x: 9, y: 2, w: 3, h: 2 }); // 9+3=12
    });
});

describe('resizePreview', () => {
    const orig = { x: 8, y: 0, w: 3, h: 2 };
    it('grows/shrinks from the SE corner, x/y fixed', () => {
        expect(resizePreview(orig, 1, 2, 12, 1, 1)).toEqual({ x: 8, y: 0, w: 4, h: 4 });
        expect(resizePreview(orig, -5, -5, 12, 2, 1)).toEqual({ x: 8, y: 0, w: 2, h: 1 }); // minW 2, minH 1
    });
    it('bounds width by the columns to the right of x (never pushes x)', () => {
        expect(resizePreview(orig, 10, 0, 12, 1, 1)).toEqual({ x: 8, y: 0, w: 4, h: 2 }); // 12-8=4 max
    });
});

describe('geomEquals', () => {
    it('compares all four fields', () => {
        expect(geomEquals({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 4 })).toBe(true);
        expect(geomEquals({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 5 })).toBe(false);
    });
});
