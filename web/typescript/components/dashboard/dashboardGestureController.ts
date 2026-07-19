// The dashboard's arrange gesture controller: contributes the grid geometry
// (pixel deltas → cells, move / corner-resize) on top of the shared drag
// lifecycle in shared/dragGestureController (pointer capture, document
// listeners, click-vs-drag threshold, cancel, commit dispatch). Geometry is
// pure in dashboardGestureLogic; state changes and event firing flow back
// through the host.
import * as React from 'react';
import { DragGestureController, DragGestureState } from '../../shared/dragGestureController';
import { TileGeom } from './dashboardLogic';
import {
    DashCommitKind, DashGestureMode, cellsDelta, geomEquals, movePreview, resizePreview
} from './dashboardGestureLogic';

export interface DashGesture extends DragGestureState {
    mode: DashGestureMode;
    tileId: string;
    orig: TileGeom;
    unitX: number;   // pixel width of one column step (measured at gesture start)
    unitY: number;   // pixel height of one row step
    columns: number;
    minW: number;
    minH: number;
}

export interface DashPreview {
    tileId: string;
    geom: TileGeom;
}

export interface DashGestureHost {
    setPreview(p: DashPreview | null): void;
    commit(kind: DashCommitKind, g: DashGesture, preview: DashPreview | null): void;
}

interface StartArgs {
    tileId: string;
    orig: TileGeom;
    unitX: number;
    unitY: number;
    columns: number;
    minW: number;
    minH: number;
}

export class DashboardGestureController extends DragGestureController<DashGesture, DashPreview, DashCommitKind> {

    constructor(private host: DashGestureHost) {
        super(host);
    }

    startMove = (a: StartArgs, e: React.PointerEvent): void => {
        this.start('move', a, e);
    };

    startResize = (a: StartArgs, e: React.PointerEvent): void => {
        this.start('resize', a, e);
    };

    private start(mode: DashGestureMode, a: StartArgs, e: React.PointerEvent): void {
        if (!this.begin(e)) {
            return;
        }
        e.stopPropagation();
        e.preventDefault();
        this.startGesture({
            mode, tileId: a.tileId, orig: a.orig, unitX: a.unitX, unitY: a.unitY,
            columns: a.columns, minW: a.minW, minH: a.minH,
            startClientX: e.clientX, startClientY: e.clientY, moved: false
        });
        this.setPreview({ tileId: a.tileId, geom: a.orig });
    }

    protected handleMove(e: PointerEvent, g: DashGesture): void {
        const dCols = cellsDelta(e.clientX - g.startClientX, g.unitX);
        const dRows = cellsDelta(e.clientY - g.startClientY, g.unitY);
        const geom = g.mode === 'move'
            ? movePreview(g.orig, dCols, dRows, g.columns, g.minW, g.minH)
            : resizePreview(g.orig, dCols, dRows, g.columns, g.minW, g.minH);
        this.setPreview({ tileId: g.tileId, geom });
    }

    protected decide(g: DashGesture, preview: DashPreview | null): DashCommitKind | 'none' {
        if (!g.moved || !preview || geomEquals(preview.geom, g.orig)) {
            return 'none';   // a click or a snapped-back noop commits nothing
        }
        return g.mode;
    }
}
