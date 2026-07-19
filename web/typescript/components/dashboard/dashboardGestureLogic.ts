// Pure geometry for the dashboard arrange gestures: pixel deltas → grid cells,
// and applying a move or a corner-resize to a tile within the column grid. No
// DOM — jest-tested. The DOM/lifecycle lives in dashboardGestureController.
import { TileGeom, clampGeom, clampInt } from './dashboardLogic';

export type DashGestureMode = 'move' | 'resize';
export type DashCommitKind = 'move' | 'resize';

/** Pixels → whole grid cells. `unit` is the pixel size of one cell step
 *  (column width + gap, or row height + gap). */
export function cellsDelta(px: number, unit: number): number {
    return unit > 0 ? Math.round(px / unit) : 0;
}

/** The pixel size of one column step: gridWidth = columns·cellW + (columns−1)·gap,
 *  so one column move spans cellW + gap = (gridWidth + gap) / columns. */
export function columnUnit(gridWidthPx: number, columns: number, gap: number): number {
    return columns > 0 ? (gridWidthPx + gap) / columns : 0;
}

/** Move: shift x/y by whole cells, clamp to the grid (size unchanged). */
export function movePreview(orig: TileGeom, dCols: number, dRows: number, columns: number, minW: number, minH: number): TileGeom {
    return clampGeom({ x: orig.x + dCols, y: orig.y + dRows, w: orig.w, h: orig.h }, columns, minW, minH);
}

/** SE-corner resize: grow/shrink w and h, x/y fixed (so w is bounded by the
 *  columns remaining to the right of x — clampGeom would otherwise pull x in). */
export function resizePreview(orig: TileGeom, dCols: number, dRows: number, columns: number, minW: number, minH: number): TileGeom {
    const w = clampInt(orig.w + dCols, Math.max(1, minW), columns - orig.x);
    const h = clampInt(orig.h + dRows, Math.max(1, minH), 9999);
    return { x: orig.x, y: orig.y, w, h };
}

export function geomEquals(a: TileGeom, b: TileGeom): boolean {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
