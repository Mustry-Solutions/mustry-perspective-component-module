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
    fmtDate,
    hmsToSec,
    maxDate,
    minDate,
    parseDate,
    sameDay,
    secondsOfDay,
    secToHms,
    startOfDay,
    startOfMonth,
    today
} from '../../shared/dateUtils';
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
import { DateTimeRangePickerProps, DisplayMode, WeekStart } from './pickerTypes';
import { mapPickerProps } from './pickerProps';
import { DayState, PickerCalendarPane } from './PickerCalendarPane';
import { PickerPresets } from './PickerPresets';
import { PickerCompactFields, PickerFooter, PickerHint, PickerTimeFields } from './PickerInputs';
import { PickerTrigger } from './PickerTrigger';

// Must match DateTimeRangePicker.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.input.datetimerangepicker';

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

export class DateTimeRangePicker
    extends Component<ComponentProps<DateTimeRangePickerProps>, DateTimeRangePickerState> {

    // Signature of the last outputs we wrote, to avoid redundant prop writes / loops.
    private lastOutputSig = '';

    // Observes the rendered size so the layout can switch to a compact form when short.
    private resizeObserver: ResizeObserver | null = null;

    // Suppress the onRangeChanged event during the initial mount sync.
    private didMount = false;

    // Realtime mode: re-derives the armed rolling window from "now" on an interval.
    private realtimeTimer = 0;

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
            // Dialog semantics: move focus into the panel on open.
            this.focusIntoPanel();
        }
    };

    componentDidMount(): void {
        this.syncOutputs();
        this.didMount = true;
        this.observeSize();
        this.setupRealtimeTimer();
        if (this.realtimeArmed()) {
            this.tickRealtime();   // a pre-armed view opens already-live
        }
    }

    /** Fire a component event for authors' event scripts (suppressed at design time). */
    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    componentDidUpdate(prevProps: ComponentProps<DateTimeRangePickerProps>): void {
        this.syncOutputs();
        const was = logic.realtimeArmed(prevProps.props.realtimeEnabled, prevProps.props.rollingAmount);
        const armedChanged = was !== this.realtimeArmed()
            || prevProps.props.rollingAmount !== this.props.props.rollingAmount
            || prevProps.props.rollingUnit !== this.props.props.rollingUnit;
        if (armedChanged || prevProps.props.realtimeRefreshSeconds !== this.props.props.realtimeRefreshSeconds) {
            this.setupRealtimeTimer();
            if (this.realtimeArmed() && armedChanged) {
                this.tickRealtime();   // snap to the new window immediately (e.g. armed via a binding)
            }
        }
    }

    componentWillUnmount(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.realtimeTimer) {
            window.clearInterval(this.realtimeTimer);
        }
        this.removeWindowListeners();
    }

    // --- realtime (live rolling window) ------------------------------------
    /** Armed = config.realtime.enabled AND a rolling window is set (selection.rollingAmount > 0). */
    private realtimeArmed(): boolean {
        return logic.realtimeArmed(this.props.props.realtimeEnabled, this.props.props.rollingAmount);
    }

    private setupRealtimeTimer(): void {
        if (this.realtimeTimer) {
            window.clearInterval(this.realtimeTimer);
            this.realtimeTimer = 0;
        }
        if (this.realtimeArmed()) {
            this.realtimeTimer = window.setInterval(
                () => this.tickRealtime(),
                Math.max(1, this.props.props.realtimeRefreshSeconds) * 1000
            );
        }
    }

    /** Re-derive the armed rolling window from "now" and write it into the selection.
     *  Unchanged values are no-op writes, so outputs/onRangeChanged only fire on real change. */
    private tickRealtime(): void {
        if (!this.realtimeArmed() || this.state.anchor) {
            return;   // don't fight an in-progress manual pick
        }
        const p = this.props.props;
        const sel = logic.realtimeSelection(p.rollingAmount, p.rollingUnit, new Date(), p.disableDates === 'past');
        const w = this.props.store.props;
        w.write('selection.startDate', sel.startDate);
        w.write('selection.startTimeSec', sel.startTimeSec);
        w.write('selection.endDate', sel.endDate);
        w.write('selection.endTimeSec', sel.endTimeSec);
    }

    /** A manual selection takes over: stop the live window (keeps the current range). */
    private disarmRealtime(): void {
        if (this.props.props.rollingAmount > 0) {
            this.props.store.props.write('selection.rollingAmount', 0);
        }
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

    /** Close the panel. Focus returns to the trigger on every path except an
     *  outside click, where it must stay with the element the user clicked. */
    private closePanel(restoreFocus: boolean = true): void {
        if (!this.state.open) {
            return;
        }
        this.removeWindowListeners();
        this.setState({ open: false });
        if (restoreFocus && this.triggerEl) {
            this.triggerEl.focus();
        }
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
        this.closePanel(false);
    };

    private onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.closePanel();
        } else if (e.key === 'Tab') {
            this.trapTab(e);
        }
    };

    // --- popover focus management (dialog semantics) -----------------------
    /** The panel's focusable elements, queried live: its contents change with
     *  layout, presets and disabled days, so the list is never cached. */
    private panelFocusables(): HTMLElement[] {
        if (!this.panelEl) {
            return [];
        }
        const nodes = this.panelEl.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
            + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        return Array.prototype.slice.call(nodes);
    }

    /** On open: focus the first focusable element, or the panel itself (tabIndex -1). */
    private focusIntoPanel(): void {
        const items = this.panelFocusables();
        const target = items.length > 0 ? items[0] : this.panelEl;
        if (target) {
            target.focus();
        }
    }

    /** Keep Tab / Shift+Tab cycling within the open panel. */
    private trapTab(e: KeyboardEvent): void {
        if (!this.panelEl) {
            return;
        }
        const items = this.panelFocusables();
        if (items.length === 0) {
            e.preventDefault();   // nothing focusable: don't tab out of the dialog
            return;
        }
        const active = document.activeElement as HTMLElement | null;
        const to = logic.focusTrapTarget(items.length, active ? items.indexOf(active) : -1, e.shiftKey);
        if (to >= 0) {
            e.preventDefault();
            items[to].focus();
        }
    }

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
    private disabledReason = (day: Date): string => {
        const { labels } = this.props.props;
        const min = this.effMin();
        const max = this.effMax();
        if (min && day.getTime() < min.getTime()) {
            return logic.fillLabel(labels.beforeEarliest, { date: fmtDate(min) });
        }
        if (max && day.getTime() > max.getTime()) {
            return logic.fillLabel(labels.afterLatest, { date: fmtDate(max) });
        }
        const anchor = this.state.anchor;
        if (anchor) {
            const { minSpanDays, maxSpanDays } = this.props.props;
            const span = Math.abs(daysBetween(anchor, day));
            if (minSpanDays > 0 && span < minSpanDays) {
                return logic.fillLabel(labels.rangeAtLeast, { n: minSpanDays, days: logic.dayWord(minSpanDays, labels) });
            }
            if (maxSpanDays > 0 && span > maxSpanDays) {
                return logic.fillLabel(labels.rangeAtMost, { n: maxSpanDays, days: logic.dayWord(maxSpanDays, labels) });
            }
        }
        return '';
    }

    // --- selection state machine ----------------------------------------
    private onDayClick = (day: Date): void => {
        if (this.dayBlocked(day)) {
            return;
        }
        this.disarmRealtime();
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
        this.disarmRealtime();
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
    private presetConflict = (p: PresetDef): string => {
        const props = this.props.props;
        return logic.presetConflict(p, {
            ...this.presetCtx(),
            min: this.effMin(),
            max: this.effMax(),
            minSpanDays: props.minSpanDays,
            maxSpanDays: props.maxSpanDays,
            labels: props.labels
        });
    }

    // Apply a preset: set the selection to its range (no-op if it would conflict).
    // With config.realtime.enabled, a rolling preset also ARMS the live window
    // (selection.rollingAmount/rollingUnit); a calendar preset is one-shot and disarms.
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
        if (this.props.props.realtimeEnabled && p.type === 'rolling' && p.amount > 0) {
            w.write('selection.rollingAmount', p.amount);
            w.write('selection.rollingUnit', p.unit);
        } else {
            this.disarmRealtime();
        }
        this.setState({ anchor: null, hover: null, viewMonth: startOfMonth(start) });
        this.fireEvent('onPresetSelected', {
            label: p.label, type: p.type, amount: p.amount, unit: p.unit, period: p.period
        });
        this.maybeCloseAfterSelect();
    };

    /** Adapt a rolling preset's label to its direction ("Last ..." -> "Next ..." forward). */
    private presetLabel = (p: PresetDef): string => {
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
        this.disarmRealtime();
        this.props.store.props.write('selection.startTimeSec', this.snapSec(hmsToSec(e.target.value)));
    };

    private onEndTime = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.disarmRealtime();
        this.props.store.props.write('selection.endTimeSec', this.snapSec(hmsToSec(e.target.value)));
    };

    // Compact-mode date fields: write the date directly (already "YYYY-MM-DD").
    private onStartDateInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.disarmRealtime();
        this.props.store.props.write('selection.startDate', e.target.value);
    };

    private onEndDateInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.disarmRealtime();
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
            labels: p.labels
        });
    }

    /** Write any outputs that changed (de-duplicated to avoid render/write loops). */
    private syncOutputs(): void {
        const out = this.computeOutputs();
        const isRealtime = this.realtimeArmed();
        const sig = `${JSON.stringify(out)}|${isRealtime}`;
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
        write.write('output.isRealtime', isRealtime);
        if (this.didMount) {
            this.fireEvent('onRangeChanged', { ...out, isRealtime });
        }
    }

    // --- rendering -------------------------------------------------------
    private dayState = (day: Date): DayState => {
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

    /** Duration text + Clear, shared by the full and compact layouts. */
    private renderFooter(): React.ReactNode {
        const { enabled, showClear, labels } = this.props.props;
        const hasRange = !!parseDate(this.props.props.startDate) && !!parseDate(this.props.props.endDate);
        const out = this.computeOutputs();
        const label = !hasRange ? labels.selectRange : (out.isValid ? out.durationLabel : labels.invalidRange);
        return (
            <PickerFooter
                label={label}
                showClear={showClear}
                enabled={enabled}
                clearLabel={labels.clear}
                onClear={this.clear}
            />
        );
    }

    private renderPresets(): React.ReactNode {
        const p = this.props.props;
        if (!p.showPresets) {
            return null;
        }
        const armed = this.realtimeArmed();
        return (
            <PickerPresets
                presets={p.presets || []}
                enabled={p.enabled}
                isLive={(it) => armed && it.type === 'rolling'
                    && it.amount === p.rollingAmount && it.unit === p.rollingUnit}
                conflict={this.presetConflict}
                label={this.presetLabel}
                onApply={this.applyPreset}
            />
        );
    }

    private renderHint(): React.ReactNode {
        const { minSpanDays, maxSpanDays, labels } = this.props.props;
        return <PickerHint minSpanDays={minSpanDays} maxSpanDays={maxSpanDays} labels={labels} />;
    }

    private renderTimes(): React.ReactNode {
        if (this.props.props.granularity === 'day') {
            return null;   // whole-day mode: no time-of-day selection
        }
        const { startTimeSec, endTimeSec, enabled, labels } = this.props.props;
        return (
            <PickerTimeFields
                startValue={this.timeInputValue(startTimeSec)}
                endValue={this.timeInputValue(endTimeSec)}
                stepSeconds={this.stepSeconds()}
                enabled={enabled}
                labels={labels}
                onStartTime={this.onStartTime}
                onEndTime={this.onEndTime}
            />
        );
    }

    /** Full calendar layout: one month, or two side by side when twoMonths. */
    private renderFull(twoMonths: boolean): React.ReactNode {
        const p = this.props.props;
        return (
            <>
                {this.renderPresets()}
                {this.renderHint()}
                <PickerCalendarPane
                    viewMonth={this.state.viewMonth}
                    twoMonths={twoMonths}
                    weekStart={p.weekStart}
                    locale={p.locale}
                    enabled={p.enabled}
                    labels={p.labels}
                    canPrev={this.canPrev()}
                    canNext={this.canNext()}
                    onPrevMonth={this.prevMonth}
                    onNextMonth={this.nextMonth}
                    dayState={this.dayState}
                    disabledReason={this.disabledReason}
                    onDayClick={this.onDayClick}
                    onDayHover={this.onDayHover}
                    onCalendarsLeave={this.clearHover}
                />
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

        return (
            <>
                {this.renderPresets()}
                {this.renderHint()}
                <PickerCompactFields
                    startDate={startDate}
                    endDate={endDate}
                    startMin={min ? fmtDate(min) : undefined}
                    startMax={max ? fmtDate(max) : undefined}
                    endMin={endMinD ? fmtDate(endMinD) : undefined}
                    endMax={endMaxD ? fmtDate(endMaxD) : undefined}
                    enabled={enabled}
                    labels={labels}
                    onStartDate={this.onStartDateInput}
                    onEndDate={this.onEndDateInput}
                />
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
        const classes = [...this.surfaceClasses(mode), 'mustry-dtrp-popover-panel'];
        const style: React.CSSProperties = {
            top: this.state.panelTop,
            left: this.state.panelLeft,
            width: this.state.panelWidth
        };
        return (
            <div
                className={classes.join(' ')}
                style={style}
                ref={this.setPanelEl}
                role="dialog"
                aria-modal="true"
                aria-label={this.props.props.labels.dialogLabel}
                tabIndex={-1}
            >
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
        return (
            <div {...this.props.emit({ classes: rootClasses })}>
                <PickerTrigger
                    open={open}
                    enabled={enabled}
                    text={this.formatTrigger()}
                    isPlaceholder={!hasValue}
                    setTriggerEl={this.setTriggerEl}
                    onToggle={this.togglePanel}
                />
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
        // PComponent is typed over PlainObject props; getPropsReducer below is
        // what actually guarantees the shape this class receives.
        return DateTimeRangePicker as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 320, height: 380 };
    }

    getPropsReducer(tree: PropertyTree): DateTimeRangePickerProps {
        return mapPickerProps(tree);
    }
}
