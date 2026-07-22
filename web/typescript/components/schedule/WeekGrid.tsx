import * as React from 'react';
import { formatMinutes, formatTimeRanges, hourTicks, DayKey, TimeRange } from './scheduleLogic';
import { ScheduleGestureController, ScheduleGesturePreview } from './scheduleGestureController';

export interface WeekGridDay {
    key: DayKey;
    /** Localized short weekday header. */
    label: string;
    ranges: TimeRange[];
}

interface WeekGridProps {
    days: WeekGridDay[];
    /** Display window, whole hours (already clamped). */
    startHour: number;
    endHour: number;
    /** Editing (M1): paint/resize gestures + click-to-remove. Read-only when absent. */
    editable: boolean;
    gestures: ScheduleGestureController | null;
    preview: ScheduleGesturePreview | null;
    clickToRemoveLabel: string;
    onRemoveRange: (day: DayKey, index: number) => void;
}

/**
 * The availability week grid: 7 day columns, availability painted as blocks
 * positioned by percentage of the visible hour window. When editable, empty
 * space is a paint surface, block edges are resize handles, and a deliberate
 * click on a block removes it (all changes are draft-only until Save).
 */
export function WeekGrid(props: WeekGridProps): JSX.Element {
    const { days, startHour, endHour, editable, gestures, preview, onRemoveRange } = props;
    const windowStart = startHour * 60;
    const windowSpan = (endHour - startHour) * 60;
    const hourPct = 100 / (endHour - startHour);

    const pct = (minutes: number): number =>
        Math.max(0, Math.min(100, ((minutes - windowStart) / windowSpan) * 100));

    const visible = (r: TimeRange): boolean =>
        r.end > windowStart && r.start < windowStart + windowSpan;

    const blockStyle = (r: TimeRange): React.CSSProperties =>
        ({ top: `${pct(r.start)}%`, height: `${pct(r.end) - pct(r.start)}%` });

    const renderBlock = (day: WeekGridDay, r: TimeRange, i: number): React.ReactNode => {
        // While this block is being resized, the preview replaces it.
        const hidden = preview && preview.mode === 'resize' && preview.day === day.key && preview.rangeIndex === i;
        if (hidden) {
            return null;
        }
        return (
            <div
                key={`${r.start}-${r.end}`}
                className={'mustry-sched-block' + (editable ? ' mustry-sched-block--editable' : '')}
                style={blockStyle(r)}
                title={editable ? `${formatTimeRanges([r])} — ${props.clickToRemoveLabel}` : formatTimeRanges([r])}
                onClick={editable ? () => onRemoveRange(day.key, i) : undefined}
            >
                {editable && gestures && (
                    <React.Fragment>
                        <div
                            className="mustry-sched-handle mustry-sched-handle--start"
                            onPointerDown={(e) => gestures.onHandleDown(day.key, i, 'start', r, e)}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div
                            className="mustry-sched-handle mustry-sched-handle--end"
                            onPointerDown={(e) => gestures.onHandleDown(day.key, i, 'end', r, e)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </React.Fragment>
                )}
            </div>
        );
    };

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
                        className={'mustry-sched-col' + (editable ? ' mustry-sched-col--editable' : '')}
                        // Hour gridlines: one background repeat per visible hour.
                        style={{ backgroundSize: `100% ${hourPct}%` }}
                        onPointerDown={editable && gestures ? (e) => gestures.onColumnDown(d.key, e) : undefined}
                    >
                        {/* Map over the FULL array so i stays a valid ranges index
                            for remove/resize even when the window clips some blocks. */}
                        {d.ranges.map((r, i) => (visible(r) ? renderBlock(d, r, i) : null))}
                        {preview && preview.day === d.key && visible(preview.range) && (
                            <div
                                className="mustry-sched-block mustry-sched-block--preview"
                                style={blockStyle(preview.range)}
                            >
                                <span className="mustry-sched-preview-label">
                                    {formatTimeRanges([preview.range])}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
