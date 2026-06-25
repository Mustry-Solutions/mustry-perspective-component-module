import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import {
    addDays,
    addMonths,
    clampSec,
    combine,
    daysBetween,
    daysInMonth,
    firstCellOffset,
    fmtDate,
    hmsToSec,
    maxDate,
    minDate,
    monthLabel,
    parseDate,
    resolveZoned,
    sameDay,
    secondsOfDay,
    secToHms,
    startOfDay,
    startOfMonth,
    today,
    weekdayHeaders
} from './dateUtils';

// Must match DateTimeRangePicker.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.datetimerangepicker';

type DisableMode = 'past' | 'future' | 'none';
type Granularity = 'day' | 'hour' | 'minute' | 'second';
type LayoutMode = 'auto' | 'compact' | 'oneMonth' | 'twoMonths';
type ResolvedLayout = 'compact' | 'oneMonth' | 'twoMonths';
type PresetUnit = 'hours' | 'days' | 'weeks' | 'months';

interface PresetDef {
    label: string;
    amount: number;
    unit: PresetUnit;
}

export interface DateTimeRangePickerProps {
    // configuration
    enabled: boolean;
    showClear: boolean;
    disableDates: DisableMode;
    earliestDate: string;
    latestDate: string;
    minSpanDays: number;
    maxSpanDays: number;
    durationLabelThresholdHours: number;
    granularity: Granularity;
    firstDayMonday: boolean;
    timezone: string;
    locale: string;
    layout: LayoutMode;
    compactBelowHeight: number;
    compactBelowWidth: number;
    twoMonthsAboveWidth: number;
    showPresets: boolean;
    presets: PresetDef[];
    // selection (two-way)
    startDate: string;     // "YYYY-MM-DD" or ""
    endDate: string;       // "YYYY-MM-DD" or ""
    startTimeSec: number;  // 0..86399
    endTimeSec: number;    // 0..86399
}

interface DateTimeRangePickerState {
    viewMonth: Date;          // first day of the displayed month
    anchor: Date | null;      // first-clicked day of an in-progress range
    hover: Date | null;       // hovered day during preview
    containerWidth: number;   // measured rendered width, drives compact mode
    containerHeight: number;  // measured rendered height, drives compact mode
}

type DayState = 'empty' | 'disabled' | 'today' | 'default' | 'start' | 'end' | 'inrange';

export class DateTimeRangePicker
    extends Component<ComponentProps<DateTimeRangePickerProps>, DateTimeRangePickerState> {

    // Signature of the last outputs we wrote, to avoid redundant prop writes / loops.
    private lastOutputSig = '';

    // Observes the rendered size so the layout can switch to a compact form when short.
    private resizeObserver: ResizeObserver | null = null;

    constructor(props: ComponentProps<DateTimeRangePickerProps>) {
        super(props);
        const start = parseDate(props.props.startDate);
        this.state = {
            viewMonth: startOfMonth(start || today()),
            anchor: null,
            hover: null,
            containerWidth: 99999,   // start in full mode until measured
            containerHeight: 99999
        };
    }

    componentDidMount(): void {
        this.syncOutputs();
        this.observeSize();
    }

    componentDidUpdate(): void {
        this.syncOutputs();
    }

    componentWillUnmount(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    private observeSize(): void {
        const el = this.props.store.element as HTMLElement | undefined;
        if (!el || typeof ResizeObserver === 'undefined') {
            return;
        }
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = entry.contentRect.width;
                const h = entry.contentRect.height;
                if (Math.abs(w - this.state.containerWidth) > 1
                    || Math.abs(h - this.state.containerHeight) > 1) {
                    this.setState({ containerWidth: w, containerHeight: h });
                }
            }
        });
        this.resizeObserver.observe(el);
    }

    // --- bounds ----------------------------------------------------------
    private effMin(): Date | null {
        const { disableDates, earliestDate: min } = this.props.props;
        const parsed = parseDate(min);
        if (parsed) {
            return parsed;
        }
        return disableDates === 'past' ? today() : null;
    }

    private effMax(): Date | null {
        const { disableDates, latestDate: max } = this.props.props;
        const parsed = parseDate(max);
        if (parsed) {
            return parsed;
        }
        return disableDates === 'future' ? today() : null;
    }

    private isDisabled(day: Date): boolean {
        const min = this.effMin();
        const max = this.effMax();
        if (min && day.getTime() < min.getTime()) {
            return true;
        }
        if (max && day.getTime() > max.getTime()) {
            return true;
        }
        return false;
    }

    /** While picking the second endpoint, block days that violate the min/max-day span. */
    private isSpanInvalid(day: Date): boolean {
        const anchor = this.state.anchor;
        if (!anchor) {
            return false;
        }
        const { minSpanDays, maxSpanDays } = this.props.props;
        const span = Math.abs(daysBetween(anchor, day));
        if (minSpanDays > 0 && span < minSpanDays) {
            return true;
        }
        if (maxSpanDays > 0 && span > maxSpanDays) {
            return true;
        }
        return false;
    }

    private dayBlocked(day: Date): boolean {
        return this.isDisabled(day) || this.isSpanInvalid(day);
    }

    /** Human-readable reason a day is disabled (used as the cell tooltip). '' if selectable. */
    private disabledReason(day: Date): string {
        const min = this.effMin();
        const max = this.effMax();
        if (min && day.getTime() < min.getTime()) {
            return `Before the earliest selectable date (${fmtDate(min)})`;
        }
        if (max && day.getTime() > max.getTime()) {
            return `After the latest selectable date (${fmtDate(max)})`;
        }
        const anchor = this.state.anchor;
        if (anchor) {
            const { minSpanDays, maxSpanDays } = this.props.props;
            const span = Math.abs(daysBetween(anchor, day));
            if (minSpanDays > 0 && span < minSpanDays) {
                return `Range must be at least ${minSpanDays} day${minSpanDays === 1 ? '' : 's'}`;
            }
            if (maxSpanDays > 0 && span > maxSpanDays) {
                return `Range can be at most ${maxSpanDays} day${maxSpanDays === 1 ? '' : 's'}`;
            }
        }
        return '';
    }

    // --- selection state machine ----------------------------------------
    private onDayClick = (day: Date): void => {
        if (this.dayBlocked(day)) {
            return;
        }
        const start = parseDate(this.props.props.startDate);
        const end = parseDate(this.props.props.endDate);
        const write = this.props.store.props;

        if (start && end) {
            // Range complete -> start a new range anchored on this day.
            write.write('selection.startDate', '');
            write.write('selection.endDate', '');
            this.setState({ anchor: day, hover: null });
            return;
        }

        if (this.state.anchor) {
            // Second endpoint -> normalise so start <= end.
            const lo = minDate(this.state.anchor, day);
            const hi = maxDate(this.state.anchor, day);
            write.write('selection.startDate', fmtDate(lo));
            write.write('selection.endDate', fmtDate(hi));
            this.setState({ anchor: null, hover: null });
            return;
        }

        // Empty -> set the anchor (first click).
        this.setState({ anchor: day, hover: null });
    };

    private onDayHover = (day: Date): void => {
        if (this.state.anchor && !this.dayBlocked(day)) {
            this.setState({ hover: day });
        }
    };

    private clearHover = (): void => {
        if (this.state.hover) {
            this.setState({ hover: null });
        }
    };

    private clear = (): void => {
        const write = this.props.store.props;
        write.write('selection.startDate', '');
        write.write('selection.endDate', '');
        this.setState({ anchor: null, hover: null });
    };

    // The (datetime) endpoints a preset would set. Direction follows the disableDates
    // mode — forward in 'past' (forward-booking) mode so the range lands on selectable
    // days, backward otherwise (the historical/historian case).
    private presetRange(p: PresetDef): { start: Date; end: Date } {
        const forward = this.props.props.disableDates === 'past';
        const sign = forward ? 1 : -1;
        const now = new Date();
        let other: Date;
        switch (p.unit) {
            case 'hours':
                other = new Date(now.getTime() + sign * p.amount * 3600000);
                break;
            case 'weeks':
                other = new Date(now.getTime() + sign * p.amount * 7 * 86400000);
                break;
            case 'months':
                other = new Date(
                    now.getFullYear(), now.getMonth() + sign * p.amount, now.getDate(),
                    now.getHours(), now.getMinutes(), now.getSeconds()
                );
                break;
            case 'days':
            default:
                other = new Date(now.getTime() + sign * p.amount * 86400000);
                break;
        }
        return { start: forward ? now : other, end: forward ? other : now };
    }

    /** Reason a preset's resulting range would be invalid (dateBounds / spanDays), '' if OK. */
    private presetConflict(p: PresetDef): string {
        const range = this.presetRange(p);
        const lo = startOfDay(minDate(range.start, range.end));
        const hi = startOfDay(maxDate(range.start, range.end));
        const min = this.effMin();
        const max = this.effMax();
        if (min && lo.getTime() < min.getTime()) {
            return `Starts before the earliest selectable date (${fmtDate(min)})`;
        }
        if (max && hi.getTime() > max.getTime()) {
            return `Ends after the latest selectable date (${fmtDate(max)})`;
        }
        const span = daysBetween(lo, hi);
        const { minSpanDays, maxSpanDays } = this.props.props;
        if (minSpanDays > 0 && span < minSpanDays) {
            return `Shorter than the ${minSpanDays}-day minimum`;
        }
        if (maxSpanDays > 0 && span > maxSpanDays) {
            return `Exceeds the ${maxSpanDays}-day maximum`;
        }
        return '';
    }

    // Apply a preset: set the selection to its range (no-op if it would conflict).
    private applyPreset = (p: PresetDef): void => {
        if (this.presetConflict(p)) {
            return;
        }
        const { start, end } = this.presetRange(p);
        const w = this.props.store.props;
        w.write('selection.startDate', fmtDate(startOfDay(start)));
        w.write('selection.startTimeSec', secondsOfDay(start));
        w.write('selection.endDate', fmtDate(startOfDay(end)));
        w.write('selection.endTimeSec', secondsOfDay(end));
        this.setState({ anchor: null, hover: null, viewMonth: startOfMonth(today()) });
    };

    /** Adapt the label to the roll direction ("Last ..." -> "Next ..." in forward mode). */
    private presetLabel(p: PresetDef): string {
        if (this.props.props.disableDates === 'past') {
            return p.label.replace(/\bLast\b/i, 'Next');
        }
        return p.label;
    }

    // --- month navigation ------------------------------------------------
    private canPrev(): boolean {
        const min = this.effMin();
        return !(min && startOfMonth(this.state.viewMonth).getTime() <= startOfMonth(min).getTime());
    }

    private canNext(): boolean {
        const max = this.effMax();
        if (!max) {
            return true;
        }
        const lastVisible = addMonths(this.state.viewMonth, this.monthsShown() - 1);
        return startOfMonth(lastVisible).getTime() < startOfMonth(max).getTime();
    }

    // --- layout resolution -----------------------------------------------
    /** Resolve the effective layout: honour an explicit choice, else pick by size. */
    private resolveLayout(): ResolvedLayout {
        const { layout, compactBelowWidth, compactBelowHeight, twoMonthsAboveWidth } = this.props.props;
        if (layout === 'compact' || layout === 'oneMonth' || layout === 'twoMonths') {
            return layout;
        }
        const w = this.state.containerWidth;
        const h = this.state.containerHeight;
        if (h < compactBelowHeight || w < compactBelowWidth) {
            return 'compact';
        }
        if (w >= twoMonthsAboveWidth) {
            return 'twoMonths';
        }
        return 'oneMonth';
    }

    private monthsShown(): number {
        return this.resolveLayout() === 'twoMonths' ? 2 : 1;
    }

    private prevMonth = (): void => {
        if (this.canPrev()) {
            this.setState({ viewMonth: addMonths(this.state.viewMonth, -1) });
        }
    };

    private nextMonth = (): void => {
        if (this.canNext()) {
            this.setState({ viewMonth: addMonths(this.state.viewMonth, 1) });
        }
    };

    // --- time selectors --------------------------------------------------
    /** Step (seconds) for the chosen granularity. */
    private stepSeconds(): number {
        switch (this.props.props.granularity) {
            case 'day': return 86400;
            case 'hour': return 3600;
            case 'minute': return 60;
            default: return 1;
        }
    }

    /** Effective start/end time-of-day (seconds). In 'day' mode the range covers
     *  whole days: 00:00:00 to 23:59:59; otherwise the snapped selected times. */
    private effStartSec(): number {
        return this.props.props.granularity === 'day' ? 0 : this.snapSec(this.props.props.startTimeSec);
    }

    private effEndSec(): number {
        return this.props.props.granularity === 'day' ? 86399 : this.snapSec(this.props.props.endTimeSec);
    }

    /** Snap seconds-since-midnight down to the chosen granularity. */
    private snapSec(sec: number): number {
        const step = this.stepSeconds();
        return Math.floor(clampSec(sec) / step) * step;
    }

    /** Value string for a native <input type="time"> at the chosen granularity. */
    private timeInputValue(sec: number): string {
        const hms = secToHms(this.snapSec(sec));      // "HH:mm:ss"
        return this.props.props.granularity === 'second' ? hms : hms.slice(0, 5); // "HH:mm"
    }

    private onStartTime = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.store.props.write('selection.startTimeSec', this.snapSec(hmsToSec(e.target.value)));
    };

    private onEndTime = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.store.props.write('selection.endTimeSec', this.snapSec(hmsToSec(e.target.value)));
    };

    // Compact-mode date fields: write the date directly (already "YYYY-MM-DD").
    private onStartDateInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.store.props.write('selection.startDate', e.target.value);
    };

    private onEndDateInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.store.props.write('selection.endDate', e.target.value);
    };

    // --- outputs ---------------------------------------------------------
    private durationLabel(days: number, durationHours: number, valid: boolean): string {
        if (!valid) {
            return '';
        }
        if (this.props.props.granularity === 'day') {
            if (days === 0) {
                return 'Same day';
            }
            return days === 1 ? '1 day' : `${days} days`;
        }
        const { durationLabelThresholdHours } = this.props.props;
        if (durationHours >= durationLabelThresholdHours) {
            return days === 1 ? '1 day' : `${days} days`;
        }
        const total = Math.max(0, Math.round(durationHours * 3600));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) {
            return `${h}h ${m}m`;
        }
        if (m > 0) {
            return `${m}m ${s}s`;
        }
        return `${s}s`;
    }

    /** Compute the output values from the committed selection (single source of truth). */
    private computeOutputs() {
        const start = parseDate(this.props.props.startDate);
        const end = parseDate(this.props.props.endDate);
        const base = {
            startDateTime: '',
            endDateTime: '',
            startEpochMs: 0,
            endEpochMs: 0,
            durationDays: 0,
            durationHours: 0,
            durationLabel: '',
            isValid: false
        };
        if (!start || !end) {
            return base;
        }
        const { timezone, minSpanDays, maxSpanDays } = this.props.props;
        // Resolve the picked wall-clock times into absolute instants in the
        // configured timezone (blank = browser-local), giving offset-bearing ISO
        // strings and epoch milliseconds.
        const sZ = resolveZoned(combine(start, this.effStartSec()), timezone);
        const eZ = resolveZoned(combine(end, this.effEndSec()), timezone);
        const durationDays = daysBetween(start, end);
        let valid = eZ.epochMs > sZ.epochMs;
        if (minSpanDays > 0 && durationDays < minSpanDays) {
            valid = false;
        }
        if (maxSpanDays > 0 && durationDays > maxSpanDays) {
            valid = false;
        }
        // True elapsed hours from the absolute instants (DST-correct).
        const durationHours = Math.round(((eZ.epochMs - sZ.epochMs) / 3600000) * 1000) / 1000;
        return {
            startDateTime: sZ.iso,
            endDateTime: eZ.iso,
            startEpochMs: sZ.epochMs,
            endEpochMs: eZ.epochMs,
            durationDays,
            durationHours,
            durationLabel: this.durationLabel(durationDays, durationHours, valid),
            isValid: valid
        };
    }

    /** Write any outputs that changed (de-duplicated to avoid render/write loops). */
    private syncOutputs(): void {
        const out = this.computeOutputs();
        const sig = JSON.stringify(out);
        if (sig === this.lastOutputSig) {
            return;
        }
        this.lastOutputSig = sig;
        const write = this.props.store.props;
        write.write('output.startDateTime', out.startDateTime);
        write.write('output.endDateTime', out.endDateTime);
        write.write('output.startEpochMs', out.startEpochMs);
        write.write('output.endEpochMs', out.endEpochMs);
        write.write('output.durationDays', out.durationDays);
        write.write('output.durationHours', out.durationHours);
        write.write('output.durationLabel', out.durationLabel);
        write.write('output.isValid', out.isValid);
    }

    // --- rendering -------------------------------------------------------
    private dayState(day: Date): DayState {
        if (this.dayBlocked(day)) {
            return 'disabled';
        }
        const start = parseDate(this.props.props.startDate);
        const end = parseDate(this.props.props.endDate);
        const { anchor, hover } = this.state;

        let lo: Date | null = null;
        let hi: Date | null = null;
        if (start && end) {
            lo = start;
            hi = end;
        } else if (anchor && hover) {
            lo = minDate(anchor, hover);
            hi = maxDate(anchor, hover);
        } else if (anchor) {
            lo = anchor;
            hi = anchor;
        }

        if (lo && sameDay(day, lo)) {
            return 'start';
        }
        if (hi && sameDay(day, hi)) {
            return 'end';
        }
        if (lo && hi && day.getTime() > lo.getTime() && day.getTime() < hi.getTime()) {
            return 'inrange';
        }
        if (sameDay(day, today())) {
            return 'today';
        }
        return 'default';
    }

    private renderGrid(monthStart: Date): React.ReactNode {
        const { firstDayMonday, enabled } = this.props.props;
        const offset = firstCellOffset(monthStart, firstDayMonday);
        const count = daysInMonth(monthStart);

        const cells: React.ReactNode[] = [];
        for (let i = 0; i < offset; i++) {
            cells.push(<div key={`blank-${fmtDate(monthStart)}-${i}`} className="dtrp-cell dtrp-cell--empty" />);
        }
        for (let d = 1; d <= count; d++) {
            const day = addDays(monthStart, d - 1);
            const st = this.dayState(day);
            const disabled = st === 'disabled';
            cells.push(
                <button
                    key={fmtDate(day)}
                    type="button"
                    className={`dtrp-cell dtrp-cell--${st}`}
                    disabled={!enabled || disabled}
                    aria-disabled={!enabled || disabled}
                    aria-label={fmtDate(day)}
                    title={disabled ? this.disabledReason(day) : fmtDate(day)}
                    onClick={() => this.onDayClick(day)}
                    onMouseEnter={() => this.onDayHover(day)}
                >
                    {d}
                </button>
            );
        }
        return cells;
    }

    /** Duration text + Clear, shared by the full and compact layouts. */
    private renderFooter(): React.ReactNode {
        const { enabled, showClear } = this.props.props;
        const hasRange = !!parseDate(this.props.props.startDate) && !!parseDate(this.props.props.endDate);
        const out = this.computeOutputs();
        const label = !hasRange ? 'Select a range' : (out.isValid ? out.durationLabel : 'Invalid range');
        return (
            <div className="dtrp-footer">
                <span className="dtrp-duration">{label}</span>
                {showClear && (
                    <button type="button" className="dtrp-clear" disabled={!enabled} onClick={this.clear}>
                        Clear
                    </button>
                )}
            </div>
        );
    }

    private renderPresets(): React.ReactNode {
        const { showPresets, presets, enabled } = this.props.props;
        const items = (presets || []).filter((p) => p && p.label);
        if (!showPresets || items.length === 0) {
            return null;
        }
        return (
            <div className="dtrp-presets">
                {items.map((p, i) => {
                    const conflict = this.presetConflict(p);
                    return (
                        <button
                            key={`${p.label}-${i}`}
                            type="button"
                            className="dtrp-preset"
                            disabled={!enabled || !!conflict}
                            aria-disabled={!enabled || !!conflict}
                            title={conflict || undefined}
                            onClick={() => this.applyPreset(p)}
                        >
                            {this.presetLabel(p)}
                        </button>
                    );
                })}
            </div>
        );
    }

    /** Upfront note about the active span constraint, so users know why days disable. */
    private renderHint(): React.ReactNode {
        const { minSpanDays, maxSpanDays } = this.props.props;
        if (minSpanDays <= 0 && maxSpanDays <= 0) {
            return null;
        }
        let text: string;
        if (minSpanDays > 0 && maxSpanDays > 0) {
            text = `Pick a range of ${minSpanDays}–${maxSpanDays} days`;
        } else if (minSpanDays > 0) {
            text = `Pick a range of at least ${minSpanDays} day${minSpanDays === 1 ? '' : 's'}`;
        } else {
            text = `Pick a range of up to ${maxSpanDays} day${maxSpanDays === 1 ? '' : 's'}`;
        }
        return <div className="dtrp-hint">{text}</div>;
    }

    private renderTimes(): React.ReactNode {
        if (this.props.props.granularity === 'day') {
            return null;   // whole-day mode: no time-of-day selection
        }
        const { startTimeSec, endTimeSec, enabled } = this.props.props;
        const step = this.stepSeconds();
        return (
            <div className="dtrp-times">
                <label className="dtrp-time-field">
                    <span className="dtrp-time-label">Start time</span>
                    <input
                        type="time"
                        step={step}
                        disabled={!enabled}
                        value={this.timeInputValue(startTimeSec)}
                        onChange={this.onStartTime}
                    />
                </label>
                <label className="dtrp-time-field">
                    <span className="dtrp-time-label">End time</span>
                    <input
                        type="time"
                        step={step}
                        disabled={!enabled}
                        value={this.timeInputValue(endTimeSec)}
                        onChange={this.onEndTime}
                    />
                </label>
            </div>
        );
    }

    /** A single month: weekday header row + day grid. */
    private renderCalendar(monthStart: Date): React.ReactNode {
        const { firstDayMonday, locale } = this.props.props;
        return (
            <div className="dtrp-calendar">
                <div className="dtrp-weekdays">
                    {weekdayHeaders(firstDayMonday, locale).map((w) => (
                        <div key={`${fmtDate(monthStart)}-${w}`} className="dtrp-weekday">{w}</div>
                    ))}
                </div>
                <div className="dtrp-grid">
                    {this.renderGrid(monthStart)}
                </div>
            </div>
        );
    }

    /** Full calendar layout: one month, or two side by side when twoMonths. */
    private renderFull(twoMonths: boolean): React.ReactNode {
        const { enabled } = this.props.props;
        const m1 = startOfMonth(this.state.viewMonth);
        const m2 = addMonths(this.state.viewMonth, 1);
        return (
            <>
                {this.renderPresets()}
                {this.renderHint()}
                <div className="dtrp-header">
                    <button
                        type="button"
                        className="dtrp-nav"
                        onClick={this.prevMonth}
                        disabled={!enabled || !this.canPrev()}
                        aria-label="Previous month"
                    >
                        ‹
                    </button>
                    <div className="dtrp-months">
                        <span className="dtrp-month">{monthLabel(m1, this.props.props.locale)}</span>
                        {twoMonths && <span className="dtrp-month">{monthLabel(m2, this.props.props.locale)}</span>}
                    </div>
                    <button
                        type="button"
                        className="dtrp-nav"
                        onClick={this.nextMonth}
                        disabled={!enabled || !this.canNext()}
                        aria-label="Next month"
                    >
                        ›
                    </button>
                </div>

                <div className="dtrp-calendars" onMouseLeave={this.clearHover}>
                    {this.renderCalendar(m1)}
                    {twoMonths && this.renderCalendar(m2)}
                </div>

                {this.renderTimes()}
                {this.renderFooter()}
            </>
        );
    }

    /** Compact layout (used when too short for a usable calendar): two date+time fields. */
    private renderCompact(): React.ReactNode {
        const { startDate, endDate, minSpanDays, maxSpanDays, enabled } = this.props.props;
        const min = this.effMin();
        const max = this.effMax();
        const dmin = min ? fmtDate(min) : undefined;
        const dmax = max ? fmtDate(max) : undefined;

        // Constrain the end date by start + min/max-day span (within the date bounds).
        const startD = parseDate(startDate);
        let endMinD = min;
        let endMaxD = max;
        if (startD) {
            const lo = addDays(startD, minSpanDays > 0 ? minSpanDays : 0);
            endMinD = endMinD ? maxDate(endMinD, lo) : lo;
            if (maxSpanDays > 0) {
                const hi = addDays(startD, maxSpanDays);
                endMaxD = endMaxD ? minDate(endMaxD, hi) : hi;
            }
        }
        const endDmin = endMinD ? fmtDate(endMinD) : undefined;
        const endDmax = endMaxD ? fmtDate(endMaxD) : undefined;

        return (
            <>
                {this.renderPresets()}
                {this.renderHint()}
                <label className="dtrp-compact-field">
                    <span className="dtrp-compact-label">Start</span>
                    <input
                        type="date"
                        value={startDate}
                        min={dmin}
                        max={dmax}
                        disabled={!enabled}
                        onChange={this.onStartDateInput}
                    />
                </label>
                <label className="dtrp-compact-field">
                    <span className="dtrp-compact-label">End</span>
                    <input
                        type="date"
                        value={endDate}
                        min={endDmin}
                        max={endDmax}
                        disabled={!enabled}
                        onChange={this.onEndDateInput}
                    />
                </label>
                {this.renderTimes()}
                {this.renderFooter()}
            </>
        );
    }

    render() {
        const { emit } = this.props;
        const mode = this.resolveLayout();
        const classes = ['mustry-datetime-range-picker'];
        if (!this.props.props.enabled) {
            classes.push('is-disabled');
        }
        if (mode === 'compact') {
            classes.push('is-compact');
        }
        if (mode === 'twoMonths') {
            classes.push('is-two-months');
        }
        return (
            <div {...emit({ classes })}>
                {mode === 'compact' ? this.renderCompact() : this.renderFull(mode === 'twoMonths')}
            </div>
        );
    }
}

export class DateTimeRangePickerMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return DateTimeRangePicker;
    }

    getDefaultSize(): Size2d {
        return { width: 320, height: 380 };
    }

    getPropsReducer(tree: PropertyTree): DateTimeRangePickerProps {
        return {
            // Public prop paths are grouped (config.dateBounds.*, config.spanDays.*,
            // config.breakpoints.*); internal field names are kept flat for brevity.
            enabled: tree.readBoolean('config.enabled', true),
            showClear: tree.readBoolean('config.showClear', true),
            disableDates: tree.readString('config.disableDates', 'past') as DisableMode,
            earliestDate: tree.readString('config.dateBounds.earliest', ''),
            latestDate: tree.readString('config.dateBounds.latest', ''),
            minSpanDays: tree.readNumber('config.spanDays.min', 0),
            maxSpanDays: tree.readNumber('config.spanDays.max', 0),
            durationLabelThresholdHours: tree.readNumber('config.durationLabelThresholdHours', 24),
            granularity: tree.readString('config.granularity', 'second') as Granularity,
            firstDayMonday: tree.readBoolean('config.firstDayMonday', true),
            timezone: tree.readString('config.timezone', ''),
            locale: tree.readString('config.locale', ''),
            layout: tree.readString('config.layout', 'auto') as LayoutMode,
            compactBelowHeight: tree.readNumber('config.breakpoints.compactBelowHeight', 260),
            compactBelowWidth: tree.readNumber('config.breakpoints.compactBelowWidth', 240),
            twoMonthsAboveWidth: tree.readNumber('config.breakpoints.twoMonthsAboveWidth', 560),
            showPresets: tree.readBoolean('config.showPresets', true),
            presets: (tree.readArray('config.presets', []) || []).map((p: any) => ({
                label: String((p && p.label) || ''),
                amount: Number((p && p.amount) || 0),
                unit: ((p && p.unit) || 'days') as PresetUnit
            })),
            startDate: tree.readString('selection.startDate', ''),
            endDate: tree.readString('selection.endDate', ''),
            startTimeSec: tree.readNumber('selection.startTimeSec', 0),
            endTimeSec: tree.readNumber('selection.endTimeSec', 86399)
        };
    }
}
