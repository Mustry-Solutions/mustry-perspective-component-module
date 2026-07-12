// Pure logic for the week/day drag gesture state machine — the geometry (preview
// clamping, column hit-testing, move threshold) and the commit decision. Kept
// perspective-client- and DOM-free so it can be unit-tested under node jest. The
// controller measures the DOM, calls these, and applies setState / fires events.
import { GestureMode } from './calendarTypes';

/** Horizontal extent of a day column (screen px), used to hit-test the pointer. */
export interface ColBound {
    day: string;
    left: number;
    right: number;
}

export interface MinuteRange {
    startMin: number;
    endMin: number;
}

/** The day column under `x`, or null if the pointer is outside every column. */
export function colAtX(cols: ColBound[], x: number): ColBound | null {
    for (const c of cols) {
        if (x >= c.left && x < c.right) {
            return c;
        }
    }
    return null;
}

/** Screen extent of a month day cell, used to hit-test the pointer in 2D. */
export interface CellBound {
    day: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** The month cell under (x, y), or null if the pointer is outside every cell. */
export function cellAt(cells: CellBound[], x: number, y: number): CellBound | null {
    for (const c of cells) {
        if (x >= c.left && x < c.right && y >= c.top && y < c.bottom) {
            return c;
        }
    }
    return null;
}

/** A gesture counts as a drag once the pointer moves past a small threshold. */
export function hasMoved(dx: number, dy: number, threshold = 4): boolean {
    return Math.abs(dx) + Math.abs(dy) > threshold;
}

/** Move: shift the block by `deltaMin`, clamped so it stays fully within the day window. */
export function movePreview(origStartMin: number, durationMin: number, deltaMin: number, winStart: number, winEnd: number): MinuteRange {
    const startMin = Math.max(winStart, Math.min(winEnd - durationMin, origStartMin + deltaMin));
    return { startMin, endMin: startMin + durationMin };
}

/** Which edge of an event a resize gesture grabbed. */
export type ResizeEdge = 'start' | 'end';

/** Resize one edge by `deltaMin`, keeping at least `snapMin` of duration and clamping
 *  to the window (the untouched edge stays put, matching the timeline's semantics). */
export function resizePreview(
    edge: ResizeEdge, origStartMin: number, origEndMin: number, deltaMin: number,
    winStart: number, winEnd: number, snapMin: number
): MinuteRange {
    if (edge === 'start') {
        const startMin = Math.min(origEndMin - snapMin, Math.max(winStart, origStartMin + deltaMin));
        return { startMin, endMin: origEndMin };
    }
    const endMin = Math.max(origStartMin + snapMin, Math.min(winEnd, origEndMin + deltaMin));
    return { startMin: origStartMin, endMin };
}

/** Whether a committed resize preview is a no-op (snapping pulled the edge back to
 *  the original times) — the component must not fire a phantom onChange for it. */
export function isNoopResize(origStartMin: number, origEndMin: number, previewStartMin: number, previewEndMin: number): boolean {
    return origStartMin === previewStartMin && origEndMin === previewEndMin;
}

/** Create: the range between the anchor and the current pointer, at least `snapMin` long. */
export function createPreview(anchorMin: number, currentMin: number, snapMin: number): MinuteRange {
    const a = Math.min(anchorMin, currentMin);
    const b = Math.max(anchorMin, currentMin);
    return { startMin: a, endMin: Math.max(b, a + snapMin) };
}

export type CommitKind =
    | 'editEvent'     // open the built-in editor on the clicked event
    | 'eventClick'    // fire onEventClick (no built-in editor)
    | 'move'          // commit a move
    | 'resize'        // commit a resize
    | 'selectEditor'  // open the editor on a dragged-out range
    | 'select'        // fire onSelect for a dragged-out range
    | 'createEditor'  // open the editor on a plain click on empty time
    | 'dateClick'     // fire onDateClick
    | 'none';         // nothing to do

export interface GestureFlags {
    editable: boolean;
    selectable: boolean;
    useEditor: boolean;        // built-in editor for create/select
    useEditorForEdit: boolean; // built-in editor for editing an existing event
}

/** Decide what a released gesture should do (the onDocUp branch table). */
export function commitDecision(mode: GestureMode, moved: boolean, hasPreview: boolean, f: GestureFlags): CommitKind {
    if (mode === 'move') {
        if (!f.editable || !moved || !hasPreview) {
            return f.useEditorForEdit ? 'editEvent' : 'eventClick';
        }
        return 'move';
    }
    if (mode === 'resize') {
        return moved && hasPreview ? 'resize' : 'none';
    }
    // create
    if (moved && hasPreview && f.selectable) {
        return f.useEditor ? 'selectEditor' : 'select';
    }
    if (f.useEditor) {
        return 'createEditor';
    }
    return 'dateClick';
}
