// DOM-facing reorder gesture for the roster's user rows: drag a row's handle
// vertically to move it in the escalation order. Geometry is pure
// (shared/adminCommon.reorderTarget); this class only maps pointer events —
// kept thin and untested by design, like the other family controllers.
import * as React from 'react';
import { DragGestureController, DragGestureState } from '../../shared/dragGestureController';
import { reorderTarget } from '../../shared/adminCommon';

export interface ReorderGesture extends DragGestureState {
    fromIndex: number;
    rowHeight: number;
    count: number;
}

export interface ReorderPreview {
    fromIndex: number;
    toIndex: number;
}

export class RosterReorderController extends DragGestureController<ReorderGesture, ReorderPreview, 'reorder'> {

    /** Pointer down on a row's drag handle. */
    onHandleDown = (index: number, count: number, e: React.PointerEvent): void => {
        if (!this.begin(e)) {
            return;
        }
        const row = (e.target as Element).closest('.mustry-roster-row') as HTMLElement | null;
        if (!row) {
            return;
        }
        this.startGesture({
            startClientX: e.clientX, startClientY: e.clientY, moved: false,
            fromIndex: index, rowHeight: row.getBoundingClientRect().height || 1, count
        });
    };

    protected handleMove(e: PointerEvent, g: ReorderGesture): void {
        if (!g.moved) {
            return;
        }
        const to = reorderTarget(g.fromIndex, e.clientY - g.startClientY, g.rowHeight, g.count);
        this.setPreview({ fromIndex: g.fromIndex, toIndex: to });
    }

    protected decide(g: ReorderGesture, preview: ReorderPreview | null): 'reorder' | 'none' {
        return g.moved && preview && preview.toIndex !== preview.fromIndex ? 'reorder' : 'none';
    }
}
