// Week / Day time-grid view: day-head row, all-day strip (spanning bars), and the
// scrollable hour grid with overlap-packed timed events + the active drag/resize ghost.
import * as React from 'react';
import { intlFormat } from '../dateUtils';
import {
    CalEvent, DayCol, hhmm, layoutDayEvents, backgroundBandsForDay, layoutWeekSegments
} from '../calendarLogic';
import { Category, CalView, Preview, SLOT_PX, DEFAULT_DUR_MIN } from './types';
import { EventIcon, resolveColor, statusClass } from './eventStyle';
import { EventBar } from './EventBar';

interface TimeGridProps {
    cols: DayCol[];
    events: CalEvent[];
    locale: string;
    view: CalView;
    editable: boolean;
    dayStartHour: number;
    dayEndHour: number;
    preview: Preview | null;
    categories: Category[];
    scrollRef: React.RefObject<HTMLDivElement>;
    enterClass: (id: string) => string;
    hoverProps: (ev: CalEvent) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };
    onEventClick: (ev: CalEvent, e: React.MouseEvent) => void;
    onStartCreate: (iso: string, e: React.MouseEvent) => void;
    onStartMove: (ev: CalEvent, e: React.MouseEvent) => void;
    onStartResize: (ev: CalEvent, e: React.MouseEvent) => void;
    onScroll: () => void;
}

export function TimeGrid(props: TimeGridProps): React.ReactElement {
    const {
        cols, events, locale, view, editable, dayStartHour, dayEndHour, preview, categories,
        scrollRef, enterClass, hoverProps, onEventClick, onStartCreate, onStartMove, onStartResize, onScroll
    } = props;

    const winStart = dayStartHour * 60;
    const winEnd = dayEndHour * 60;
    const gridHeight = ((winEnd - winStart) / 60) * SLOT_PX;
    const hours: number[] = [];
    for (let h = dayStartHour; h < dayEndHour; h++) { hours.push(h); }
    const headFmt = intlFormat(locale, { weekday: 'short', day: 'numeric' });
    const hourFmt = intlFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const colStyle = { ['--cal-cols' as keyof React.CSSProperties]: cols.length } as React.CSSProperties;
    // Background bands read colour off the event, so resolve category colours up front.
    const bgEvents = events.map((e) => ({ ...e, color: resolveColor(categories, e) }));

    const renderPreview = (dayIso: string): React.ReactNode => {
        if (!preview || preview.dayIso !== dayIso) {
            return null;
        }
        const top = ((preview.startMin - winStart) / 60) * SLOT_PX;
        const height = ((preview.endMin - preview.startMin) / 60) * SLOT_PX;
        const timeLabel = `${hhmm(preview.startMin)} – ${hhmm(preview.endMin)}`;
        if (preview.mode === 'create') {
            return (
                <div className="cal-tg-select" style={{ top, height }}>
                    <span className="cal-tg-select-time">{timeLabel}</span>
                </div>
            );
        }
        return (
            <div
                className="cal-tg-event cal-tg-event--ghost"
                style={{ top, height, left: 0, width: 'calc(100% - 3px)', ...(preview.color ? { ['--ev' as string]: preview.color } : {}) } as React.CSSProperties}
            >
                {preview.title || ''}
                <span className="cal-tg-time">{timeLabel}</span>
            </div>
        );
    };

    return (
        <div className="cal-tg cal-anim-view" key={view}>
            <div className="cal-tg-head" style={colStyle}>
                <div className="cal-tg-gutter-cell" />
                {cols.map((c) => (
                    <div className={`cal-tg-dayhead${c.isToday ? ' cal-tg-dayhead--today' : ''}`} key={c.iso}>
                        {headFmt.format(c.date)}
                    </div>
                ))}
            </div>
            <div className="cal-tg-allday" style={colStyle}>
                <div className="cal-tg-gutter-cell cal-tg-allday-label">all-day</div>
                {layoutWeekSegments(cols.map((c) => c.iso), events.filter((e) => e.allDay)).map((seg, i) => (
                    <EventBar
                        key={seg.event.id || `ad-${i}`}
                        seg={seg} colOffset={2} categories={categories}
                        enterClass={enterClass} hoverProps={hoverProps} onEventClick={onEventClick}
                    />
                ))}
            </div>
            <div className="cal-tg-scroll" ref={scrollRef} onScroll={onScroll}>
                <div className="cal-tg-body" style={{ ...colStyle, height: gridHeight }}>
                    <div className="cal-tg-gutter">
                        {hours.map((h) => (
                            <div className="cal-tg-hour" key={h} style={{ height: SLOT_PX }}>
                                <span>{hourFmt.format(new Date(2000, 0, 1, h, 0))}</span>
                            </div>
                        ))}
                    </div>
                    {cols.map((c) => (
                        <div
                            className={`cal-tg-col${c.isToday ? ' cal-tg-col--today' : ''}`}
                            key={c.iso}
                            data-day={c.iso}
                            style={{ backgroundSize: `100% ${SLOT_PX}px` }}
                            onMouseDown={(e) => onStartCreate(c.iso, e)}
                        >
                            {backgroundBandsForDay(bgEvents, c.iso, winStart, winEnd).map((b, i) => (
                                <div
                                    className="cal-tg-bg"
                                    key={b.id || `bg${i}`}
                                    style={{
                                        top: ((b.startMin - winStart) / 60) * SLOT_PX,
                                        height: ((b.endMin - b.startMin) / 60) * SLOT_PX,
                                        background: b.color || undefined
                                    }}
                                />
                            ))}
                            {layoutDayEvents(events, c.iso, winStart, winEnd, DEFAULT_DUR_MIN).map((it, i) => {
                                const ev = it.event;
                                if (preview && preview.eventId === ev.id) {
                                    return null; // hidden while dragging; the ghost is shown instead
                                }
                                const top = ((it.startMin - winStart) / 60) * SLOT_PX;
                                const height = ((it.endMin - it.startMin) / 60) * SLOT_PX;
                                const movable = editable && !it.continuesUp && !it.continuesDown;
                                const cls = ['cal-tg-event'];
                                if (movable) { cls.push('cal-tg-event--draggable'); }
                                if (it.continuesUp) { cls.push('cal-tg-event--cont-up'); }
                                if (it.continuesDown) { cls.push('cal-tg-event--cont-down'); }
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
                                        onMouseDown={(e) => (movable ? onStartMove(ev, e) : onEventClick(ev, e))}
                                        {...hoverProps(ev)}
                                    >
                                        <EventIcon ev={ev} categories={categories} />
                                        {ev.title}
                                        {height >= 34 && !it.continuesUp && (
                                            <span className="cal-tg-time">
                                                {hhmm(it.startMin)}{it.continuesDown ? ' →' : `–${hhmm(it.endMin)}`}
                                            </span>
                                        )}
                                        {movable && (
                                            <div className="cal-tg-resize" onMouseDown={(e) => onStartResize(ev, e)} />
                                        )}
                                    </button>
                                );
                            })}
                            {renderPreview(c.iso)}
                            {c.isToday && nowMin >= winStart && nowMin <= winEnd && (
                                <div className="cal-tg-now" style={{ top: ((nowMin - winStart) / 60) * SLOT_PX }} />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
