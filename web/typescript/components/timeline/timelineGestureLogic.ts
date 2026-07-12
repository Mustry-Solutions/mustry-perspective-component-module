// Pure logic for the timeline's drag gesture state machine — epoch-space preview
// geometry, row hit-testing and the commit decision. DOM-free so it can be
// unit-tested under node jest; the controller measures the DOM, calls these, and
// applies setState / fires events (same split as the calendar's calendarGestureLogic).

export type TlGestureMode = 'move' | 'resize-start' | 'resize-end' | 'create';

export const MS_PER_MIN = 60000;

/** Round an epoch instant to the nearest snap step. */
export function snapMs(ms: number, snapMinutes: number): number {
    const step = Math.max(1, snapMinutes) * MS_PER_MIN;
    return Math.round(ms / step) * step;
}

export interface MsRange {
    startMs: number;
    endMs: number;
}

/** Move: shift the bar by the SNAPPED DELTA, preserving its duration — and its
 *  original grid offset (an 08:07 bar stays :07-aligned; a sloppy near-zero drag
 *  snaps back to exactly the original, so no silent retime on a wobbly click). */
export function movePreviewMs(origStartMs: number, origEndMs: number, deltaMs: number, snapMinutes: number): MsRange {
    const step = Math.max(1, snapMinutes) * MS_PER_MIN;
    const startMs = origStartMs + Math.round(deltaMs / step) * step;
    return { startMs, endMs: startMs + (origEndMs - origStartMs) };
}

/** Whether a committed move preview is a no-op (same row, same instants) — the
 *  component treats those as a click instead of firing a phantom onChange. */
export function isNoopMove(origStartMs: number, origResourceId: string, previewStartMs: number, previewResourceId: string): boolean {
    return origStartMs === previewStartMs && origResourceId === previewResourceId;
}

/** Resize one edge by `deltaMs`, snapped, keeping at least one snap step of duration. */
export function resizePreviewMs(
    edge: 'start' | 'end', origStartMs: number, origEndMs: number, deltaMs: number, snapMinutes: number
): MsRange {
    const minDur = Math.max(1, snapMinutes) * MS_PER_MIN;
    if (edge === 'start') {
        const startMs = Math.min(snapMs(origStartMs + deltaMs, snapMinutes), origEndMs - minDur);
        return { startMs, endMs: origEndMs };
    }
    const endMs = Math.max(snapMs(origEndMs + deltaMs, snapMinutes), origStartMs + minDur);
    return { startMs: origStartMs, endMs };
}

/** Create: the snapped range between the anchor and the pointer, at least one step long. */
export function createPreviewMs(anchorMs: number, currentMs: number, snapMinutes: number): MsRange {
    const a = snapMs(Math.min(anchorMs, currentMs), snapMinutes);
    const b = snapMs(Math.max(anchorMs, currentMs), snapMinutes);
    return { startMs: a, endMs: Math.max(b, a + Math.max(1, snapMinutes) * MS_PER_MIN) };
}

/** Vertical extent of a resource row track (screen px), for reassign hit-testing. */
export interface RowBound {
    resourceId: string;
    top: number;
    bottom: number;
}

/** The resource row under `y`, or null if the pointer is outside every track. */
export function rowAtY(rows: RowBound[], y: number): RowBound | null {
    for (const r of rows) {
        if (y >= r.top && y < r.bottom) {
            return r;
        }
    }
    return null;
}

export type TlCommitKind =
    | 'editEvent'     // open the built-in editor on the clicked bar
    | 'eventClick'    // fire onEventClick (no built-in editor)
    | 'move'          // commit a move (possibly to another row)
    | 'resize'        // commit an edge resize
    | 'selectEditor'  // open the editor on a dragged-out range
    | 'select'        // fire onSelect for a dragged-out range
    | 'createEditor'  // open the editor on a plain click on empty track
    | 'none';

export interface TlGestureFlags {
    editable: boolean;
    selectable: boolean;
    useEditor: boolean;        // built-in editor for create/select
    useEditorForEdit: boolean; // built-in editor for editing an existing bar
}

/** Decide what a released gesture should do (the onDocUp branch table). */
export function tlCommitDecision(mode: TlGestureMode, moved: boolean, hasPreview: boolean, f: TlGestureFlags): TlCommitKind {
    if (mode === 'move') {
        if (!f.editable || !moved || !hasPreview) {
            return f.useEditorForEdit ? 'editEvent' : 'eventClick';
        }
        return 'move';
    }
    if (mode === 'resize-start' || mode === 'resize-end') {
        return moved && hasPreview ? 'resize' : 'none';
    }
    // create
    if (moved && hasPreview && f.selectable) {
        return f.useEditor ? 'selectEditor' : 'select';
    }
    if (f.useEditor && f.selectable) {
        return 'createEditor';
    }
    return 'none';
}
