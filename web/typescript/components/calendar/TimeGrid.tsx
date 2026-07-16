// Week / Day time-grid view: day-head row, all-day strip (spanning bars), and the
// scrollable hour grid with overlap-packed timed events + the active drag/resize ghost.
import * as React from 'react';
import { intlFormat } from '../../shared/dateUtils';
import {
    CalEvent, DayCol, hhmm, isOccurrence, layoutDayEvents, backgroundBandsForDay, layoutWeekSegments
} from './calendarLogic';
import { ResizeEdge } from './calendarGestureLogic';
import { CalLabels, Category, CalView, Preview, DEFAULT_DUR_MIN, hourHeightPx } from './calendarTypes';
import { EventIcon, resolveColor, statusClass } from '../../shared/eventStyle';
import { ShiftDef, visibleShifts } from '../../shared/shifts';
import { EventBar } from './EventBar';

interface TimeGridProps {
    cols: DayCol[];
    events: CalEvent[];
    locale: string;
    view: CalView;
    editable: boolean;
    dayStartHour: number;
    dayEndHour: number;
    slotMinutes: number;  // grid resolution (divisor of 60); drives gridlines + row height
    shifts: ShiftDef[];   // labelled boundary lines at each shift's start time
    nowMinutes: number;   // minutes-from-midnight of "now" in the display zone
    preview: Preview | null;
    categories: Category[];
    labels: CalLabels;
    scrollRef: React.RefObject<HTMLDivElement>;
    enterClass: (id: string) => string;
    hoverProps: (ev: CalEvent) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };
    onEventClick: (ev: CalEvent, e: React.MouseEvent) => void;
    onStartCreate: (iso: string, e: React.PointerEvent) => void;
    onStartMove: (ev: CalEvent, e: React.PointerEvent) => void;
    onStartResize: (ev: CalEvent, edge: ResizeEdge, e: React.PointerEvent) => void;
    onScroll: () => void;
}

export function TimeGrid(props: TimeGridProps): React.ReactElement {
    const {
        cols, events, locale, view, editable, dayStartHour, dayEndHour, slotMinutes, shifts, nowMinutes, preview, categories,
        labels, scrollRef, enterClass, hoverProps, onEventClick, onStartCreate, onStartMove, onStartResize, onScroll
    } = props;

    const hourPx = hourHeightPx(slotMinutes);
    const slotPx = (hourPx * slotMinutes) / 60;   // pixels per sub-slot gridline
    const winStart = dayStartHour * 60;
    const winEnd = dayEndHour * 60;
    const gridHeight = ((winEnd - winStart) / 60) * hourPx;
    const hours: number[] = [];
    for (let h = dayStartHour; h < dayEndHour; h++) { hours.push(h); }
    const headFmt = intlFormat(locale, { weekday: 'short', day: 'numeric' });
    const hourFmt = intlFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const nowMin = nowMinutes;
    const colStyle = { ['--cal-cols' as keyof React.CSSProperties]: cols.length } as React.CSSProperties;
    // Column gridlines: a strong line per hour, plus faint sub-slot lines when finer than 60 min.
    const colBg: React.CSSProperties = slotMinutes < 60
        ? {
            backgroundImage:
                'linear-gradient(to bottom, var(--cal-line) 1px, transparent 1px), ' +
                'linear-gradient(to bottom, color-mix(in srgb, var(--cal-line) 45%, transparent) 1px, transparent 1px)',
            backgroundSize: `100% ${hourPx}px, 100% ${slotPx}px`
        }
        : { backgroundSize: `100% ${hourPx}px` };
    // Background bands read colour off the event, so resolve category colours up front.
    const bgEvents = events.map((e) => ({ ...e, color: resolveColor(categories, e) }));
    // Shift boundaries within the visible window (the grid is wall-clock-linear, so
    // a shift start is simply a y-position).
    const shiftMarks = visibleShifts(shifts, winStart, winEnd);

    const renderPreview = (dayIso: string): React.ReactNode => {
        if (!preview || preview.dayIso !== dayIso) {
            return null;
        }
        const top = ((preview.startMin - winStart) / 60) * hourPx;
        const height = ((preview.endMin - preview.startMin) / 60) * hourPx;
        const timeLabel = `${hhmm(preview.startMin)} – ${hhmm(preview.endMin)}`;
        if (preview.mode === 'create') {
            return (
                <div className="mustry-cal-tg-select" style={{ top, height }}>
                    <span className="mustry-cal-tg-select-time">{timeLabel}</span>
                </div>
            );
        }
        return (
            <div
                className="mustry-cal-tg-event mustry-cal-tg-event--ghost"
                style={{ top, height, left: 0, width: 'calc(100% - 3px)', ...(preview.color ? { ['--ev' as string]: preview.color } : {}) } as React.CSSProperties}
            >
                {preview.title || ''}
                <span className="mustry-cal-tg-time">{timeLabel}</span>
            </div>
        );
    };

    return (
        <div className="mustry-cal-tg mustry-cal-anim-view" key={view}>
            <div className="mustry-cal-tg-head" style={colStyle}>
                <div className="mustry-cal-tg-gutter-cell" />
                {cols.map((c) => (
                    <div className={`mustry-cal-tg-dayhead${c.isToday ? ' mustry-cal-tg-dayhead--today' : ''}`} key={c.iso}>
                        {headFmt.format(c.date)}
                    </div>
                ))}
            </div>
            <div className="mustry-cal-tg-allday" style={colStyle}>
                <div className="mustry-cal-tg-gutter-cell mustry-cal-tg-allday-label">{labels.allDayTime}</div>
                {layoutWeekSegments(cols.map((c) => c.iso), events.filter((e) => e.allDay)).map((seg, i) => (
                    <EventBar
                        key={seg.event.id || `ad-${i}`}
                        seg={seg} colOffset={2} categories={categories}
                        enterClass={enterClass} hoverProps={hoverProps} onEventClick={onEventClick}
                    />
                ))}
            </div>
            <div className="mustry-cal-tg-scroll" ref={scrollRef} onScroll={onScroll}>
                <div className="mustry-cal-tg-body" style={{ ...colStyle, height: gridHeight }}>
                    <div className="mustry-cal-tg-gutter">
                        {hours.map((h) => (
                            <div className="mustry-cal-tg-hour" key={h} style={{ height: hourPx }}>
                                <span>{hourFmt.format(new Date(2000, 0, 1, h, 0))}</span>
                            </div>
                        ))}
                    </div>
                    {cols.map((c) => (
                        <div
                            className={`mustry-cal-tg-col${c.isToday ? ' mustry-cal-tg-col--today' : ''}`}
                            key={c.iso}
                            data-day={c.iso}
                            style={colBg}
                            onPointerDown={(e) => onStartCreate(c.iso, e)}
                        >
                            {backgroundBandsForDay(bgEvents, c.iso, winStart, winEnd).map((b, i) => (
                                <div
                                    className="mustry-cal-tg-bg"
                                    key={b.id || `bg${i}`}
                                    style={{
                                        top: ((b.startMin - winStart) / 60) * hourPx,
                                        height: ((b.endMin - b.startMin) / 60) * hourPx,
                                        background: b.color || undefined
                                    }}
                                />
                            ))}
                            {layoutDayEvents(events, c.iso, winStart, winEnd, DEFAULT_DUR_MIN).map((it, i) => {
                                const ev = it.event;
                                if (preview && preview.eventId === ev.id) {
                                    return null; // hidden while dragging; the ghost is shown instead
                                }
                                const top = ((it.startMin - winStart) / 60) * hourPx;
                                const height = ((it.endMin - it.startMin) / 60) * hourPx;
                                const movable = editable && !it.continuesUp && !it.continuesDown;
                                const cls = ['mustry-cal-tg-event'];
                                if (movable) { cls.push('mustry-cal-tg-event--draggable'); }
                                if (it.continuesUp) { cls.push('mustry-cal-tg-event--cont-up'); }
                                if (it.continuesDown) { cls.push('mustry-cal-tg-event--cont-down'); }
                                const color = resolveColor(categories, ev);
                                return (
                                    <button
                                        type="button"
                                        className={cls.join(' ') + statusClass(ev) + enterClass(ev.id || '')}
                                        key={ev.id || i} title={ev.title}
                                        style={{
                                            top, height,
                                            left: `${(it.lane / it.lanes) * 100}%`,
                                            width: `calc(${100 / it.lanes}% - 3px)`,
                                            ...(color ? { ['--ev' as string]: color } : {})
                                        } as React.CSSProperties}
                                        onPointerDown={(e) => (movable ? onStartMove(ev, e) : onEventClick(ev, e))}
                                        // Keyboard: gestures hang off pointerdown, so Enter/Space
                                        // must open the event directly (a keyboard can't drag).
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onEventClick(ev, e as unknown as React.MouseEvent);
                                            }
                                        }}
                                        {...hoverProps(ev)}
                                    >
                                        {editable && !it.continuesUp && height >= 24 && (
                                            // Kept off short chips so the handles don't swallow the move surface.
                                            <div className="mustry-cal-tg-resize mustry-cal-tg-resize--start" onPointerDown={(e) => onStartResize(ev, 'start', e)} />
                                        )}
                                        {isOccurrence(ev) && (
                                            // Part of a series: dragging/editing detaches this occurrence.
                                            <span className="mustry-cal-ev-recur" aria-hidden="true">↻</span>
                                        )}
                                        <EventIcon ev={ev} categories={categories} />
                                        {ev.title}
                                        {height >= 34 && !it.continuesUp && (
                                            <span className="mustry-cal-tg-time">
                                                {hhmm(it.startMin)}{it.continuesDown ? ' →' : `–${hhmm(it.endMin)}`}
                                            </span>
                                        )}
                                        {editable && !it.continuesDown && (
                                            <div className="mustry-cal-tg-resize mustry-cal-tg-resize--end" onPointerDown={(e) => onStartResize(ev, 'end', e)} />
                                        )}
                                    </button>
                                );
                            })}
                            {renderPreview(c.iso)}
                            {c.isToday && nowMin >= winStart && nowMin <= winEnd && (
                                <div className="mustry-cal-tg-now" style={{ top: ((nowMin - winStart) / 60) * hourPx }} />
                            )}
                        </div>
                    ))}
                    {shiftMarks.length > 0 && (
                        // Behind the events (they carry z-index) and pointer-transparent, so
                        // the lines never intercept clicks or drags.
                        <div className="mustry-cal-tg-shifts" aria-hidden="true">
                            {shiftMarks.map((s, i) => (
                                <div
                                    className="mustry-cal-tg-shift"
                                    key={`${s.label}-${s.min}-${i}`}
                                    style={{ top: ((s.min - winStart) / 60) * hourPx }}
                                >
                                    <span className="mustry-cal-tg-shift-label">{s.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
