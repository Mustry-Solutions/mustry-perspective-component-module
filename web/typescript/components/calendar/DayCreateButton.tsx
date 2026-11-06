// The keyboard path to a month cell's click action. It has no click handler: the
// browser turns Enter/Space into a click, which bubbles to the cell's own onClick, so
// the cell stays the one place that fires. CSS makes it pointer-transparent, so a
// pointer never lands on it and hit-testing is unchanged. It can't be the cell itself:
// role="button" on the cell couldn't legally contain the date-number button.
// It says "create" (the name and the "+") only when the click does open the editor;
// otherwise the cell's action is the author's onDateClick, and it names the date alone.
import * as React from 'react';
import { MonthGrid, monthArrowTarget } from './calendarLogic';

interface DayCreateButtonProps {
    iso: string;
    grid: MonthGrid;
    weeksRef: React.RefObject<HTMLDivElement>;
    isTabStop: boolean;      // only one of these is in the Tab order; arrows move between them
    label: string;
    showPlus: boolean;
    onFocusDay: (iso: string) => void;
}

export function DayCreateButton({ iso, grid, weeksRef, isTabStop, label, showPlus, onFocusDay }: DayCreateButtonProps): React.ReactElement {
    const onKeyDown = (e: React.KeyboardEvent): void => {
        // Enter clicks on every auto-repeat, so a held key would fire the action again and
        // again, and would reopen the editor once closing it hands focus back to this button.
        if (e.repeat && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            return;
        }
        // Alt+Left is browser back, Cmd+Left is line start: those aren't ours to take.
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
            return;
        }
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
            {showPlus && <span aria-hidden="true">+</span>}
        </button>
    );
}
