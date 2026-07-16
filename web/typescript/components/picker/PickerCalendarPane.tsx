// The picker's full-layout calendar surface: month nav header + one or two
// months of weekday headers and day grids. Pure presentation — day semantics
// (state, blocking, selection writes) stay in the DateTimeRangePicker class
// and arrive as callbacks.
import * as React from 'react';
import {
    addDays,
    addMonths,
    daysInMonth,
    firstCellOffset,
    fmtDate,
    monthLabel,
    startOfMonth,
    weekdayHeaders
} from '../../shared/dateUtils';
import { LabelConfig, WeekStart } from './pickerTypes';

export type DayState = 'empty' | 'disabled' | 'today' | 'default' | 'start' | 'end' | 'inrange' | 'single';

interface PickerCalendarPaneProps {
    viewMonth: Date;
    twoMonths: boolean;
    weekStart: WeekStart;
    locale: string;
    enabled: boolean;
    labels: LabelConfig;
    canPrev: boolean;
    canNext: boolean;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    dayState: (day: Date) => DayState;
    disabledReason: (day: Date) => string;
    onDayClick: (day: Date) => void;
    onDayHover: (day: Date) => void;
    onCalendarsLeave: () => void;
}

function renderGrid(p: PickerCalendarPaneProps, monthStart: Date): React.ReactNode {
    const offset = firstCellOffset(monthStart, p.weekStart === 'monday');
    const count = daysInMonth(monthStart);

    const cells: React.ReactNode[] = [];
    for (let i = 0; i < offset; i++) {
        cells.push(<div key={`blank-${fmtDate(monthStart)}-${i}`} className="mustry-dtrp-cell mustry-dtrp-cell--empty" />);
    }
    for (let d = 1; d <= count; d++) {
        const day = addDays(monthStart, d - 1);
        const st = p.dayState(day);
        const disabled = st === 'disabled';
        cells.push(
            <button
                key={fmtDate(day)}
                type="button"
                className={`mustry-dtrp-cell mustry-dtrp-cell--${st}`}
                disabled={!p.enabled || disabled}
                aria-disabled={!p.enabled || disabled}
                aria-label={fmtDate(day)}
                title={disabled ? p.disabledReason(day) : fmtDate(day)}
                onClick={() => p.onDayClick(day)}
                onMouseEnter={() => p.onDayHover(day)}
            >
                {d}
            </button>
        );
    }
    return cells;
}

/** A single month: weekday header row + day grid. */
function renderCalendar(p: PickerCalendarPaneProps, monthStart: Date): React.ReactNode {
    return (
        <div className="mustry-dtrp-calendar">
            <div className="mustry-dtrp-weekdays">
                {weekdayHeaders(p.weekStart === 'monday', p.locale).map((w) => (
                    <div key={`${fmtDate(monthStart)}-${w}`} className="mustry-dtrp-weekday">{w}</div>
                ))}
            </div>
            <div className="mustry-dtrp-grid">
                {renderGrid(p, monthStart)}
            </div>
        </div>
    );
}

export function PickerCalendarPane(p: PickerCalendarPaneProps): React.ReactElement {
    const m1 = startOfMonth(p.viewMonth);
    const m2 = addMonths(p.viewMonth, 1);
    return (
        <>
            <div className="mustry-dtrp-header">
                <button
                    type="button"
                    className="mustry-dtrp-nav"
                    onClick={p.onPrevMonth}
                    disabled={!p.enabled || !p.canPrev}
                    aria-label={p.labels.previousMonth}
                >
                    ‹
                </button>
                <div className="mustry-dtrp-months">
                    <span className="mustry-dtrp-month">{monthLabel(m1, p.locale)}</span>
                    {p.twoMonths && <span className="mustry-dtrp-month">{monthLabel(m2, p.locale)}</span>}
                </div>
                <button
                    type="button"
                    className="mustry-dtrp-nav"
                    onClick={p.onNextMonth}
                    disabled={!p.enabled || !p.canNext}
                    aria-label={p.labels.nextMonth}
                >
                    ›
                </button>
            </div>

            <div className="mustry-dtrp-calendars" onMouseLeave={p.onCalendarsLeave}>
                {renderCalendar(p, m1)}
                {p.twoMonths && renderCalendar(p, m2)}
            </div>
        </>
    );
}
