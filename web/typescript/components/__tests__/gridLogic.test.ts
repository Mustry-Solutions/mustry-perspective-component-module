import {
    GridColumn, OVERSCAN_ROWS,
    cellText, columnLayout, gridIsEmpty, visibleRowRange
} from '../grid/gridLogic';
import { mapGridProps } from '../grid/gridProps';
import { stubReader } from './_stubReader';

const col = (field: string, over: Partial<GridColumn> = {}): GridColumn =>
    ({ field, header: '', width: 100, pinned: false, align: 'left', type: 'text', decimals: -1, cellStyles: [], editable: true, required: false, pattern: '', options: [], aggregate: '', ...over });

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

    it('stale scrollTop beyond a shrunk view renders the tail, never nothing', () => {
        // filtered from 50k to 100 rows while scrolled to row ~25,000
        const r = visibleRowRange(800000, 320, 32, 100);
        expect(r.first).toBeLessThanOrEqual(r.last);
        expect(r.last).toBe(99);
        expect(r.first).toBe(99);   // clamped into the dataset
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

import {
    GridSort, compareValues, gridToCsv, nextSelection, nextSort, quickFilterRows, sortRows
} from '../grid/gridLogic';
import { csvCell } from '../../shared/csv';

describe('nextSort (header-click cycle)', () => {
    it('cycles asc -> desc -> off per column, restarts on a new column', () => {
        const off: GridSort = { field: '', dir: '' };
        const asc = nextSort(off, 'qty');
        expect(asc).toEqual({ field: 'qty', dir: 'asc' });
        const desc = nextSort(asc, 'qty');
        expect(desc).toEqual({ field: 'qty', dir: 'desc' });
        expect(nextSort(desc, 'qty')).toEqual({ field: '', dir: '' });
        expect(nextSort(desc, 'wo')).toEqual({ field: 'wo', dir: 'asc' });
    });
});

describe('sortRows / compareValues', () => {
    const rows = [
        { n: 10, s: 'b' }, { n: 2, s: 'A' }, { n: null, s: 'c' }, { n: 30, s: '' }
    ] as Array<Record<string, unknown>>;

    it('sorts numerically (numeric strings too) and textually case-insensitive', () => {
        expect(sortRows(rows, { field: 'n', dir: 'asc' }).map((r) => r.n)).toEqual([2, 10, 30, null]);
        expect(sortRows(rows, { field: 's', dir: 'asc' }).map((r) => r.s)).toEqual(['A', 'b', 'c', '']);
        expect(compareValues('9', '10')).toBeLessThan(0);   // numeric strings compare as numbers
    });

    it('empties sort last in BOTH directions; input order kept on ties; no mutation', () => {
        expect(sortRows(rows, { field: 'n', dir: 'desc' }).map((r) => r.n)).toEqual([30, 10, 2, null]);
        expect(rows[0].n).toBe(10);   // untouched (bound prop)
        expect(sortRows(rows, { field: '', dir: '' })).toBe(rows);
    });
});

describe('quickFilterRows', () => {
    const cols = [col('a'), col('b')];
    const rows = [{ a: 'Widget', b: 1 }, { a: 'Gasket', b: 22 }] as Array<Record<string, unknown>>;

    it('contains-matches any configured column, case-insensitive; blank = all', () => {
        expect(quickFilterRows(rows, cols, 'widg').length).toBe(1);
        expect(quickFilterRows(rows, cols, '22').length).toBe(1);
        expect(quickFilterRows(rows, cols, '  ')).toBe(rows);
        expect(quickFilterRows(rows, cols, 'zzz').length).toBe(0);
    });
});

describe('nextSelection', () => {
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];

    it("mode 'none' never selects; 'single' replaces and click-again clears", () => {
        expect(nextSelection([], 'r1', 'none', { toggle: false, range: false }, ids, '')).toEqual([]);
        expect(nextSelection([], 'r1', 'single', { toggle: false, range: false }, ids, '')).toEqual(['r1']);
        expect(nextSelection(['r1'], 'r1', 'single', { toggle: false, range: false }, ids, '')).toEqual([]);
    });

    it("'multi': plain click replaces, ctrl toggles, shift ranges over the view order", () => {
        expect(nextSelection(['r1', 'r2'], 'r4', 'multi', { toggle: false, range: false }, ids, 'r1')).toEqual(['r4']);
        expect(nextSelection(['r1'], 'r3', 'multi', { toggle: true, range: false }, ids, 'r1')).toEqual(['r1', 'r3']);
        expect(nextSelection(['r1', 'r3'], 'r3', 'multi', { toggle: true, range: false }, ids, 'r1')).toEqual(['r1']);
        expect(nextSelection(['r4'], 'r2', 'multi', { toggle: false, range: true }, ids, 'r4')).toEqual(['r2', 'r3', 'r4']);
    });

    it('shift without a valid anchor falls back to a plain click', () => {
        expect(nextSelection([], 'r2', 'multi', { toggle: false, range: true }, ids, 'gone')).toEqual(['r2']);
    });
});

describe('gridToCsv', () => {
    it('exports headers (falling back to field) + injection-guarded cells, CRLF', () => {
        const cols = [col('wo', { header: 'Order' }), col('note')];
        const csv = gridToCsv(cols, [{ wo: 'WO-1', note: '=SUM(A1)' }], csvCell);
        const lines = csv.split('\r\n');
        expect(lines[0]).toBe('Order,note');
        expect(lines[1]).toContain("'=SUM(A1)");   // formula-injection guard
    });
});

import {
    CellStyleRule, ColumnLayoutState,
    effectiveColumns, formatCell, matchStyle, reorderFields
} from '../grid/gridLogic';

const LAYOUT0: ColumnLayoutState = { widths: {}, order: [], hidden: [] };

describe('effectiveColumns (two-way layout over config)', () => {
    const cols = [col('a', { width: 100 }), col('b', { width: 100 }), col('c', { width: 100 })];

    it('applies hidden, order and width overrides without touching config', () => {
        const out = effectiveColumns(cols, { widths: { c: 55 }, order: ['c', 'a'], hidden: ['b'] });
        expect(out.map((c) => c.field)).toEqual(['c', 'a']);
        expect(out[0].width).toBe(55);
        expect(cols[2].width).toBe(100);   // config untouched
    });

    it('clamps width overrides and keeps unlisted fields in config position', () => {
        const out = effectiveColumns(cols, { widths: { a: 5 }, order: ['b'], hidden: [] });
        expect(out.map((c) => c.field)).toEqual(['b', 'a', 'c']);
        expect(out[1].width).toBe(40);     // MIN_COL_PX
        expect(effectiveColumns(cols, LAYOUT0)).toEqual(cols);
    });
});

describe('reorderFields', () => {
    it('moves from onto to, over the visible sequence', () => {
        expect(reorderFields(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
        expect(reorderFields(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
        expect(reorderFields(['a', 'b'], 'a', 'missing')).toEqual(['a', 'b']);
    });
});

describe('formatCell (typed display text)', () => {
    it('numbers: locale grouping + fixed decimals; junk falls back to raw', () => {
        expect(formatCell(1234.5, col('n', { type: 'number', decimals: 2 }), 'en')).toBe('1,234.50');
        expect(formatCell('1234.5', col('n', { type: 'number', decimals: -1 }), 'en')).toBe('1,234.5');
        expect(formatCell('n/a', col('n', { type: 'number', decimals: 0 }), 'en')).toBe('n/a');
    });

    it('dates: ISO date-only stays on its wall date (no TZ shift); junk falls back', () => {
        expect(formatCell('2026-07-06', col('d', { type: 'date' }), 'en')).toBe('Jul 6, 2026');
        expect(formatCell('not a date', col('d', { type: 'date' }), 'en')).toBe('not a date');
    });

    it('booleans render check/dash; empties render blank', () => {
        expect(formatCell(true, col('b', { type: 'boolean' }), 'en')).toBe('✓');
        expect(formatCell(false, col('b', { type: 'boolean' }), 'en')).toBe('—');
        expect(formatCell(null, col('b', { type: 'boolean' }), 'en')).toBe('');
    });
});

describe('matchStyle (first matching rule wins)', () => {
    const rules: CellStyleRule[] = [
        { equals: 'urgent', color: 'red' },
        { gt: 900, background: 'gold' },
        { contains: 'hold', color: 'orange' }
    ];

    it('equals / numeric band / contains, in rule order', () => {
        expect(matchStyle('urgent', rules)?.color).toBe('red');
        expect(matchStyle(950, rules)?.background).toBe('gold');
        expect(matchStyle('on hold', rules)?.color).toBe('orange');
        expect(matchStyle('normal', rules)).toBeNull();
    });

    it('gt+lt combine as a band', () => {
        const band: CellStyleRule[] = [{ gt: 10, lt: 20, background: 'x' }];
        expect(matchStyle(15, band)).not.toBeNull();
        expect(matchStyle(25, band)).toBeNull();
    });
});

import { editDraft, nextCell, validateCell } from '../grid/gridLogic';

describe('validateCell (parse + validate per column type)', () => {
    it('numbers: parses (decimal comma too), enforces min/max, types the commit', () => {
        const qty = col('q', { type: 'number', min: 0, max: 999, required: true });
        expect(validateCell('42', qty)).toEqual({ value: 42, error: null });
        expect(validateCell('4,5', qty)).toEqual({ value: 4.5, error: null });
        expect(validateCell('abc', qty).error).toBe('number');
        expect(validateCell('-1', qty).error).toBe('min');
        expect(validateCell('1000', qty).error).toBe('max');
        expect(validateCell('', qty).error).toBe('required');
    });

    it('required only blocks empties; optional empties commit as empty', () => {
        expect(validateCell('', col('t')).error).toBeNull();
    });

    it('pattern gates text; a broken authored regex never blocks the operator', () => {
        expect(validateCell('WO-1', col('t', { pattern: '^WO-\\d+$' })).error).toBeNull();
        expect(validateCell('nope', col('t', { pattern: '^WO-\\d+$' })).error).toBe('pattern');
        expect(validateCell('x', col('t', { pattern: '[' })).error).toBeNull();
    });

    it('options restrict the value; booleans always commit a real boolean', () => {
        const sel = col('s', { options: [{ value: 'a', label: 'A' }] });
        expect(validateCell('a', sel).error).toBeNull();
        expect(validateCell('z', sel).error).toBe('option');
        expect(validateCell('true', col('b', { type: 'boolean' }))).toEqual({ value: true, error: null });
    });
});

describe('editDraft', () => {
    it('edits the RAW value, not the localized rendering', () => {
        expect(editDraft(1234.5, col('n', { type: 'number' }))).toBe('1234.5');
        expect(editDraft('2026-07-06', col('d', { type: 'date' }))).toBe('2026-07-06');
        expect(editDraft(null, col('t'))).toBe('');
    });
});

describe('nextCell (keyboard grid navigation)', () => {
    it('arrows move and clamp; Tab wraps to the next row', () => {
        expect(nextCell({ row: 0, col: 0 }, 'ArrowUp', 10, 5)).toEqual({ row: 0, col: 0 });
        expect(nextCell({ row: 3, col: 2 }, 'ArrowDown', 10, 5)).toEqual({ row: 4, col: 2 });
        expect(nextCell({ row: 3, col: 4 }, 'Tab', 10, 5)).toEqual({ row: 4, col: 0 });
        expect(nextCell({ row: 4, col: 0 }, 'ShiftTab', 10, 5)).toEqual({ row: 3, col: 4 });
        expect(nextCell({ row: 9, col: 1 }, 'Enter', 10, 5)).toEqual({ row: 9, col: 1 });
        expect(nextCell({ row: 0, col: 3 }, 'Home', 10, 5)).toEqual({ row: 0, col: 0 });
    });
});

import { aggregateValue, batchPayload, parsePasteMatrix, pastePlan } from '../grid/gridLogic';

describe('batchPayload (Save in batch mode)', () => {
    const rows = [{ id: 'r1', a: 1, b: 'x' }, { id: 'r2', a: 2, b: 'y' }] as Array<Record<string, unknown>>;

    it('builds per-cell edits and fully-patched changed rows', () => {
        const { edits, rows: changed } = batchPayload({ 'r1::a': 9, 'r1::b': 'z', 'r2::a': 5 }, rows, 'id');
        expect(edits).toHaveLength(3);
        expect(edits.find((e) => e.rowId === 'r1' && e.field === 'a')).toEqual(
            { rowId: 'r1', field: 'a', oldValue: 1, newValue: 9 });
        const r1 = changed.find((r) => r.id === 'r1');
        expect(r1).toEqual({ id: 'r1', a: 9, b: 'z' });   // both pendings applied
        expect(changed).toHaveLength(2);
    });

    it('drops pendings whose row left the dataset', () => {
        expect(batchPayload({ 'gone::a': 1 }, rows, 'id').edits).toHaveLength(0);
    });
});

describe('parsePasteMatrix / pastePlan (Excel range paste)', () => {
    it('parses TSV with CRLF and a trailing newline', () => {
        expect(parsePasteMatrix('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
        expect(parsePasteMatrix('single')).toEqual([['single']]);
    });

    it('maps from the focused cell, skips non-editable columns, clamps at edges', () => {
        const cols = [col('a'), col('b', { editable: false }), col('c')];
        const plan = pastePlan([['1', '2', '3'], ['4', '5', '6']], { row: 8, col: 0 }, cols, 10);
        // column b dropped; row 9 is the last row (rowCount 10)
        expect(plan).toEqual([
            { row: 8, col: 0, draft: '1' }, { row: 8, col: 2, draft: '3' },
            { row: 9, col: 0, draft: '4' }, { row: 9, col: 2, draft: '6' }
        ]);
        expect(pastePlan([['x']], { row: 9, col: 2 }, cols, 10)).toEqual([{ row: 9, col: 2, draft: 'x' }]);
    });
});

describe('aggregateValue (footer)', () => {
    const rows = [{ q: 10 }, { q: '20' }, { q: 'junk' }, { q: null }] as Array<Record<string, unknown>>;

    it('sum/avg/min/max over numeric cells only; count counts non-empty', () => {
        expect(aggregateValue(rows, col('q', { aggregate: 'sum' }))).toBe(30);
        expect(aggregateValue(rows, col('q', { aggregate: 'avg' }))).toBe(15);
        expect(aggregateValue(rows, col('q', { aggregate: 'min' }))).toBe(10);
        expect(aggregateValue(rows, col('q', { aggregate: 'count' }))).toBe(3);
        expect(aggregateValue(rows, col('q'))).toBeNull();
        expect(aggregateValue([], col('q', { aggregate: 'sum' }))).toBeNull();
    });
});
