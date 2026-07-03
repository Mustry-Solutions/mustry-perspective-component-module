// The week/day drag gesture controller: owns the in-flight gesture, measures the
// DOM (day-column rects, pointer -> minute mapping), and manages the document
// pointer listeners. The geometry and the commit decision are pure functions in
// gestureLogic.ts; state changes and event firing flow back through GestureHost,
// so this file stays perspective-client-free (but is DOM-facing, hence untested).
import * as React from 'react';
import { CalEvent, minuteFromOffset, snapMinutes, timeMinutes } from '../calendarLogic';
import { DEFAULT_DUR_MIN, Gesture, Preview, hourHeightPx } from './types';
import { cellAt, CellBound, colAtX, commitDecision, CommitKind, GestureFlags, hasMoved, movePreview, resizePreview, createPreview } from './gestureLogic';

/** The prop values a gesture reads — fetched per event so mid-gesture prop edits are honoured. */
export interface GestureEnv {
    editable: boolean;
    selectable: boolean;
    dayStartHour: number;
    dayEndHour: number;
    slotMinutes: number;
}

export interface GestureHost {
    env(): GestureEnv;
    flags(): GestureFlags;                              // commitDecision inputs
    scrollEl(): HTMLElement | null;                     // the time-grid scroll container
    monthEl(): HTMLElement | null;                      // the month-view weeks container
    resolveColor(ev: CalEvent): string | undefined;     // preview ghost colour
    hideHover(): void;
    setPreview(p: Preview | null): void;                // mirror into component state
    commit(kind: CommitKind, g: Gesture, preview: Preview | null): void;
}

export class GestureController {
    private gesture: Gesture | null = null;
    private colRects: Array<{ day: string; rect: DOMRect }> = [];
    private cellRects: CellBound[] = [];      // month-view day cells (2D hit-testing)
    private preview: Preview | null = null;   // last preview we set (state mirror)

    constructor(private host: GestureHost) {}

    /** Whether a drag is in progress (gates the live-refresh tick). */
    get active(): boolean {
        return this.gesture !== null;
    }

    dispose(): void {
        this.removeDocListeners();
    }

    /** Only the primary button starts gestures — a right-click opens the context
     *  menu, which eats the pointerup and would strand the document listeners.
     *  Capturing the pointer keeps move/up events flowing during fast drags. */
    private begin(e: React.PointerEvent): boolean {
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

    startMove = (ev: CalEvent, e: React.PointerEvent): void => {
        // Always start a gesture so a plain click resolves to onEventClick; only the
        // drag/preview behaviour is gated on `editable`.
        if (!this.begin(e)) {
            return;
        }
        e.stopPropagation();
        this.host.hideHover();
        const { s, e: end } = this.eventMinutes(ev);
        const day = ev.start.slice(0, 10);
        this.captureCols();
        this.gesture = {
            mode: 'move', ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: s, origEndMin: end, durationMin: end - s, origDayIso: day, moved: false
        };
        this.addDocListeners();
        if (this.host.env().editable) {
            e.preventDefault();
            this.setPreview({ mode: 'move', eventId: ev.id, title: ev.title, color: this.host.resolveColor(ev), dayIso: day, startMin: s, endMin: end });
        }
    };

    startResize = (ev: CalEvent, e: React.PointerEvent): void => {
        if (!this.host.env().editable || !this.begin(e)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const { s, e: end } = this.eventMinutes(ev);
        const day = ev.start.slice(0, 10);
        this.captureCols();
        this.gesture = {
            mode: 'resize', ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: s, origEndMin: end, durationMin: end - s, origDayIso: day, moved: false
        };
        this.addDocListeners();
        this.setPreview({ mode: 'resize', eventId: ev.id, title: ev.title, color: this.host.resolveColor(ev), dayIso: day, startMin: s, endMin: end });
    };

    /** Month view: drag an event bar onto another day cell (whole-day move, time kept).
     *  Like startMove, a gesture always starts so a plain click resolves to a click. */
    startMonthMove = (ev: CalEvent, e: React.PointerEvent): void => {
        if (!this.begin(e)) {
            return;
        }
        e.stopPropagation();
        this.host.hideHover();
        this.captureMonthCells();
        const under = cellAt(this.cellRects, e.clientX, e.clientY);
        const anchor = under ? under.day : (ev.start || '').slice(0, 10);
        this.gesture = {
            mode: 'move', surface: 'month', ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: 0, origEndMin: 0, durationMin: 0, origDayIso: anchor, moved: false
        };
        this.addDocListeners();
        if (this.host.env().editable) {
            e.preventDefault();
            this.setPreview({ mode: 'move', surface: 'month', eventId: ev.id, title: ev.title, dayIso: anchor, startMin: 0, endMin: 0 });
        }
    };

    startCreate = (dayIso: string, e: React.PointerEvent): void => {
        if (!this.begin(e)) {
            return;
        }
        this.host.hideHover();
        this.captureCols();
        const col = this.colRects.filter((c) => c.day === dayIso)[0];
        if (!col) {
            return;
        }
        const m = this.minuteAtY(col.rect, e.clientY);
        this.gesture = {
            mode: 'create', startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: m, origEndMin: m, durationMin: 0, origDayIso: dayIso, moved: false
        };
        this.addDocListeners();
    };

    // --- internals ----------------------------------------------------------

    private setPreview(p: Preview | null): void {
        this.preview = p;
        this.host.setPreview(p);
    }

    /** Pixels-per-hour for the current grid resolution (must match TimeGrid's). */
    private hourPx(): number {
        return hourHeightPx(this.host.env().slotMinutes);
    }

    /** A timed event's [start, end] minutes (end falls back to the default duration). */
    private eventMinutes(ev: CalEvent): { s: number; e: number } {
        const sm = timeMinutes(ev.start);
        const s = sm === null ? 0 : sm;
        let e: number | null = ev.end && ev.end.slice(0, 10) === ev.start.slice(0, 10) ? timeMinutes(ev.end) : null;
        if (e === null || e <= s) {
            e = s + DEFAULT_DUR_MIN;
        }
        return { s, e };
    }

    private captureCols(): void {
        this.colRects = [];
        const root = this.host.scrollEl();
        if (!root) {
            return;
        }
        root.querySelectorAll('.cal-tg-col').forEach((el) => {
            this.colRects.push({ day: (el as HTMLElement).dataset.day || '', rect: el.getBoundingClientRect() });
        });
    }

    private captureMonthCells(): void {
        this.cellRects = [];
        const root = this.host.monthEl();
        if (!root) {
            return;
        }
        root.querySelectorAll('.cal-day').forEach((el) => {
            const r = el.getBoundingClientRect();
            this.cellRects.push({ day: (el as HTMLElement).dataset.day || '', left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        });
    }

    private colAt(clientX: number): { day: string; rect: DOMRect } | null {
        const hit = colAtX(this.colRects.map((c) => ({ day: c.day, left: c.rect.left, right: c.rect.right })), clientX);
        return hit ? this.colRects.filter((c) => c.day === hit.day)[0] : null;
    }

    private minuteAtY(rect: DOMRect, clientY: number): number {
        const { dayStartHour, dayEndHour, slotMinutes } = this.host.env();
        return minuteFromOffset(clientY - rect.top, this.hourPx(), dayStartHour * 60, dayEndHour * 60, slotMinutes);
    }

    private addDocListeners(): void {
        // Pointer events unify mouse / touch / pen. pointercancel fires when the browser
        // takes over for a touch scroll (empty-column drag) — we abort the gesture then.
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
        // A slightly larger threshold on touch avoids a jittery finger turning a tap into a drag.
        const threshold = e.pointerType === 'touch' ? 10 : 4;
        if (!g.moved && hasMoved(e.clientX - g.startClientX, e.clientY - g.startClientY, threshold)) {
            g.moved = true;
        }
        const { editable, selectable, dayStartHour, dayEndHour, slotMinutes } = this.host.env();
        if (g.surface === 'month') {
            if (!editable) {
                return;
            }
            // Track the day cell under the pointer; outside every cell, keep the last target.
            const cell = cellAt(this.cellRects, e.clientX, e.clientY);
            const dayIso = cell ? cell.day : (this.preview ? this.preview.dayIso : g.origDayIso);
            this.setPreview({ mode: 'move', surface: 'month', eventId: g.ev!.id, title: g.ev!.title, dayIso, startMin: 0, endMin: 0 });
            return;
        }
        const winStart = dayStartHour * 60;
        const winEnd = dayEndHour * 60;
        const deltaMin = snapMinutes(((e.clientY - g.startClientY) / this.hourPx()) * 60, slotMinutes);
        if (g.mode === 'move') {
            if (!editable) {
                return;
            }
            const col = this.colAt(e.clientX) || this.colRects.filter((c) => c.day === g.origDayIso)[0];
            const { startMin, endMin } = movePreview(g.origStartMin, g.durationMin, deltaMin, winStart, winEnd);
            this.setPreview({ mode: 'move', eventId: g.ev!.id, title: g.ev!.title, color: this.host.resolveColor(g.ev!), dayIso: col.day, startMin, endMin });
        } else if (g.mode === 'resize') {
            const { startMin, endMin } = resizePreview(g.origStartMin, g.origEndMin, deltaMin, winEnd, slotMinutes);
            this.setPreview({ mode: 'resize', eventId: g.ev!.id, title: g.ev!.title, color: this.host.resolveColor(g.ev!), dayIso: g.origDayIso, startMin, endMin });
        } else if (selectable && e.pointerType !== 'touch') {
            // Drag-to-create is disabled on touch: a vertical drag on empty time scrolls the
            // grid (a tap creates instead). On mouse/pen it draws the selection as before.
            const col = this.colRects.filter((c) => c.day === g.origDayIso)[0];
            const cur = this.minuteAtY(col.rect, e.clientY);
            const { startMin, endMin } = createPreview(g.origStartMin, cur, slotMinutes);
            this.setPreview({ mode: 'create', dayIso: g.origDayIso, startMin, endMin });
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
        const kind = commitDecision(g.mode, g.moved, !!preview, this.host.flags());
        if (kind !== 'none') {
            this.host.commit(kind, g, preview);
        }
    };
}
