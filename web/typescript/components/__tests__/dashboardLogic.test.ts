import {
    clampGeom, clampInt, effectiveTiles, gridStyle, layoutOf, rowsUsed, DashTile
} from '../dashboard/dashboardLogic';

const tile = (id: string, x: number, y: number, w: number, h: number, extra: Partial<DashTile> = {}): DashTile => ({
    id, title: id, viewPath: `views/${id}`, viewParams: {}, x, y, w, h, minW: 1, minH: 1, ...extra
});

describe('clampInt', () => {
    it('rounds and clamps to range', () => {
        expect(clampInt(3.4, 0, 10)).toBe(3);
        expect(clampInt(-2, 0, 10)).toBe(0);
        expect(clampInt(99, 0, 10)).toBe(10);
        expect(clampInt(NaN, 2, 10)).toBe(2);
    });
});

describe('clampGeom', () => {
    it('keeps a valid tile within the grid', () => {
        expect(clampGeom({ x: 2, y: 1, w: 3, h: 2 }, 12)).toEqual({ x: 2, y: 1, w: 3, h: 2 });
    });
    it('shrinks width to the column count and pulls x back in', () => {
        expect(clampGeom({ x: 10, y: 0, w: 6, h: 2 }, 12)).toEqual({ x: 6, y: 0, w: 6, h: 2 });
        expect(clampGeom({ x: 0, y: 0, w: 20, h: 2 }, 12)).toEqual({ x: 0, y: 0, w: 12, h: 2 });
    });
    it('honours min width/height', () => {
        expect(clampGeom({ x: 0, y: 0, w: 1, h: 1 }, 12, 3, 2)).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    });
});

describe('effectiveTiles', () => {
    const tiles = [tile('a', 0, 0, 3, 2), tile('b', 3, 0, 3, 2)];

    it('uses authored geometry when no override', () => {
        const eff = effectiveTiles(tiles, {}, 12);
        expect(eff.map((t) => ({ id: t.id, x: t.x, w: t.w }))).toEqual([
            { id: 'a', x: 0, w: 3 }, { id: 'b', x: 3, w: 3 }
        ]);
    });

    it('applies a two-way layout override by id, clamped', () => {
        const eff = effectiveTiles(tiles, { a: { x: 9, y: 4, w: 4, h: 3 } }, 12);
        const a = eff.find((t) => t.id === 'a')!;
        expect({ x: a.x, y: a.y, w: a.w, h: a.h }).toEqual({ x: 8, y: 4, w: 4, h: 3 }); // x pulled in (8+4=12)
        expect(eff.find((t) => t.id === 'b')!.x).toBe(3); // untouched
    });

    it('preserves content fields', () => {
        const eff = effectiveTiles(tiles, {}, 12);
        expect(eff[0].viewPath).toBe('views/a');
    });
});

describe('gridStyle', () => {
    it('emits 1-based span placement', () => {
        expect(gridStyle({ x: 0, y: 0, w: 3, h: 2 })).toEqual({ gridColumn: '1 / span 3', gridRow: '1 / span 2' });
        expect(gridStyle({ x: 6, y: 4, w: 2, h: 1 })).toEqual({ gridColumn: '7 / span 2', gridRow: '5 / span 1' });
    });
});

describe('rowsUsed / layoutOf', () => {
    it('reports the tallest tile extent', () => {
        expect(rowsUsed([tile('a', 0, 0, 3, 2), tile('b', 3, 3, 3, 4)])).toBe(7);
        expect(rowsUsed([])).toBe(0);
    });
    it('produces the id->geometry map for write-back', () => {
        expect(layoutOf([tile('a', 1, 2, 3, 4)])).toEqual({ a: { x: 1, y: 2, w: 3, h: 4 } });
    });
});
