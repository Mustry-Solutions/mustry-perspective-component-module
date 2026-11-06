// The keyboard path to a month cell's click action. It has no click handler: the
// browser turns Enter/Space into a click, which bubbles to the cell's own onClick, so
// the cell stays the one place that fires. CSS makes it pointer-transparent, so a
// pointer never lands on it and hit-testing is unchanged. It can't be the cell itself:
// role="button" on the cell couldn't legally contain the date-number button.
import * as React from 'react';
import { MonthGrid, monthArrowTarget } from './calendarLogic';

interface DayCreateButtonProps {
    iso: string;
    grid: MonthGrid;
    weeksRef: React.RefObject<HTMLDivElement>;
    isTabStop: boolean;      // only one of these is in the Tab order; arrows move between them
    label: string;
    onFocusDay: (iso: string) => void;
}

export function DayCreateButton({ iso, grid, weeksRef, isTabStop, label, onFocusDay }: DayCreateButtonProps): React.ReactElement {
    const onKeyDown = (e: React.KeyboardEvent): void => {
        const target = monthArrowTarget(grid, iso, e.key);
        if (target === null) {
            return;
        }
        e.preventDefault();
        const next = weeksRef.current
            ? weeksRef.current.querySelector(`[data-day="${target}"] .mustry-cal-daycreate`) as HTMLElement | null
            : null;
        if (next) {
            next.focus();
        }
    };
    return (
        <button
            type="button" className="mustry-cal-daycreate" tabIndex={isTabStop ? 0 : -1} aria-label={label}
            onFocus={() => onFocusDay(iso)} onKeyDown={onKeyDown}
        >
            <span aria-hidden="true">+</span>
        </button>
    );
}
