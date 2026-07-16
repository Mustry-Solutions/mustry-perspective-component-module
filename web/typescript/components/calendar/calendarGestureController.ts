// The week/day drag gesture controller: contributes the calendar's geometry
// (day-column rects, pointer -> minute mapping, month-cell hit-testing) on top
// of the shared drag lifecycle in shared/dragGestureController (pointer capture,
// document listeners, click-vs-drag threshold, cancel, commit dispatch). The
// geometry and the commit decision are pure functions in calendarGestureLogic.ts;
// state changes and event firing flow back through GestureHost, so this file
// stays perspective-client-free.
import * as React from 'react';
import { DragGestureController } from '../../shared/dragGestureController';
import { CalEvent, minuteFromOffset, snapMinutes, timeMinutes } from './calendarLogic';
import { DEFAULT_DUR_MIN, Gesture, Preview, hourHeightPx } from './calendarTypes';
import { cellAt, CellBound, colAtX, commitDecision, CommitKind, GestureFlags, movePreview, resizePreview, ResizeEdge, createPreview } from './calendarGestureLogic';

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

export class CalendarGestureController extends DragGestureController<Gesture, Preview, CommitKind> {
    private colRects: Array<{ day: string; rect: DOMRect }> = [];
    private cellRects: CellBound[] = [];      // month-view day cells (2D hit-testing)

    constructor(private host: GestureHost) {
        super(host);
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
        this.startGesture({
            mode: 'move', ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: s, origEndMin: end, durationMin: end - s, origDayIso: day, moved: false
        });
        if (this.host.env().editable) {
            e.preventDefault();
            this.setPreview({ mode: 'move', eventId: ev.id, title: ev.title, color: this.host.resolveColor(ev), dayIso: day, startMin: s, endMin: end });
        }
    };

    startResize = (ev: CalEvent, edge: ResizeEdge, e: React.PointerEvent): void => {
        if (!this.host.env().editable || !this.begin(e)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const { day, s, e: end } = this.resizeMinutes(ev, edge);
        this.captureCols();
        this.startGesture({
            mode: 'resize', edge, ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: s, origEndMin: end, durationMin: end - s, origDayIso: day, moved: false
        });
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
        this.startGesture({
            mode: 'move', surface: 'month', ev, startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: 0, origEndMin: 0, durationMin: 0, origDayIso: anchor, moved: false
        });
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
        this.startGesture({
            mode: 'create', startClientX: e.clientX, startClientY: e.clientY,
            origStartMin: m, origEndMin: m, durationMin: 0, origDayIso: dayIso, moved: false
        });
    };

    // --- lifecycle hooks (geometry) ------------------------------------------

    protected handleMove(e: PointerEvent, g: Gesture): void {
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
            const { startMin, endMin } = resizePreview(g.edge || 'end', g.origStartMin, g.origEndMin, deltaMin, winStart, winEnd, slotMinutes);
            this.setPreview({ mode: 'resize', eventId: g.ev!.id, title: g.ev!.title, color: this.host.resolveColor(g.ev!), dayIso: g.origDayIso, startMin, endMin });
        } else if (selectable && e.pointerType !== 'touch') {
            // Drag-to-create is disabled on touch: a vertical drag on empty time scrolls the
            // grid (a tap creates instead). On mouse/pen it draws the selection as before.
            const col = this.colRects.filter((c) => c.day === g.origDayIso)[0];
            const cur = this.minuteAtY(col.rect, e.clientY);
            const { startMin, endMin } = createPreview(g.origStartMin, cur, slotMinutes);
            this.setPreview({ mode: 'create', dayIso: g.origDayIso, startMin, endMin });
        }
    }

    protected decide(g: Gesture, preview: Preview | null): CommitKind | 'none' {
        return commitDecision(g.mode, g.moved, !!preview, this.host.flags());
    }

    // --- internals ----------------------------------------------------------

    /** Pixels-per-hour for the current grid resolution (must match TimeGrid's). */
    private hourPx(): number {
        return hourHeightPx(this.host.env().slotMinutes);
    }

    /** Resize anchoring: the day the grabbed edge lives on and the event's segment
     *  minutes there. A multi-day event's far edge is represented by the window
     *  boundary (its segment is clamped there), so the grabbed edge is still bounded
     *  by "at least one slot remains" within the visible day. */
    private resizeMinutes(ev: CalEvent, edge: ResizeEdge): { day: string; s: number; e: number } {
        const { dayStartHour, dayEndHour } = this.host.env();
        const startDay = ev.start.slice(0, 10);
        const endDay = ev.end && ev.end.length >= 10 ? ev.end.slice(0, 10) : startDay;
        if (startDay === endDay) {
            const { s, e } = this.eventMinutes(ev);
            return { day: startDay, s, e };
        }
        if (edge === 'start') {
            const sm = timeMinutes(ev.start);
            return { day: startDay, s: sm === null ? 0 : sm, e: dayEndHour * 60 };
        }
        const em = ev.end ? timeMinutes(ev.end) : null;
        return { day: endDay, s: dayStartHour * 60, e: em === null ? dayEndHour * 60 : em };
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
        root.querySelectorAll('.mustry-cal-tg-col').forEach((el) => {
            this.colRects.push({ day: (el as HTMLElement).dataset.day || '', rect: el.getBoundingClientRect() });
        });
    }

    private captureMonthCells(): void {
        this.cellRects = [];
        const root = this.host.monthEl();
        if (!root) {
            return;
        }
        root.querySelectorAll('.mustry-cal-day').forEach((el) => {
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
}
