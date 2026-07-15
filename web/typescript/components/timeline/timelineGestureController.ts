// The timeline's drag gesture controller: contributes the timeline's geometry
// (row-track rects, pointer -> epoch mapping) on top of the shared drag
// lifecycle in shared/dragGestureController (pointer capture, document
// listeners, click-vs-drag threshold, cancel, commit dispatch). Geometry and
// the commit decision are pure functions in timelineGestureLogic.ts; state
// changes and event firing flow back through the host (the same architecture
// as the calendar's calendarGestureController).
import * as React from 'react';
import { DragGestureController } from '../../shared/dragGestureController';
import { TimeScale, TimelineEvent, pxToMs } from './timelineLogic';
import {
    RowBound, TlCommitKind, TlGestureFlags, TlGestureMode,
    createPreviewMs, movePreviewMs, resizePreviewMs, rowAtY, snapMs, tlCommitDecision
} from './timelineGestureLogic';

export interface TlGesture {
    mode: TlGestureMode;
    ev?: TimelineEvent;        // move / resize target
    startClientX: number;
    startClientY: number;
    origStartMs: number;
    origEndMs: number;
    origResourceId: string;
    moved: boolean;
}

/** The ghost / selection shown while a gesture is active. */
export interface TlPreview {
    mode: TlGestureMode;
    eventId?: string;
    title?: string;
    color?: string;
    resourceId: string;
    startMs: number;
    endMs: number;
}

export interface TlGestureEnv {
    editable: boolean;
    selectable: boolean;
    snapMinutes: number;
    scale: TimeScale;   // current window + density (px<->ms)
}

export interface TlGestureHost {
    env(): TlGestureEnv;
    flags(): TlGestureFlags;
    gridEl(): HTMLElement | null;                       // the .tml-grid (row rects live inside)
    resolveColor(ev: TimelineEvent): string | undefined;
    hideHover(): void;
    setPreview(p: TlPreview | null): void;
    commit(kind: TlCommitKind, g: TlGesture, preview: TlPreview | null): void;
}

export class TimelineGestureController extends DragGestureController<TlGesture, TlPreview, TlCommitKind> {
    private rowRects: Array<RowBound & { left: number }> = [];

    constructor(private host: TlGestureHost) {
        super(host);
    }

    /** Pointer-down on a bar. Always starts a gesture so a plain click resolves to a
     *  click; only the drag/preview behaviour is gated on `editable`. */
    startMove = (ev: TimelineEvent, startMs: number, endMs: number, e: React.PointerEvent): void => {
        if (!this.begin(e)) {
            return;
        }
        e.stopPropagation();
        this.host.hideHover();
        this.captureRows();
        this.startGesture({
            mode: 'move', ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMs: startMs, origEndMs: endMs, origResourceId: ev.resourceId, moved: false
        });
        if (this.host.env().editable) {
            e.preventDefault();
            this.setPreview({
                mode: 'move', eventId: ev.id, title: ev.title, color: this.host.resolveColor(ev),
                resourceId: ev.resourceId, startMs, endMs
            });
        }
    };

    startResize = (edge: 'start' | 'end', ev: TimelineEvent, startMs: number, endMs: number, e: React.PointerEvent): void => {
        if (!this.host.env().editable || !this.begin(e)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.host.hideHover();
        this.captureRows();
        const mode = edge === 'start' ? 'resize-start' : 'resize-end';
        this.startGesture({
            mode,
            ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMs: startMs, origEndMs: endMs, origResourceId: ev.resourceId, moved: false
        });
        this.setPreview({
            mode, eventId: ev.id, title: ev.title, color: this.host.resolveColor(ev),
            resourceId: ev.resourceId, startMs, endMs
        });
    };

    /** Pointer-down on empty track: anchor a create gesture at the pointer's instant. */
    startCreate = (resourceId: string, e: React.PointerEvent): void => {
        if (!this.begin(e)) {
            return;
        }
        this.host.hideHover();
        this.captureRows();
        const row = this.rowRects.find((r) => r.resourceId === resourceId);
        if (!row) {
            return;
        }
        const { scale, snapMinutes } = this.host.env();
        const anchorMs = snapMs(pxToMs(scale, e.clientX - row.left), snapMinutes);
        this.startGesture({
            mode: 'create', startClientX: e.clientX, startClientY: e.clientY,
            origStartMs: anchorMs, origEndMs: anchorMs, origResourceId: resourceId, moved: false
        });
    };

    // --- lifecycle hooks (geometry) ------------------------------------------

    protected handleMove(e: PointerEvent, g: TlGesture): void {
        const { editable, selectable, snapMinutes, scale } = this.host.env();
        const deltaMs = ((e.clientX - g.startClientX) / scale.pxPerHour) * 3600000;
        if (g.mode === 'move') {
            if (!editable) {
                return;
            }
            const { startMs, endMs } = movePreviewMs(g.origStartMs, g.origEndMs, deltaMs, snapMinutes);
            // Vertical drag reassigns: the row under the pointer (fallback: origin row).
            const row = rowAtY(this.rowRects, e.clientY);
            this.setPreview({
                mode: 'move', eventId: g.ev!.id, title: g.ev!.title, color: this.host.resolveColor(g.ev!),
                resourceId: row ? row.resourceId : g.origResourceId, startMs, endMs
            });
        } else if (g.mode === 'resize-start' || g.mode === 'resize-end') {
            const { startMs, endMs } = resizePreviewMs(
                g.mode === 'resize-start' ? 'start' : 'end', g.origStartMs, g.origEndMs, deltaMs, snapMinutes);
            this.setPreview({
                mode: g.mode, eventId: g.ev!.id, title: g.ev!.title, color: this.host.resolveColor(g.ev!),
                resourceId: g.origResourceId, startMs, endMs
            });
        } else if (selectable && e.pointerType !== 'touch') {
            // Drag-to-create is disabled on touch (a horizontal drag pans; a tap creates).
            const row = this.rowRects.find((r) => r.resourceId === g.origResourceId);
            if (!row) {
                return;
            }
            const cur = pxToMs(scale, e.clientX - row.left);
            const { startMs, endMs } = createPreviewMs(g.origStartMs, cur, snapMinutes);
            this.setPreview({ mode: 'create', resourceId: g.origResourceId, startMs, endMs });
        }
    }

    protected decide(g: TlGesture, preview: TlPreview | null): TlCommitKind | 'none' {
        return tlCommitDecision(g.mode, g.moved, !!preview, this.host.flags());
    }

    // --- internals ----------------------------------------------------------

    private captureRows(): void {
        this.rowRects = [];
        const root = this.host.gridEl();
        if (!root) {
            return;
        }
        root.querySelectorAll('.tml-track[data-resource]').forEach((el) => {
            const r = el.getBoundingClientRect();
            this.rowRects.push({
                resourceId: (el as HTMLElement).dataset.resource || '',
                top: r.top, bottom: r.bottom, left: r.left
            });
        });
    }
}
