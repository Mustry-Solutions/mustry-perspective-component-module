// The shared drag-gesture lifecycle used by the calendar and the timeline: one
// place that owns pointer-capture on begin, the capture-phase document
// listeners, the click-vs-drag movement threshold, cancel semantics (a touch
// scroll takeover aborts without committing) and the release → commit dispatch.
// Subclasses contribute only geometry: how a pointer position becomes a preview
// (handleMove) and what a release means (decide). Pure math stays in the
// components' *GestureLogic modules; this file is DOM-facing, hence untested —
// which is exactly why it must exist only once.
import * as React from 'react';

/** Manhattan-distance movement test: cheap and direction-agnostic. */
export function hasMoved(dx: number, dy: number, threshold = 4): boolean {
    return Math.abs(dx) + Math.abs(dy) > threshold;
}

/** A slightly larger threshold on touch avoids a jittery finger turning a tap into a drag. */
export function moveThreshold(pointerType: string): number {
    return pointerType === 'touch' ? 10 : 4;
}

/** What the base needs from every in-flight gesture record. */
export interface DragGestureState {
    startClientX: number;
    startClientY: number;
    moved: boolean;
}

/** The slice of the component host the base drives (satisfied structurally by
 *  the components' richer host interfaces). */
export interface DragGestureCore<TGesture, TPreview, TKind extends string> {
    setPreview(p: TPreview | null): void;
    commit(kind: TKind, g: TGesture, preview: TPreview | null): void;
}

export abstract class DragGestureController<
    TGesture extends DragGestureState,
    TPreview,
    TKind extends string
> {
    protected gesture: TGesture | null = null;
    protected preview: TPreview | null = null;   // last preview we set (state mirror)

    constructor(private core: DragGestureCore<TGesture, TPreview, TKind>) {}

    /** Whether a drag is in progress (gates the live-refresh tick). */
    get active(): boolean {
        return this.gesture !== null;
    }

    dispose(): void {
        this.removeDocListeners();
    }

    /** Map the pointer position to a preview. Called after the movement
     *  threshold bookkeeping; `g.moved` is already up to date. */
    protected abstract handleMove(e: PointerEvent, g: TGesture): void;

    /** Decide what a release commits ('none' for nothing). */
    protected abstract decide(g: TGesture, preview: TPreview | null): TKind | 'none';

    /** Only the primary button starts gestures — a right-click opens the context
     *  menu, which eats the pointerup and would strand the document listeners.
     *  Capturing the pointer keeps move/up events flowing during fast drags. */
    protected begin(e: React.PointerEvent): boolean {
        if (e.button !== 0) {
            return false;
        }
        try {
            (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch (err) {
            // inactive pointer — capture is best-effort
        }
        return true;
    }

    /** Adopt the gesture record and start listening for its progress. */
    protected startGesture(g: TGesture): void {
        this.gesture = g;
        this.addDocListeners();
    }

    protected setPreview(p: TPreview | null): void {
        this.preview = p;
        this.core.setPreview(p);
    }

    private addDocListeners(): void {
        // Pointer events unify mouse / touch / pen. pointercancel fires when the browser
        // takes over for a touch scroll — we abort the gesture then.
        document.addEventListener('pointermove', this.onDocMove, true);
        document.addEventListener('pointerup', this.onDocUp, true);
        document.addEventListener('pointercancel', this.onDocCancel, true);
    }

    private removeDocListeners(): void {
        document.removeEventListener('pointermove', this.onDocMove, true);
        document.removeEventListener('pointerup', this.onDocUp, true);
        document.removeEventListener('pointercancel', this.onDocCancel, true);
    }

    /** A touch scroll (or system interruption) cancels the gesture without committing. */
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
        if (!g.moved && hasMoved(e.clientX - g.startClientX, e.clientY - g.startClientY, moveThreshold(e.pointerType))) {
            g.moved = true;
        }
        this.handleMove(e, g);
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
        const kind = this.decide(g, preview);
        if (kind !== 'none') {
            this.core.commit(kind, g, preview);
        }
    };
}
