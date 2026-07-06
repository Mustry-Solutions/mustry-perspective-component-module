// Pure geometry/layout logic for the Data Grid — no DOM, no React, fully unit-tested.
// Fixed row height is the contract that keeps virtualization exact (see the schema).

export type ColumnType = 'text' | 'number' | 'date' | 'datetime' | 'boolean';

/** One conditional-styling rule; the first matching rule wins. */
export interface CellStyleRule {
    equals?: unknown;
    gt?: number;
    lt?: number;
    contains?: string;
    color?: string;
    background?: string;
}

/** One configured column, already validated by gridProps. */
export interface GridColumn {
    field: string;
    header: string;       // '' = fall back to the field name
    width: number;        // px, >= MIN_COL_PX
    pinned: boolean;
    align: 'left' | 'center' | 'right';
    type: ColumnType;
    decimals: number;     // number columns: fixed fraction digits (-1 = as-is)
    cellStyles: CellStyleRule[];
}

export const MIN_COL_PX = 40;
export const ROW_H_MIN = 20;
export const ROW_H_MAX = 80;

/** Rows drawn above/below the viewport so scrolling never shows a blank edge. */
export const OVERSCAN_ROWS = 6;

export interface RowRange {
    first: number;   // inclusive
    last: number;    // inclusive; first > last when there are no rows
}

/** The row indexes to render for the current scroll position (with overscan). */
export function visibleRowRange(scrollTop: number, viewportHeight: number, rowHeight: number, rowCount: number): RowRange {
    if (rowCount <= 0 || viewportHeight <= 0) {
        return { first: 0, last: -1 };
    }
    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
    const last = Math.min(rowCount - 1, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS);
    return { first, last };
}

/** A column with its resolved geometry. Pinned columns carry the sticky `left`
 *  offset (cumulative pinned widths); scrolling columns carry left = -1. */
export interface LaidColumn {
    col: GridColumn;
    width: number;
    left: number;
}

export interface ColumnLayout {
    pinned: LaidColumn[];
    scrolling: LaidColumn[];
    pinnedWidth: number;   // total width of the frozen block
    totalWidth: number;    // full content width (pinned + scrolling)
}

/** Split columns into the frozen block (in config order, packed left) and the
 *  scrolling block, with cumulative sticky offsets for the frozen ones. */
export function columnLayout(columns: GridColumn[]): ColumnLayout {
    const pinned: LaidColumn[] = [];
    const scrolling: LaidColumn[] = [];
    let left = 0;
    for (const col of columns) {
        if (col.pinned) {
            pinned.push({ col, width: col.width, left });
            left += col.width;
        }
    }
    for (const col of columns) {
        if (!col.pinned) {
            scrolling.push({ col, width: col.width, left: -1 });
        }
    }
    const pinnedWidth = left;
    const totalWidth = pinnedWidth + scrolling.reduce((w, c) => w + c.width, 0);
    return { pinned, scrolling, pinnedWidth, totalWidth };
}

/** Cell display text for a raw row value. M0 renders raw values; typed
 *  formatting (number/date/locale) is an M1 concern layered on top of this. */
export function cellText(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

/** Configured-but-empty (drives the toolbar-less empty badge): no rows and not
 *  mid-fetch (config.loading suppresses it — stale-while-revalidate). */
export function gridIsEmpty(loading: boolean, rows: unknown[]): boolean {
    return !loading && (rows || []).length === 0;
}

// --- M1: sort / quick filter / selection / CSV -----------------------------------

export type SortDir = 'asc' | 'desc' | '';

export interface GridSort {
    field: string;
    dir: SortDir;
}

/** The next sort after clicking a header: asc -> desc -> off (per column). */
export function nextSort(current: GridSort, field: string): GridSort {
    if (current.field !== field || current.dir === '') {
        return { field, dir: 'asc' };
    }
    return current.dir === 'asc' ? { field, dir: 'desc' } : { field: '', dir: '' };
}

/** Type-aware compare: numbers numerically (numeric strings too), everything
 *  else case-insensitively as text; null/undefined/'' sort last in both dirs. */
export function compareValues(a: unknown, b: unknown): number {
    const aEmpty = a === null || a === undefined || a === '';
    const bEmpty = b === null || b === undefined || b === '';
    if (aEmpty || bEmpty) {
        return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;
    }
    const an = typeof a === 'number' ? a : Number(a);
    const bn = typeof b === 'number' ? b : Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) {
        return an - bn;
    }
    return cellText(a).localeCompare(cellText(b), undefined, { sensitivity: 'base' });
}

/** A sorted copy (stable; the input is never mutated — rows are a bound prop). */
export function sortRows<T extends Record<string, unknown>>(rows: T[], sort: GridSort): T[] {
    if (!sort.field || !sort.dir) {
        return rows;
    }
    const sign = sort.dir === 'desc' ? -1 : 1;
    return rows
        .map((row, i) => ({ row, i }))
        .sort((x, y) => {
            const c = compareValues(x.row[sort.field], y.row[sort.field]);
            // empties stay last regardless of direction; ties keep input order
            const xe = x.row[sort.field] === null || x.row[sort.field] === undefined || x.row[sort.field] === '';
            const ye = y.row[sort.field] === null || y.row[sort.field] === undefined || y.row[sort.field] === '';
            if (xe !== ye) {
                return c;
            }
            return c !== 0 ? sign * c : x.i - y.i;
        })
        .map((x) => x.row);
}

/** Case-insensitive contains across the visible columns, matching the DISPLAYED
 *  text (formatted per column type/locale) — what you see is what you search. */
export function quickFilterRows<T extends Record<string, unknown>>(rows: T[], columns: GridColumn[], query: string, locale: string = ''): T[] {
    const q = query.trim().toLowerCase();
    if (!q) {
        return rows;
    }
    return rows.filter((row) => columns.some((c) => formatCell(row[c.field], c, locale).toLowerCase().indexOf(q) >= 0));
}

export type RowSelectMode = 'none' | 'single' | 'multi';

/** The next selection after clicking a row. `orderedIds` is the CURRENT view
 *  order (filtered + sorted), so shift-ranges match what the user sees; the
 *  anchor is the previously clicked id (kept by the component). */
export function nextSelection(
    current: string[], clickedId: string, mode: RowSelectMode,
    modifiers: { toggle: boolean; range: boolean }, orderedIds: string[], anchorId: string
): string[] {
    if (mode === 'none' || !clickedId) {
        return current;
    }
    if (mode === 'single') {
        return current.length === 1 && current[0] === clickedId ? [] : [clickedId];
    }
    if (modifiers.range && anchorId) {
        const a = orderedIds.indexOf(anchorId);
        const b = orderedIds.indexOf(clickedId);
        if (a >= 0 && b >= 0) {
            return orderedIds.slice(Math.min(a, b), Math.max(a, b) + 1);
        }
    }
    if (modifiers.toggle) {
        return current.indexOf(clickedId) >= 0 ? current.filter((id) => id !== clickedId) : [...current, clickedId];
    }
    return current.length === 1 && current[0] === clickedId ? [] : [clickedId];
}

/** CSV of the current view (filtered + sorted, visible columns, displayed text). */
export function gridToCsv<T extends Record<string, unknown>>(columns: GridColumn[], rows: T[], csvCell: (v: string) => string, locale: string = ''): string {
    const head = columns.map((c) => csvCell(c.header || c.field)).join(',');
    const lines = rows.map((r) => columns.map((c) => csvCell(formatCell(r[c.field], c, locale))).join(','));
    return [head, ...lines].join('\r\n') + '\r\n';
}

// --- M1b: column layout state / typed formatting / conditional styling -----------

/** User adjustments over config.columns, two-way in state.columnLayout. */
export interface ColumnLayoutState {
    widths: Record<string, number>;
    order: string[];
    hidden: string[];
}

/** config.columns with the user's layout applied: hidden filtered out, order
 *  permuted (fields in `order` first, in that order; the rest keep config
 *  position), widths overridden (clamped). config stays the authoring truth. */
export function effectiveColumns(columns: GridColumn[], layout: ColumnLayoutState): GridColumn[] {
    const hidden = new Set(layout.hidden);
    const visible = columns.filter((c) => !hidden.has(c.field));
    const pos = (c: GridColumn): number => {
        const i = layout.order.indexOf(c.field);
        return i >= 0 ? i : layout.order.length + visible.indexOf(c);
    };
    return visible
        .slice()
        .sort((a, b) => pos(a) - pos(b))
        .map((c) => {
            const w = layout.widths[c.field];
            return Number.isFinite(w) ? { ...c, width: Math.max(MIN_COL_PX, w) } : c;
        });
}

/** The order array after dropping `from` at `to`'s position (over the given
 *  visible field sequence — persists the FULL sequence so it's unambiguous). */
export function reorderFields(visibleFields: string[], from: string, to: string): string[] {
    const seq = visibleFields.slice();
    const i = seq.indexOf(from);
    const j = seq.indexOf(to);
    if (i < 0 || j < 0 || i === j) {
        return seq;
    }
    seq.splice(i, 1);
    seq.splice(j, 0, from);
    return seq;
}

// Formatter caches — creating Intl formatters per cell is wasteful.
const numFmts = new Map<string, Intl.NumberFormat>();
const dateFmts = new Map<string, Intl.DateTimeFormat>();

function numFmt(locale: string, decimals: number): Intl.NumberFormat {
    const k = `${locale}|${decimals}`;
    let f = numFmts.get(k);
    if (!f) {
        f = new Intl.NumberFormat(locale || undefined,
            decimals >= 0 ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : {});
        numFmts.set(k, f);
    }
    return f;
}

function dateFmt(locale: string, withTime: boolean): Intl.DateTimeFormat {
    const k = `${locale}|${withTime}`;
    let f = dateFmts.get(k);
    if (!f) {
        f = new Intl.DateTimeFormat(locale || undefined,
            withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
        dateFmts.set(k, f);
    }
    return f;
}

/** Parse a cell date: ISO date-only as LOCAL wall date (no TZ shift), anything
 *  else through Date. Returns null when unparseable. */
function parseCellDate(value: unknown): Date | null {
    if (value instanceof Date) {
        return value;
    }
    const s = String(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/** Display text for a cell, honouring the column type + locale. Falls back to
 *  the raw text whenever the value doesn't fit the type (never hides data). */
export function formatCell(value: unknown, col: GridColumn, locale: string): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    switch (col.type) {
        case 'number': {
            const n = typeof value === 'number' ? value : Number(value);
            return Number.isFinite(n) ? numFmt(locale, col.decimals).format(n) : cellText(value);
        }
        case 'date':
        case 'datetime': {
            const d = parseCellDate(value);
            return d ? dateFmt(locale, col.type === 'datetime').format(d) : cellText(value);
        }
        case 'boolean':
            return value === true || value === 'true' ? '\u2713' : '\u2014';
        default:
            return cellText(value);
    }
}

/** The first matching conditional-style rule for a value (null = none). */
export function matchStyle(value: unknown, rules: CellStyleRule[]): CellStyleRule | null {
    for (const r of rules) {
        if (r.equals !== undefined) {
            if (cellText(value) === cellText(r.equals)) {
                return r;
            }
            continue;
        }
        const n = typeof value === 'number' ? value : Number(value);
        if (r.gt !== undefined || r.lt !== undefined) {
            if (Number.isFinite(n) && (r.gt === undefined || n > r.gt) && (r.lt === undefined || n < r.lt)) {
                return r;
            }
            continue;
        }
        if (r.contains !== undefined && cellText(value).toLowerCase().indexOf(String(r.contains).toLowerCase()) >= 0) {
            return r;
        }
    }
    return null;
}
