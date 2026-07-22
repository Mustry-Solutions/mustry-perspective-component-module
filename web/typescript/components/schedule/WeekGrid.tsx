import * as React from 'react';
import { formatMinutes, formatTimeRanges, hourTicks, TimeRange } from './scheduleLogic';

export interface WeekGridDay {
    key: string;
    /** Localized short weekday header. */
    label: string;
    ranges: TimeRange[];
}

interface WeekGridProps {
    days: WeekGridDay[];
    /** Display window, whole hours (already clamped). */
    startHour: number;
    endHour: number;
}

/**
 * Read-only availability week grid: 7 day columns, availability painted as
 * blocks positioned by percentage of the visible hour window. (M1 turns this
 * into the paint surface for the drag gesture controller.)
 */
export function WeekGrid(props: WeekGridProps): JSX.Element {
    const { days, startHour, endHour } = props;
    const windowStart = startHour * 60;
    const windowSpan = (endHour - startHour) * 60;
    const hourPct = 100 / (endHour - startHour);

    const pct = (minutes: number): number =>
        Math.max(0, Math.min(100, ((minutes - windowStart) / windowSpan) * 100));

    return (
        <div className="mustry-sched-grid">
            <div className="mustry-sched-grid-head">
                <div className="mustry-sched-gutter-head" />
                {days.map((d) => (
                    <div key={d.key} className="mustry-sched-dayhead">{d.label}</div>
                ))}
            </div>
            <div className="mustry-sched-grid-body">
                <div className="mustry-sched-gutter">
                    {hourTicks(startHour, endHour).map((h) => (
                        <div key={h} className="mustry-sched-tick" style={{ top: `${pct(h * 60)}%` }}>
                            {formatMinutes(h * 60)}
                        </div>
                    ))}
                </div>
                {days.map((d) => (
                    <div
                        key={d.key}
                        className="mustry-sched-col"
                        // Hour gridlines: one background repeat per visible hour.
                        style={{ backgroundSize: `100% ${hourPct}%` }}
                    >
                        {d.ranges
                            .filter((r) => r.end > windowStart && r.start < windowStart + windowSpan)
                            .map((r) => (
                                <div
                                    key={`${r.start}-${r.end}`}
                                    className="mustry-sched-block"
                                    style={{ top: `${pct(r.start)}%`, height: `${pct(r.end) - pct(r.start)}%` }}
                                    title={formatTimeRanges([r])}
                                />
                            ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
