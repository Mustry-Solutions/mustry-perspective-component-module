// The timeline's drag gesture controller: owns the in-flight gesture, measures the
// DOM (row-track rects, pointer -> epoch mapping) and manages the document pointer
// listeners. Geometry and the commit decision are pure functions in
// timelineGestureLogic.ts; state changes and event firing flow back through the
// host (the same architecture as the calendar's gestureController).
import * as React from 'react';
import { TimeScale, TimelineEvent, pxToMs } from './timelineLogic';
import {
    MsRange, RowBound, TlCommitKind, TlGestureFlags, TlGestureMode,
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

export class TimelineGestureController {
    private gesture: TlGesture | null = null;
    private rowRects: Array<RowBound & { left: number }> = [];
    private preview: TlPreview | null = null;   // last preview we set (state mirror)

    constructor(private host: TlGestureHost) {}

    /** Whether a drag is in progress (gates the live-refresh tick). */
    get active(): boolean {
        return this.gesture !== null;
    }

    dispose(): void {
        this.removeDocListeners();
    }

    /** Pointer-down on a bar. Always starts a gesture so a plain click resolves to a
     *  click; only the drag/preview behaviour is gated on `editable`. */
    startMove = (ev: TimelineEvent, startMs: number, endMs: number, e: React.PointerEvent): void => {
        e.stopPropagation();
        this.host.hideHover();
        this.captureRows();
        this.gesture = {
            mode: 'move', ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMs: startMs, origEndMs: endMs, origResourceId: ev.resourceId, moved: false
        };
        this.addDocListeners();
        if (this.host.env().editable) {
            e.preventDefault();
            this.setPreview({
                mode: 'move', eventId: ev.id, title: ev.title, color: this.host.resolveColor(ev),
                resourceId: ev.resourceId, startMs, endMs
            });
        }
    };

    startResize = (edge: 'start' | 'end', ev: TimelineEvent, startMs: number, endMs: number, e: React.PointerEvent): void => {
        if (!this.host.env().editable) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.host.hideHover();
        this.captureRows();
        this.gesture = {
            mode: edge === 'start' ? 'resize-start' : 'resize-end',
            ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMs: startMs, origEndMs: endMs, origResourceId: ev.resourceId, moved: false
        };
        this.addDocListeners();
        this.setPreview({
            mode: this.gesture.mode, eventId: ev.id, title: ev.title, color: this.host.resolveColor(ev),
            resourceId: ev.resourceId, startMs, endMs
        });
    };

    /** Pointer-down on empty track: anchor a create gesture at the pointer's instant. */
    startCreate = (resourceId: string, e: React.PointerEvent): void => {
        this.host.hideHover();
        this.captureRows();
        const row = this.rowRects.find((r) => r.resourceId === resourceId);
        if (!row) {
            return;
        }
        const { scale, snapMinutes } = this.host.env();
        const anchorMs = snapMs(pxToMs(scale, e.clientX - row.left), snapMinutes);
        this.gesture = {
            mode: 'create', startClientX: e.clientX, startClientY: e.clientY,
            origStartMs: anchorMs, origEndMs: anchorMs, origResourceId: resourceId, moved: false
        };
        this.addDocListeners();
    };

    // --- internals ----------------------------------------------------------

    private setPreview(p: TlPreview | null): void {
        this.preview = p;
        this.host.setPreview(p);
    }

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

    private addDocListeners(): void {
        // Pointer events unify mouse / touch / pen; pointercancel (touch scroll takeover)
        // aborts the gesture without committing.
        document.addEventListener('pointermove', this.onDocMove, true);
        document.addEventListener('pointerup', this.onDocUp, true);
        document.addEventListener('pointercancel', this.onDocCancel, true);
    }

    private removeDocListeners(): void {
        document.removeEventListener('pointermove', this.onDocMove, true);
        document.removeEventListener('pointerup', this.onDocUp, true);
        document.removeEventListener('pointercancel', this.onDocCancel, true);
    }

    private onDocCancel = (): void => {
        this.removeDocListeners();
        this.gesture = null;
        this.setPreview(null);
    };

    private onDocMove = (e: PointerEvent): void => {
        const g = this.gesture;
        if (!g) {
            return;
        }
        // A larger threshold on touch avoids a jittery finger turning a tap into a drag.
        const threshold = e.pointerType === 'touch' ? 10 : 4;
        if (!g.moved && Math.abs(e.clientX - g.startClientX) + Math.abs(e.clientY - g.startClientY) > threshold) {
            g.moved = true;
        }
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
    };

    private onDocUp = (): void => {
        const g = this.gesture;
        const preview = this.preview;
        this.removeDocListeners();
        this.gesture = null;
        this.setPreview(null);
        if (!g) {
            return;
        }
        const kind = tlCommitDecision(g.mode, g.moved, !!preview, this.host.flags());
        if (kind !== 'none') {
            this.host.commit(kind, g, preview);
        }
    };
}
