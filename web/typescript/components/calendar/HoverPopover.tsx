// Event detail popover shown on hover, portaled to escape the calendar's clipping.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { addDays, intlFormat, parseDate } from '../../shared/dateUtils';
import { isTimed, hhmm, timeMinutes } from '../calendarLogic';
import { Category, HoverInfo, DEFAULT_DUR_MIN } from './types';
import { resolveColor, eventIcon } from '../../shared/eventStyle';

interface HoverPopoverProps {
    hover: HoverInfo;
    locale: string;
    categories: Category[];
}

export function HoverPopover({ hover, locale, categories }: HoverPopoverProps): React.ReactElement {
    const ev = hover.event;
    const width = 240;
    let left = hover.rect.right + 8;
    if (left + width > window.innerWidth - 8) {
        left = Math.max(8, hover.rect.left - width - 8);
    }
    const top = Math.max(8, Math.min(hover.rect.top, window.innerHeight - 130));
    const dFmt = intlFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' });
    const sDate = parseDate(ev.start);
    const dateStr = sDate ? dFmt.format(sDate) : '';
    const sameDay = !ev.end || ev.end.slice(0, 10) === ev.start.slice(0, 10);
    let timeStr: string;
    if (isTimed(ev)) {
        const sMin = timeMinutes(ev.start) as number;
        const eDate = ev.end ? parseDate(ev.end) : null;
        const eMinRaw = ev.end ? timeMinutes(ev.end) : null;
        if (!sameDay && eDate && eMinRaw !== null) {
            // crosses midnight / spans days -> show the end date too
            timeStr = `${dateStr} ${hhmm(sMin)} – ${dFmt.format(eDate)} ${hhmm(eMinRaw)}`;
        } else {
            let eMin = eMinRaw !== null ? eMinRaw : null;
            if (eMin === null || eMin <= sMin) {
                eMin = sMin + DEFAULT_DUR_MIN;
            }
            timeStr = `${dateStr} · ${hhmm(sMin)} – ${hhmm(eMin)}`;
        }
    } else if (!sameDay && ev.end) {
        // multi-day all-day: end is exclusive, so the last shown day is end - 1
        const lastDate = addDays(parseDate(ev.end) as Date, -1);
        timeStr = `All day · ${dateStr} – ${dFmt.format(lastDate)}`;
    } else {
        timeStr = `All day · ${dateStr}`;
    }
    const statusLabel = ev.status === 'tentative' ? 'Tentative'
        : ev.status === 'cancelled' ? 'Cancelled'
            : ev.status === 'done' ? 'Done' : '';
    const icon = eventIcon(categories, ev);
    const color = resolveColor(categories, ev);
    return ReactDOM.createPortal(
        <div className="cal-popover" style={{ top, left, width }}>
            <div className="cal-popover-title">
                {icon
                    ? <span className="cal-ev-icon"><IconRenderer path={icon} color={color || 'currentColor'} /></span>
                    : <span className="cal-popover-dot" style={{ background: color || 'var(--cal-accent)' }} />}
                <span className="cal-popover-name">{ev.title}</span>
                {statusLabel ? <span className="cal-popover-status">{statusLabel}</span> : null}
            </div>
            <div className="cal-popover-time">{timeStr}</div>
            {ev.description ? <div className="cal-popover-desc">{ev.description}</div> : null}
        </div>,
        document.body
    );
}
