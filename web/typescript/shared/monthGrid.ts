// Month-grid construction, shared by the calendar's month view and the mini
// month navigator (used by multiple components). Pure and framework-free.
import { addDays, firstCellOffset, fmtDate, sameDay, startOfMonth, today } from './dateUtils';

export interface DayCell {
    iso: string;       // 'YYYY-MM-DD'
    date: Date;        // local midnight
    inMonth: boolean;  // belongs to the displayed month (vs. spill-over)
    isToday: boolean;
    isWeekend: boolean;
}

export interface MonthGrid {
    weeks: DayCell[][];
    visibleStart: string;  // first cell, ISO
    visibleEnd: string;    // one past the last cell, ISO (half-open)
}

const WEEKS = 6; // fixed height so the grid doesn't jump between months

/** Build a 6-week month grid starting on the configured week-start day. */
export function buildMonthGrid(
    viewMonth: Date, mondayFirst: boolean, showWeekends: boolean, todayDate: Date = today()
): MonthGrid {
    const monthStart = startOfMonth(viewMonth);
    const gridStart = addDays(monthStart, -firstCellOffset(monthStart, mondayFirst));
    const weeks: DayCell[][] = [];
    for (let w = 0; w < WEEKS; w++) {
        const row: DayCell[] = [];
        for (let d = 0; d < 7; d++) {
            const date = addDays(gridStart, w * 7 + d);
            const dow = date.getDay();
            const isWeekend = dow === 0 || dow === 6;
            if (!showWeekends && isWeekend) {
                continue;
            }
            row.push({
                iso: fmtDate(date),
                date,
                inMonth: date.getMonth() === monthStart.getMonth()
                    && date.getFullYear() === monthStart.getFullYear(),
                isToday: sameDay(date, todayDate),
                isWeekend
            });
        }
        weeks.push(row);
    }
    return {
        weeks,
        visibleStart: fmtDate(gridStart),
        visibleEnd: fmtDate(addDays(gridStart, WEEKS * 7))
    };
}
