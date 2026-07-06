// Pure geometry/layout logic for the Data Grid — no DOM, no React, fully unit-tested.
// Fixed row height is the contract that keeps virtualization exact (see the schema).

/** One configured column, already validated by gridProps. */
export interface GridColumn {
    field: string;
    header: string;       // '' = fall back to the field name
    width: number;        // px, >= MIN_COL_PX
    pinned: boolean;
    align: 'left' | 'center' | 'right';
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

/** Case-insensitive contains across the configured columns. */
export function quickFilterRows<T extends Record<string, unknown>>(rows: T[], columns: GridColumn[], query: string): T[] {
    const q = query.trim().toLowerCase();
    if (!q) {
        return rows;
    }
    return rows.filter((row) => columns.some((c) => cellText(row[c.field]).toLowerCase().indexOf(q) >= 0));
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

/** CSV of the current view (filtered + sorted), configured columns only. */
export function gridToCsv<T extends Record<string, unknown>>(columns: GridColumn[], rows: T[], csvCell: (v: string) => string): string {
    const head = columns.map((c) => csvCell(c.header || c.field)).join(',');
    const lines = rows.map((r) => columns.map((c) => csvCell(cellText(r[c.field]))).join(','));
    return [head, ...lines].join('\r\n') + '\r\n';
}
