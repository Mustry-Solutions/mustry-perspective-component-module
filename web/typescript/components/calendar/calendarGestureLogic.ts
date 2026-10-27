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

/** A gesture counts as a drag once the pointer moves past a small threshold.
 *  Lives in the shared drag lifecycle now; re-exported to keep this module the
 *  calendar's single pure-logic surface (and its tests in one place). */
export { hasMoved } from '../../shared/dragGestureController';

const DAY_MIN = 24 * 60;

// Move and resize work on the event's real minutes, which may lie outside the visible
// window (dayStartHour..dayEndHour): clamping them to the window made an event that
// runs past it jump or lose its tail on the first drag step (#147). Only the drawn
// ghost is clamped (visibleSpan). The real minutes stay within the event's day, so the
// committed times stay valid, and keep at least a slot on the grid, so the ghost can't
// vanish when the pointer leaves it. Neither bound pulls an edge off where it started.

/** Move: shift the block by `deltaMin`, keeping its duration. */
export function movePreview(
    origStartMin: number, durationMin: number, deltaMin: number, winStart: number, winEnd: number, snapMin: number
): MinuteRange {
    const keep = Math.min(durationMin, snapMin);
    const lo = Math.min(origStartMin, Math.max(0, winStart + keep - durationMin));
    const hi = Math.max(origStartMin, Math.min(DAY_MIN - durationMin, winEnd - keep));
    const startMin = Math.max(lo, Math.min(hi, origStartMin + deltaMin));
    return { startMin, endMin: startMin + durationMin };
}

/** Which edge of an event a resize gesture grabbed. */
export type ResizeEdge = 'start' | 'end';

/** Resize one edge by `deltaMin`, keeping at least `snapMin` of duration (the
 *  untouched edge stays put, matching the timeline's semantics). */
export function resizePreview(
    edge: ResizeEdge, origStartMin: number, origEndMin: number, deltaMin: number,
    winStart: number, winEnd: number, snapMin: number
): MinuteRange {
    if (edge === 'start') {
        const hi = Math.min(origEndMin - snapMin, Math.max(origStartMin, winEnd - snapMin));
        const startMin = Math.max(0, Math.min(hi, origStartMin + deltaMin));
        return { startMin, endMin: origEndMin };
    }
    const lo = Math.max(origStartMin + snapMin, Math.min(origEndMin, winStart + snapMin));
    const endMin = Math.max(lo, Math.min(Math.max(origEndMin, DAY_MIN), origEndMin + deltaMin));
    return { startMin: origStartMin, endMin };
}

/** The part of a preview the grid draws: its minutes clamped to the visible window. */
export function visibleSpan(startMin: number, endMin: number, winStart: number, winEnd: number): MinuteRange {
    return { startMin: Math.max(startMin, winStart), endMin: Math.min(endMin, winEnd) };
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
