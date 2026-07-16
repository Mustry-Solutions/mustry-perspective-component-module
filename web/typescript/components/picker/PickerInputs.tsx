// The picker's small input/readout pieces shared by the full and compact
// layouts: the start/end time fields, the compact date fields, the span-hint
// line and the duration/clear footer. Pure presentation.
import * as React from 'react';
import * as logic from './pickerLogic';
import { LabelConfig } from './pickerTypes';

interface PickerTimeFieldsProps {
    startValue: string;        // "HH:mm" / "HH:mm:ss" at the active granularity
    endValue: string;
    stepSeconds: number;
    enabled: boolean;
    labels: LabelConfig;
    onStartTime: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onEndTime: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function PickerTimeFields(p: PickerTimeFieldsProps): React.ReactElement {
    return (
        <div className="dtrp-times">
            <label className="dtrp-time-field">
                <span className="dtrp-time-label">{p.labels.startTime}</span>
                <input
                    type="time"
                    step={p.stepSeconds}
                    disabled={!p.enabled}
                    value={p.startValue}
                    onChange={p.onStartTime}
                />
            </label>
            <label className="dtrp-time-field">
                <span className="dtrp-time-label">{p.labels.endTime}</span>
                <input
                    type="time"
                    step={p.stepSeconds}
                    disabled={!p.enabled}
                    value={p.endValue}
                    onChange={p.onEndTime}
                />
            </label>
        </div>
    );
}

interface PickerCompactFieldsProps {
    startDate: string;         // "YYYY-MM-DD" (native input values)
    endDate: string;
    startMin?: string;
    startMax?: string;
    endMin?: string;
    endMax?: string;
    enabled: boolean;
    labels: LabelConfig;
    onStartDate: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onEndDate: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Compact layout's two native date fields (bounds pre-computed by the class). */
export function PickerCompactFields(p: PickerCompactFieldsProps): React.ReactElement {
    return (
        <>
            <label className="dtrp-compact-field">
                <span className="dtrp-compact-label">{p.labels.startDate}</span>
                <input
                    type="date"
                    value={p.startDate}
                    min={p.startMin}
                    max={p.startMax}
                    disabled={!p.enabled}
                    onChange={p.onStartDate}
                />
            </label>
            <label className="dtrp-compact-field">
                <span className="dtrp-compact-label">{p.labels.endDate}</span>
                <input
                    type="date"
                    value={p.endDate}
                    min={p.endMin}
                    max={p.endMax}
                    disabled={!p.enabled}
                    onChange={p.onEndDate}
                />
            </label>
        </>
    );
}

interface PickerHintProps {
    minSpanDays: number;
    maxSpanDays: number;
    labels: LabelConfig;
}

/** Upfront note about the active span constraint, so users know why days disable. */
export function PickerHint(p: PickerHintProps): React.ReactElement | null {
    const { minSpanDays, maxSpanDays, labels } = p;
    if (minSpanDays <= 0 && maxSpanDays <= 0) {
        return null;
    }
    let text: string;
    if (minSpanDays > 0 && maxSpanDays > 0) {
        text = logic.fillLabel(labels.hintRange, { min: minSpanDays, max: maxSpanDays });
    } else if (minSpanDays > 0) {
        text = logic.fillLabel(labels.hintMin, { n: minSpanDays, days: logic.dayWord(minSpanDays, labels) });
    } else {
        text = logic.fillLabel(labels.hintMax, { n: maxSpanDays, days: logic.dayWord(maxSpanDays, labels) });
    }
    return <div className="dtrp-hint">{text}</div>;
}

interface PickerFooterProps {
    label: string;             // duration text / select-a-range / invalid-range
    showClear: boolean;
    enabled: boolean;
    clearLabel: string;
    onClear: () => void;
}

/** Duration text + Clear, shared by the full and compact layouts. */
export function PickerFooter(p: PickerFooterProps): React.ReactElement {
    return (
        <div className="dtrp-footer">
            <span className="dtrp-duration">{p.label}</span>
            {p.showClear && (
                <button type="button" className="dtrp-clear" disabled={!p.enabled} onClick={p.onClear}>
                    {p.clearLabel}
                </button>
            )}
        </div>
    );
}
