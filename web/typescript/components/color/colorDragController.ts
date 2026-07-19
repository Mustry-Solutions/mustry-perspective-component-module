// The picker's drag controller. Colour dragging is CONTINUOUS (every move is a
// live value, no click-vs-drag threshold and no preview/commit) — so, like
// Pan & Zoom, it is deliberately NOT built on shared/dragGestureController.
// It is a thin DOM shim: pointer-capture + document listeners that report the
// live client position and the target's rect back to the host, which maps them
// to a colour via the pure colorGeometry helpers. Untested by design (keep thin).
import * as React from 'react';

export type ColorDragKind = 'sv' | 'hue' | 'alpha';

export interface ColorDragHost {
    /** Fired on pointer-down and each move: the live pointer + the surface's rect. */
    onDrag(kind: ColorDragKind, clientX: number, clientY: number, rect: DOMRect): void;
    /** Fired once when the drag ends (pointer-up / cancel). */
    onDragEnd(kind: ColorDragKind): void;
}

export class ColorDragController {

    private kind: ColorDragKind | null = null;
    private el: HTMLElement | null = null;
    private pointerId = -1;

    constructor(private host: ColorDragHost) {}

    /** Begin a drag on `el` (an SV area / hue bar / alpha bar). */
    begin = (kind: ColorDragKind, el: HTMLElement, e: React.PointerEvent): void => {
        if (e.button !== 0 && e.pointerType === 'mouse') {
            return; // left-button (or touch/pen) only
        }
        this.kind = kind;
        this.el = el;
        this.pointerId = e.pointerId;
        try {
            el.setPointerCapture(e.pointerId);
        } catch {
            /* capture is best-effort */
        }
        e.preventDefault();
        e.stopPropagation();
        this.emit(e.clientX, e.clientY);
        window.addEventListener('pointermove', this.onMove, { passive: false });
        window.addEventListener('pointerup', this.onUp);
        window.addEventListener('pointercancel', this.onUp);
    };

    private onMove = (e: PointerEvent): void => {
        if (this.kind) {
            e.preventDefault();
            this.emit(e.clientX, e.clientY);
        }
    };

    private onUp = (): void => {
        const kind = this.kind;
        this.cleanup();
        if (kind) {
            this.host.onDragEnd(kind);
        }
    };

    private emit(clientX: number, clientY: number): void {
        if (this.kind && this.el) {
            this.host.onDrag(this.kind, clientX, clientY, this.el.getBoundingClientRect());
        }
    }

    private cleanup(): void {
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('pointerup', this.onUp);
        window.removeEventListener('pointercancel', this.onUp);
        if (this.el && this.pointerId >= 0) {
            try {
                this.el.releasePointerCapture(this.pointerId);
            } catch {
                /* already released */
            }
        }
        this.kind = null;
        this.el = null;
        this.pointerId = -1;
    }

    /** Tear down any in-flight drag (call from componentWillUnmount). */
    dispose(): void {
        this.cleanup();
    }
}
