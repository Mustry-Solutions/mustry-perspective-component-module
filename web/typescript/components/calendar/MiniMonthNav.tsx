// Mini-month navigator — a compact month grid in a popover anchored under the title.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { fmtDate, intlFormat, monthLabel, startOfMonth, today } from '../dateUtils';
import { buildMonthGrid } from '../calendarLogic';
import { MiniNav } from './types';

interface MiniMonthNavProps {
    mini: MiniNav;
    locale: string;
    mondayFirst: boolean;
    range: { start: string; end: string };
    cursorIso: string;
    showRange: boolean;   // highlight the visible range (week/day/list, not month)
    onStep: (dir: number) => void;
    onPick: (iso: string) => void;
}

export function MiniMonthNav(props: MiniMonthNavProps): React.ReactElement {
    const { mini, locale, mondayFirst, range, cursorIso, showRange, onStep, onPick } = props;
    const grid = buildMonthGrid(startOfMonth(mini.month), mondayFirst, true);
    const wdFmt = intlFormat(locale, { weekday: 'narrow' });
    const MINI_W = 236;
    const left = Math.max(6, Math.min(mini.rect.left, window.innerWidth - MINI_W - 6));
    return ReactDOM.createPortal(
        <div className="cal-mini" style={{ top: mini.rect.bottom + 6, left, width: MINI_W }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="cal-mini-head">
                <button type="button" className="cal-mini-nav" onClick={() => onStep(-1)} aria-label="Previous month">‹</button>
                <span className="cal-mini-title">{monthLabel(mini.month, locale)}</span>
                <button type="button" className="cal-mini-nav" onClick={() => onStep(1)} aria-label="Next month">›</button>
            </div>
            <div className="cal-mini-grid">
                {grid.weeks[0].map((c) => <div className="cal-mini-wd" key={`wd-${c.iso}`}>{wdFmt.format(c.date)}</div>)}
                {grid.weeks.flat().map((c) => {
                    const cls = ['cal-mini-day'];
                    if (!c.inMonth) { cls.push('cal-mini-day--other'); }
                    if (showRange && c.iso >= range.start && c.iso < range.end) { cls.push('cal-mini-day--range'); }
                    if (c.isToday) { cls.push('cal-mini-day--today'); }
                    if (c.iso === cursorIso) { cls.push('cal-mini-day--selected'); }
                    return (
                        <button type="button" key={c.iso} className={cls.join(' ')} onClick={() => onPick(c.iso)}>
                            {c.date.getDate()}
                        </button>
                    );
                })}
            </div>
            <div className="cal-mini-foot">
                <button type="button" className="cal-mini-today" onClick={() => onPick(fmtDate(today()))}>Today</button>
            </div>
        </div>,
        document.body
    );
}
