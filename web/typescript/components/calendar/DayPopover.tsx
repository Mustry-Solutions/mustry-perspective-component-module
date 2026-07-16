// Month-view popover listing every event for one day (from "+N more" / the date number).
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { intlFormat, parseDate, today } from '../../shared/dateUtils';
import { CalEvent, isOccurrence, timeMinutes } from './calendarLogic';
import { CalLabels, Category, DayPop } from './calendarTypes';
import { EventIcon, resolveColor, statusClass } from '../../shared/eventStyle';

interface DayPopoverProps {
    dayPop: DayPop;
    events: CalEvent[];
    locale: string;
    categories: Category[];
    labels: CalLabels;
    onActivate: (ev: CalEvent, e: React.MouseEvent) => void;
}

export function DayPopover({ dayPop, events, locale, categories, labels, onActivate }: DayPopoverProps): React.ReactElement {
    const d = parseDate(dayPop.iso) || today();
    const headFmt = intlFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    const timeFmt = intlFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const W = 240;
    const left = Math.max(6, Math.min(dayPop.rect.left, window.innerWidth - W - 6));
    const top = Math.max(6, Math.min(dayPop.rect.top, window.innerHeight - 320));
    return ReactDOM.createPortal(
        <div className="mustry-cal-daypop" style={{ top, left, width: W }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="mustry-cal-daypop-head">{headFmt.format(d)}</div>
            <div className="mustry-cal-daypop-list">
                {events.length === 0 ? (
                    <div className="mustry-cal-daypop-empty">{labels.noEvents}</div>
                ) : events.map((ev, i) => {
                    const tm = timeMinutes(ev.start);
                    return (
                        <button
                            type="button" key={ev.id || i} className={`mustry-cal-daypop-event${statusClass(ev)}`}
                            onClick={(e) => onActivate(ev, e)}
                            title={ev.title}
                        >
                            <span className="mustry-cal-daypop-dot" style={{ background: resolveColor(categories, ev) || 'var(--cal-accent)' }} />
                            <span className="mustry-cal-daypop-time">
                                {tm === null ? labels.allDayTime : timeFmt.format(new Date(2000, 0, 1, Math.floor(tm / 60), tm % 60))}
                            </span>
                            {isOccurrence(ev) && (
                                <span className="mustry-cal-ev-recur" aria-hidden="true">↻</span>
                            )}
                            <EventIcon ev={ev} categories={categories} />
                            <span className="mustry-cal-daypop-title">{ev.title}</span>
                        </button>
                    );
                })}
            </div>
        </div>,
        document.body
    );
}
