import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import {
    formatPattern,
    addDays,
    addMonths,
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
    sameDay,
    secondsOfDay,
    secToHms,
    startOfDay,
    startOfMonth,
    today,
    weekdayHeaders
} from './dateUtils';
import * as logic from './pickerLogic';
import {
    DisableMode,
    Granularity,
    LayoutMode,
    ResolvedLayout,
    PresetUnit,
    PresetType,
    PresetPeriod,
    PresetDef
} from './pickerLogic';

// Must match DateTimeRangePicker.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.datetimerangepicker';

type WeekStart = 'monday' | 'sunday';
type DisplayMode = 'inline' | 'popover';

interface LabelConfig {
    startTime: string;
    endTime: string;
    startDate: string;
    endDate: string;
    clear: string;
    selectRange: string;
    invalidRange: string;
    sameDay: string;
    previousMonth: string;
    nextMonth: string;
}

export interface DateTimeRangePickerProps {
    // configuration
    enabled: boolean;
    display: DisplayMode;
    popoverPlaceholder: string;
    popoverCloseOnSelect: boolean;
    popoverDateFormat: string;
    showClear: boolean;
    labels: LabelConfig;
    disableDates: DisableMode;
    earliestDate: string;
    latestDate: string;
    minSpanDays: number;
    maxSpanDays: number;
    durationLabelThresholdHours: number;
    granularity: Granularity;
    weekStart: WeekStart;
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
    open: boolean;            // popover panel open (display = 'popover')
    panelTop: number;
    panelLeft: number;
    panelWidth: number;
}

type DayState = 'empty' | 'disabled' | 'today' | 'default' | 'start' | 'end' | 'inrange' | 'single';

export class DateTimeRangePicker
    extends Component<ComponentProps<DateTimeRangePickerProps>, DateTimeRangePickerState> {

    // Signature of the last outputs we wrote, to avoid redundant prop writes / loops.
    private lastOutputSig = '';

    // Observes the rendered size so the layout can switch to a compact form when short.
    private resizeObserver: ResizeObserver | null = null;

    // Suppress the onRangeChanged event during the initial mount sync.
    private didMount = false;

    constructor(props: ComponentProps<DateTimeRangePickerProps>) {
        super(props);
        const start = parseDate(props.props.startDate);
        this.state = {
            viewMonth: startOfMonth(start || today()),
            anchor: null,
            hover: null,
            containerWidth: 99999,   // start in full mode until measured
            containerHeight: 99999,
            open: false,
            panelTop: 0,
            panelLeft: 0,
            panelWidth: 0
        };
    }

    private triggerEl: HTMLElement | null = null;
    private panelEl: HTMLElement | null = null;

    private setTriggerEl = (el: HTMLElement | null): void => {
        this.triggerEl = el;
    };

    private setPanelEl = (el: HTMLElement | null): void => {
        this.panelEl = el;
        if (el) {
            // Now mounted in the DOM: re-place using the panel's real measured height.
            this.adjustPanelPosition();
        }
    };

    componentDidMount(): void {
        this.syncOutputs();
        this.didMount = true;
        this.observeSize();
    }

    /** Fire a component event for authors' event scripts (suppressed at design time). */
    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    componentDidUpdate(): void {
        this.syncOutputs();
    }

    componentWillUnmount(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this.removeWindowListeners();
    }

    // --- popover ----------------------------------------------------------
    private addWindowListeners(): void {
        window.addEventListener('mousedown', this.onOutsidePointer, true);
        window.addEventListener('keydown', this.onKeyDown, true);
        window.addEventListener('resize', this.reposition, true);
        window.addEventListener('scroll', this.reposition, true);
    }

    private removeWindowListeners(): void {
        window.removeEventListener('mousedown', this.onOutsidePointer, true);
        window.removeEventListener('keydown', this.onKeyDown, true);
        window.removeEventListener('resize', this.reposition, true);
        window.removeEventListener('scroll', this.reposition, true);
    }

    private openPanel(): void {
        this.computeBasePosition();
        this.setState({ open: true });
        this.addWindowListeners();
    }

    private closePanel(): void {
        if (!this.state.open) {
            return;
        }
        this.removeWindowListeners();
        this.setState({ open: false });
    }

    private togglePanel = (): void => {
        if (!this.props.props.enabled) {
            return;
        }
        if (this.state.open) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    };

    private onOutsidePointer = (e: MouseEvent): void => {
        const target = e.target as Node;
        if ((this.panelEl && this.panelEl.contains(target))
            || (this.triggerEl && this.triggerEl.contains(target))) {
            return;
        }
        this.closePanel();
    };

    private onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.closePanel();
        }
    };

    private reposition = (): void => {
        if (this.state.open) {
            this.adjustPanelPosition();
        }
    };

    /** Panel width for the current layout, clamped to the viewport. */
    private panelWidth(): number {
        const desired = this.popoverLayout() === 'twoMonths' ? 600 : 300;
        return Math.min(desired, window.innerWidth - 16);
    }

    /** Provisional placement (below the trigger) before the panel has been measured. */
    private computeBasePosition(): void {
        const el = this.triggerEl;
        if (!el) {
            return;
        }
        const rect = el.getBoundingClientRect();
        const width = this.panelWidth();
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        this.setState({ panelTop: rect.bottom + 4, panelLeft: left, panelWidth: width });
    }

    /** Final placement using the panel's actual height: flip up if it would overflow. */
    private adjustPanelPosition(): void {
        const trigger = this.triggerEl;
        const panel = this.panelEl;
        if (!trigger || !panel) {
            return;
        }
        const rect = trigger.getBoundingClientRect();
        const h = panel.getBoundingClientRect().height;
        const gap = 4;
        const width = this.panelWidth();
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        let top = rect.bottom + gap;
        if (top + h > window.innerHeight && rect.top - gap - h >= 0) {
            top = rect.top - gap - h;   // flip above using the real height
        }
        // Only update on a real change, so the post-mount measure doesn't loop.
        if (top !== this.state.panelTop || left !== this.state.panelLeft || width !== this.state.panelWidth) {
            this.setState({ panelTop: top, panelLeft: left, panelWidth: width });
        }
    }

    /** Layout inside the popover panel (size-based 'auto' isn't measured here). */
    private popoverLayout(): ResolvedLayout {
        return this.props.props.layout === 'twoMonths' ? 'twoMonths' : 'oneMonth';
    }

    private maybeCloseAfterSelect(): void {
        if (this.props.props.display === 'popover' && this.props.props.popoverCloseOnSelect) {
            this.closePanel();
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
        return logic.effMin(this.props.props.disableDates, this.props.props.earliestDate);
    }

    private effMax(): Date | null {
        return logic.effMax(this.props.props.disableDates, this.props.props.latestDate);
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
            this.maybeCloseAfterSelect();
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

    /** Context for the pure preset helpers (single `now` per call). */
    private presetCtx(): logic.PresetContext {
        const p = this.props.props;
        return {
            now: new Date(),
            forward: p.disableDates === 'past',
            mondayFirst: p.weekStart === 'monday'
        };
    }

    // The (datetime) endpoints a preset would set. Direction follows the disableDates
    // mode — forward in 'past' (forward-booking) mode so the range lands on selectable
    // days, backward otherwise (the historical/historian case).
    private presetRange(p: PresetDef): { start: Date; end: Date } {
        return logic.presetRange(p, this.presetCtx());
    }

    /** Reason a preset's resulting range would be invalid (dateBounds / spanDays), '' if OK. */
    private presetConflict(p: PresetDef): string {
        const props = this.props.props;
        return logic.presetConflict(p, {
            ...this.presetCtx(),
            min: this.effMin(),
            max: this.effMax(),
            minSpanDays: props.minSpanDays,
            maxSpanDays: props.maxSpanDays
        });
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
        this.setState({ anchor: null, hover: null, viewMonth: startOfMonth(start) });
        this.fireEvent('onPresetSelected', {
            label: p.label, type: p.type, amount: p.amount, unit: p.unit, period: p.period
        });
        this.maybeCloseAfterSelect();
    };

    /** Adapt a rolling preset's label to its direction ("Last ..." -> "Next ..." forward). */
    private presetLabel(p: PresetDef): string {
        if (p.type === 'rolling' && this.props.props.disableDates === 'past') {
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
        const p = this.props.props;
        return logic.resolveLayout({
            layout: p.layout,
            width: this.state.containerWidth,
            height: this.state.containerHeight,
            compactBelowWidth: p.compactBelowWidth,
            compactBelowHeight: p.compactBelowHeight,
            twoMonthsAboveWidth: p.twoMonthsAboveWidth
        });
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
        return logic.stepSeconds(this.props.props.granularity);
    }

    /** Effective start/end time-of-day (seconds). In 'day' mode the range covers
     *  whole days: 00:00:00 to 23:59:59; otherwise the snapped selected times. */
    private effStartSec(): number {
        return logic.effStartSec(this.props.props.startTimeSec, this.props.props.granularity);
    }

    private effEndSec(): number {
        return logic.effEndSec(this.props.props.endTimeSec, this.props.props.granularity);
    }

    /** Snap seconds-since-midnight down to the chosen granularity. */
    private snapSec(sec: number): number {
        return logic.snapSec(sec, this.props.props.granularity);
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
    /** Compute the output values from the committed selection (single source of truth). */
    private computeOutputs(): logic.Outputs {
        const p = this.props.props;
        return logic.computeOutputs({
            startDate: p.startDate,
            endDate: p.endDate,
            startTimeSec: p.startTimeSec,
            endTimeSec: p.endTimeSec,
            granularity: p.granularity,
            timezone: p.timezone,
            minSpanDays: p.minSpanDays,
            maxSpanDays: p.maxSpanDays,
            durationLabelThresholdHours: p.durationLabelThresholdHours,
            sameDayLabel: p.labels.sameDay
        });
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
        if (this.didMount) {
            this.fireEvent('onRangeChanged', out);
        }
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

        if (lo && hi && sameDay(lo, hi) && sameDay(day, lo)) {
            return 'single';   // single day (committed same-day range, or anchor only)
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
        const { weekStart, enabled } = this.props.props;
        const offset = firstCellOffset(monthStart, weekStart === 'monday');
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
        const { enabled, showClear, labels } = this.props.props;
        const hasRange = !!parseDate(this.props.props.startDate) && !!parseDate(this.props.props.endDate);
        const out = this.computeOutputs();
        const label = !hasRange ? labels.selectRange : (out.isValid ? out.durationLabel : labels.invalidRange);
        return (
            <div className="dtrp-footer">
                <span className="dtrp-duration">{label}</span>
                {showClear && (
                    <button type="button" className="dtrp-clear" disabled={!enabled} onClick={this.clear}>
                        {labels.clear}
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
        const { startTimeSec, endTimeSec, enabled, labels } = this.props.props;
        const step = this.stepSeconds();
        return (
            <div className="dtrp-times">
                <label className="dtrp-time-field">
                    <span className="dtrp-time-label">{labels.startTime}</span>
                    <input
                        type="time"
                        step={step}
                        disabled={!enabled}
                        value={this.timeInputValue(startTimeSec)}
                        onChange={this.onStartTime}
                    />
                </label>
                <label className="dtrp-time-field">
                    <span className="dtrp-time-label">{labels.endTime}</span>
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
        const { weekStart, locale } = this.props.props;
        return (
            <div className="dtrp-calendar">
                <div className="dtrp-weekdays">
                    {weekdayHeaders(weekStart === 'monday', locale).map((w) => (
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
        const { enabled, labels } = this.props.props;
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
                        aria-label={labels.previousMonth}
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
                        aria-label={labels.nextMonth}
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
        const { startDate, endDate, minSpanDays, maxSpanDays, enabled, labels } = this.props.props;
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
                    <span className="dtrp-compact-label">{labels.startDate}</span>
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
                    <span className="dtrp-compact-label">{labels.endDate}</span>
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

    private surfaceClasses(mode: ResolvedLayout): string[] {
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
        return classes;
    }

    private renderBody(mode: ResolvedLayout): React.ReactNode {
        return mode === 'compact' ? this.renderCompact() : this.renderFull(mode === 'twoMonths');
    }

    /** The floating calendar panel for popover mode (portaled to escape clipping). */
    private renderPanel(): React.ReactNode {
        const mode = this.popoverLayout();
        const classes = [...this.surfaceClasses(mode), 'dtrp-popover-panel'];
        const style: React.CSSProperties = {
            top: this.state.panelTop,
            left: this.state.panelLeft,
            width: this.state.panelWidth
        };
        return (
            <div className={classes.join(' ')} style={style} ref={this.setPanelEl}>
                {this.renderBody(mode)}
            </div>
        );
    }

    private renderPopover(): React.ReactNode {
        const { enabled, startDate, endDate } = this.props.props;
        const open = this.state.open;
        const hasValue = !!parseDate(startDate) && !!parseDate(endDate);
        const rootClasses = ['mustry-dtrp-trigger-root'];
        if (!enabled) {
            rootClasses.push('is-disabled');
        }
        const triggerClasses = open ? 'dtrp-trigger dtrp-trigger--open' : 'dtrp-trigger';
        const textClasses = hasValue
            ? 'dtrp-trigger-text'
            : 'dtrp-trigger-text dtrp-trigger-text--placeholder';
        return (
            <div {...this.props.emit({ classes: rootClasses })}>
                <button
                    type="button"
                    className={triggerClasses}
                    ref={this.setTriggerEl}
                    disabled={!enabled}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    onClick={this.togglePanel}
                >
                    <svg
                        className="dtrp-trigger-icon"
                        width="16" height="16" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    >
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                    </svg>
                    <span className={textClasses}>{this.formatTrigger()}</span>
                    <svg
                        className="dtrp-trigger-caret"
                        width="13" height="13" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>
                {open && ReactDOM.createPortal(this.renderPanel(), document.body)}
            </div>
        );
    }

    /** Trigger text: the formatted range, or the placeholder when nothing is selected. */
    private formatTrigger(): string {
        const { startDate, endDate, granularity, popoverPlaceholder, popoverDateFormat } = this.props.props;
        const s = parseDate(startDate);
        const e = parseDate(endDate);
        if (!s || !e) {
            return popoverPlaceholder;
        }
        // Append the 24h time, trimmed to the granularity (hour shows :00 naturally).
        const timeSuffix = granularity === 'day' ? ''
            : granularity === 'second' ? ' HH:mm:ss'
                : ' HH:mm';
        const pattern = popoverDateFormat + timeSuffix;
        const fmt = (d: Date) => formatPattern(d, pattern);
        return `${fmt(combine(s, this.effStartSec()))} – ${fmt(combine(e, this.effEndSec()))}`;
    }

    render() {
        if (this.props.props.display === 'popover') {
            return this.renderPopover();
        }
        const mode = this.resolveLayout();
        return (
            <div {...this.props.emit({ classes: this.surfaceClasses(mode) })}>
                {this.renderBody(mode)}
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
            display: tree.readString('config.display', 'inline') as DisplayMode,
            popoverPlaceholder: tree.readString('config.popover.placeholder', 'Select dates'),
            popoverCloseOnSelect: tree.readBoolean('config.popover.closeOnSelect', true),
            popoverDateFormat: tree.readString('config.popover.dateFormat', 'DD/MM/YYYY'),
            showClear: tree.readBoolean('config.showClear', true),
            labels: {
                startTime: tree.readString('config.labels.startTime', 'Start time'),
                endTime: tree.readString('config.labels.endTime', 'End time'),
                startDate: tree.readString('config.labels.startDate', 'Start'),
                endDate: tree.readString('config.labels.endDate', 'End'),
                clear: tree.readString('config.labels.clear', 'Clear'),
                selectRange: tree.readString('config.labels.selectRange', 'Select a range'),
                invalidRange: tree.readString('config.labels.invalidRange', 'Invalid range'),
                sameDay: tree.readString('config.labels.sameDay', 'Same day'),
                previousMonth: tree.readString('config.labels.previousMonth', 'Previous month'),
                nextMonth: tree.readString('config.labels.nextMonth', 'Next month')
            },
            disableDates: tree.readString('config.disableDates', 'past') as DisableMode,
            earliestDate: tree.readString('config.dateBounds.earliest', ''),
            latestDate: tree.readString('config.dateBounds.latest', ''),
            minSpanDays: tree.readNumber('config.spanDays.min', 0),
            maxSpanDays: tree.readNumber('config.spanDays.max', 0),
            durationLabelThresholdHours: tree.readNumber('config.durationLabelThresholdHours', 24),
            granularity: tree.readString('config.granularity', 'second') as Granularity,
            weekStart: tree.readString('config.weekStart', 'monday') as WeekStart,
            timezone: tree.readString('config.timezone', ''),
            locale: tree.readString('config.locale', ''),
            layout: tree.readString('config.layout', 'auto') as LayoutMode,
            compactBelowHeight: tree.readNumber('config.breakpoints.compactBelowHeight', 260),
            compactBelowWidth: tree.readNumber('config.breakpoints.compactBelowWidth', 240),
            twoMonthsAboveWidth: tree.readNumber('config.breakpoints.twoMonthsAboveWidth', 560),
            showPresets: tree.readBoolean('config.showPresets', true),
            presets: (tree.readArray('config.presets', []) || []).map((p: any) => ({
                // Public item shape nests type-specific fields under rolling/calendar;
                // flatten here so the rest of the component stays simple.
                label: String((p && p.label) || ''),
                type: ((p && p.type) === 'calendar' ? 'calendar' : 'rolling') as PresetType,
                amount: Number((p && p.rolling && p.rolling.amount) || 0),
                unit: ((p && p.rolling && p.rolling.unit) || 'days') as PresetUnit,
                period: ((p && p.calendar && p.calendar.period) || 'thisMonth') as PresetPeriod
            })),
            startDate: tree.readString('selection.startDate', ''),
            endDate: tree.readString('selection.endDate', ''),
            startTimeSec: tree.readNumber('selection.startTimeSec', 0),
            endTimeSec: tree.readNumber('selection.endTimeSec', 86399)
        };
    }
}
