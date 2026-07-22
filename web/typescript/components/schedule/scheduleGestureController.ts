// DOM-facing gesture controller for the Schedule Manager's week grid:
// drag on empty column space paints a new availability range; drag on a
// block's top/bottom edge resizes it. All geometry is pure (scheduleEditLogic);
// this class only maps pointer events to it — kept thin and untested by
// design, like the calendar/timeline controllers.
import * as React from 'react';
import { DragGestureController, DragGestureState } from '../../shared/dragGestureController';
import { minuteAtFraction, paintPreview, resizePreview } from './scheduleEditLogic';
import { DayKey, TimeRange } from './scheduleLogic';

export type ScheduleGestureKind = 'paint' | 'resize';

export interface ScheduleGesture extends DragGestureState {
    day: DayKey;
    /** The day column element the gesture started in (geometry reference). */
    colEl: HTMLElement;
    mode: ScheduleGestureKind;
    /** paint: the snapped minute where the pointer went down. */
    anchorMinute: number;
    /** resize: which range and which edge is being dragged. */
    rangeIndex: number;
    edge: 'start' | 'end';
    original: TimeRange;
}

export interface ScheduleGesturePreview {
    day: DayKey;
    mode: ScheduleGestureKind;
    range: TimeRange;
    /** resize: index of the range being replaced by the preview. */
    rangeIndex: number;
}

/** The geometry the host re-supplies per render (props can change mid-gesture). */
export interface ScheduleGridGeometry {
    startHour: number;
    endHour: number;
    snapMinutes: number;
}

export class ScheduleGestureController extends DragGestureController<
    ScheduleGesture, ScheduleGesturePreview, ScheduleGestureKind
> {

    constructor(
        core: { setPreview(p: ScheduleGesturePreview | null): void; commit(kind: ScheduleGestureKind, g: ScheduleGesture, preview: ScheduleGesturePreview | null): void; },
        private geometry: () => ScheduleGridGeometry
    ) {
        super(core);
    }

    /** Pointer down on empty column space: arm a paint gesture. */
    onColumnDown = (day: DayKey, e: React.PointerEvent): void => {
        if (!this.begin(e)) {
            return;
        }
        const colEl = (e.target as Element).closest('.mustry-sched-col') as HTMLElement | null;
        if (!colEl) {
            return;
        }
        this.startGesture({
            startClientX: e.clientX, startClientY: e.clientY, moved: false,
            day, colEl, mode: 'paint',
            anchorMinute: this.minuteAt(e.clientY, colEl),
            rangeIndex: -1, edge: 'end', original: { start: 0, end: 0 }
        });
    };

    /** Pointer down on a block's resize handle. */
    onHandleDown = (day: DayKey, rangeIndex: number, edge: 'start' | 'end', range: TimeRange, e: React.PointerEvent): void => {
        if (!this.begin(e)) {
            return;
        }
        const colEl = (e.target as Element).closest('.mustry-sched-col') as HTMLElement | null;
        if (!colEl) {
            return;
        }
        e.stopPropagation(); // don't also arm a paint on the column underneath
        this.startGesture({
            startClientX: e.clientX, startClientY: e.clientY, moved: false,
            day, colEl, mode: 'resize',
            anchorMinute: 0, rangeIndex, edge, original: range
        });
    };

    protected handleMove(e: PointerEvent, g: ScheduleGesture): void {
        if (!g.moved) {
            return;
        }
        const minute = this.minuteAt(e.clientY, g.colEl);
        const geo = this.geometry();
        if (g.mode === 'paint') {
            this.setPreview({
                day: g.day, mode: 'paint', rangeIndex: -1,
                range: paintPreview(g.anchorMinute, minute, geo.snapMinutes)
            });
        } else {
            this.setPreview({
                day: g.day, mode: 'resize', rangeIndex: g.rangeIndex,
                range: resizePreview(g.original, g.edge, minute, geo.snapMinutes)
            });
        }
    }

    protected decide(g: ScheduleGesture, preview: ScheduleGesturePreview | null): ScheduleGestureKind | 'none' {
        // An un-moved press is a click (block clicks delete via onClick); only
        // a real drag with a live preview commits.
        return g.moved && preview ? g.mode : 'none';
    }

    private minuteAt(clientY: number, colEl: HTMLElement): number {
        const rect = colEl.getBoundingClientRect();
        const geo = this.geometry();
        const fraction = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
        return minuteAtFraction(fraction, geo.startHour, geo.endHour, geo.snapMinutes);
    }
}
