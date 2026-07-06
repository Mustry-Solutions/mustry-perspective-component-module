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
