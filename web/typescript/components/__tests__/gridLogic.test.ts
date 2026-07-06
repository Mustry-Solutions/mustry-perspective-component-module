import {
    GridColumn, OVERSCAN_ROWS,
    cellText, columnLayout, gridIsEmpty, visibleRowRange
} from '../grid/gridLogic';
import { mapGridProps } from '../grid/gridProps';
import { stubReader } from './_stubReader';

const col = (field: string, over: Partial<GridColumn> = {}): GridColumn =>
    ({ field, header: '', width: 100, pinned: false, align: 'left', ...over });

describe('visibleRowRange (row virtualization window)', () => {
    it('windows the visible rows plus overscan', () => {
        // 32px rows, viewport 320px, scrolled to row 100
        const r = visibleRowRange(3200, 320, 32, 10000);
        expect(r.first).toBe(100 - OVERSCAN_ROWS);
        expect(r.last).toBe(110 + OVERSCAN_ROWS);
    });

    it('clamps at both ends', () => {
        expect(visibleRowRange(0, 320, 32, 10000).first).toBe(0);
        const r = visibleRowRange(10000 * 32, 320, 32, 10000);
        expect(r.last).toBe(9999);
    });

    it('is empty for no rows or an unmeasured viewport', () => {
        expect(visibleRowRange(0, 320, 32, 0).last).toBeLessThan(0);
        expect(visibleRowRange(0, 0, 32, 100).last).toBeLessThan(0);
    });

    it('fractional scroll positions still cover the viewport', () => {
        const r = visibleRowRange(1000, 500, 32, 10000);
        expect(r.first * 32).toBeLessThanOrEqual(1000);
        expect((r.last + 1) * 32).toBeGreaterThanOrEqual(1500);
    });
});

describe('columnLayout (frozen block + scrolling block)', () => {
    it('packs pinned columns left with cumulative sticky offsets', () => {
        const l = columnLayout([col('a', { pinned: true, width: 80 }), col('b'), col('c', { pinned: true, width: 60 })]);
        expect(l.pinned.map((c) => c.col.field)).toEqual(['a', 'c']);
        expect(l.pinned.map((c) => c.left)).toEqual([0, 80]);
        expect(l.pinnedWidth).toBe(140);
        expect(l.scrolling.map((c) => c.col.field)).toEqual(['b']);
        expect(l.totalWidth).toBe(240);
    });

    it('handles the no-pinned and all-pinned cases', () => {
        expect(columnLayout([col('a'), col('b')]).pinnedWidth).toBe(0);
        const all = columnLayout([col('a', { pinned: true }), col('b', { pinned: true })]);
        expect(all.scrolling).toEqual([]);
        expect(all.totalWidth).toBe(all.pinnedWidth);
    });
});

describe('cellText', () => {
    it('renders raw values, blanks null/undefined, stringifies objects', () => {
        expect(cellText('x')).toBe('x');
        expect(cellText(0)).toBe('0');
        expect(cellText(false)).toBe('false');
        expect(cellText(null)).toBe('');
        expect(cellText(undefined)).toBe('');
        expect(cellText({ a: 1 })).toBe('{"a":1}');
    });
});

describe('gridIsEmpty', () => {
    it('empty only when no rows and not loading', () => {
        expect(gridIsEmpty(false, [])).toBe(true);
        expect(gridIsEmpty(true, [])).toBe(false);
        expect(gridIsEmpty(false, [{}])).toBe(false);
    });
});

describe('mapGridProps', () => {
    it('validates columns: drops empty fields, clamps width, defaults align', () => {
        const p = mapGridProps(stubReader({
            config: {
                columns: [
                    { field: 'wo', header: 'Order', width: 90, pinned: true },
                    { field: '', header: 'ghost' },
                    { field: 'qty', width: 10, align: 'right' },
                    { field: 'weird', align: 'diagonal' }
                ]
            }
        }));
        expect(p.columns.map((c) => c.field)).toEqual(['wo', 'qty', 'weird']);
        expect(p.columns[0].pinned).toBe(true);
        expect(p.columns[1].width).toBe(120);        // under-minimum -> default
        expect(p.columns[1].align).toBe('right');
        expect(p.columns[2].align).toBe('left');     // invalid -> left
    });

    it('clamps rowHeight and filters non-object rows', () => {
        const p = mapGridProps(stubReader({
            config: { rowHeight: 500 },
            data: { rows: [{ a: 1 }, null, 'nope', { b: 2 }] }
        }));
        expect(p.rowHeight).toBe(80);
        expect(p.rows.length).toBe(2);
    });

    it('labels follow the locale pack; emptyMessage default localizes downstream', () => {
        const p = mapGridProps(stubReader({ config: { locale: 'fr' } }));
        expect(p.labels.noRows).toBe('Aucune ligne');
        expect(p.emptyMessage).toBe('No rows');
    });
});
