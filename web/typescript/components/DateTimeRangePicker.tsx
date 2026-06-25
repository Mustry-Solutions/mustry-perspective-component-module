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
    fmtDateTime,
    hmsToSec,
    maxDate,
    minDate,
    monthLabel,
    parseDate,
    sameDay,
    secToHms,
    startOfDay,
    startOfMonth,
    today,
    weekdayHeaders
} from './dateUtils';

// Must match DateTimeRangePicker.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.datetimerangepicker';

type DisableMode = 'past' | 'future' | 'none';

export interface DateTimeRangePickerProps {
    // configuration
    disableDates: DisableMode;
    minDate: string;
    maxDate: string;
    shortSpanHours: number;
    timeStepSeconds: number;
    firstDayMonday: boolean;
    // selection (two-way)
    startDate: string;     // "YYYY-MM-DD" or ""
    endDate: string;       // "YYYY-MM-DD" or ""
    startTimeSec: number;  // 0..86399
    endTimeSec: number;    // 0..86399
}

interface DateTimeRangePickerState {
    viewMonth: Date;       // first day of the displayed month
    anchor: Date | null;   // first-clicked day of an in-progress range
    hover: Date | null;    // hovered day during preview
}

type DayState = 'empty' | 'disabled' | 'today' | 'default' | 'start' | 'end' | 'inrange';

export class DateTimeRangePicker
    extends Component<ComponentProps<DateTimeRangePickerProps>, DateTimeRangePickerState> {

    // Signature of the last outputs we wrote, to avoid redundant prop writes / loops.
    private lastOutputSig = '';

    constructor(props: ComponentProps<DateTimeRangePickerProps>) {
        super(props);
        const start = parseDate(props.props.startDate);
        this.state = {
            viewMonth: startOfMonth(start || today()),
            anchor: null,
            hover: null
        };
    }

    componentDidMount(): void {
        this.syncOutputs();
    }

    componentDidUpdate(): void {
        this.syncOutputs();
    }

    // --- bounds ----------------------------------------------------------
    private effMin(): Date | null {
        const { disableDates, minDate: min } = this.props.props;
        const parsed = parseDate(min);
        if (parsed) {
            return parsed;
        }
        return disableDates === 'past' ? today() : null;
    }

    private effMax(): Date | null {
        const { disableDates, maxDate: max } = this.props.props;
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

    // --- selection state machine ----------------------------------------
    private onDayClick = (day: Date): void => {
        if (this.isDisabled(day)) {
            return;
        }
        const start = parseDate(this.props.props.startDate);
        const end = parseDate(this.props.props.endDate);
        const write = this.props.store.props;

        if (start && end) {
            // Range complete -> start a new range anchored on this day.
            write.write('startDate', '');
            write.write('endDate', '');
            this.setState({ anchor: day, hover: null });
            return;
        }

        if (this.state.anchor) {
            // Second endpoint -> normalise so start <= end.
            const lo = minDate(this.state.anchor, day);
            const hi = maxDate(this.state.anchor, day);
            write.write('startDate', fmtDate(lo));
            write.write('endDate', fmtDate(hi));
            this.setState({ anchor: null, hover: null });
            return;
        }

        // Empty -> set the anchor (first click).
        this.setState({ anchor: day, hover: null });
    };

    private onDayHover = (day: Date): void => {
        if (this.state.anchor && !this.isDisabled(day)) {
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
        write.write('startDate', '');
        write.write('endDate', '');
        this.setState({ anchor: null, hover: null });
    };

    // --- month navigation ------------------------------------------------
    private canPrev(): boolean {
        const min = this.effMin();
        return !(min && startOfMonth(this.state.viewMonth).getTime() <= startOfMonth(min).getTime());
    }

    private canNext(): boolean {
        const max = this.effMax();
        return !(max && startOfMonth(this.state.viewMonth).getTime() >= startOfMonth(max).getTime());
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
    private onStartTime = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.store.props.write('startTimeSec', hmsToSec(e.target.value));
    };

    private onEndTime = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.store.props.write('endTimeSec', hmsToSec(e.target.value));
    };

    // --- outputs ---------------------------------------------------------
    private durationLabel(days: number, durationHours: number, valid: boolean): string {
        if (!valid) {
            return '';
        }
        const { shortSpanHours } = this.props.props;
        if (durationHours >= shortSpanHours) {
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

    /** Compute outputs from the committed selection and write any that changed. */
    private syncOutputs(): void {
        const { startTimeSec, endTimeSec } = this.props.props;
        const start = parseDate(this.props.props.startDate);
        const end = parseDate(this.props.props.endDate);

        let out = {
            startDateTime: '',
            endDateTime: '',
            days: 0,
            durationHours: 0,
            durationLabel: '',
            isValid: false
        };

        if (start && end) {
            const sdt = combine(start, clampSec(startTimeSec));
            const edt = combine(end, clampSec(endTimeSec));
            const valid = edt.getTime() > sdt.getTime();
            const days = daysBetween(start, end);
            const durationHours = Math.round(((edt.getTime() - sdt.getTime()) / 3600000) * 1000) / 1000;
            out = {
                startDateTime: fmtDateTime(sdt),
                endDateTime: fmtDateTime(edt),
                days,
                durationHours,
                durationLabel: this.durationLabel(days, durationHours, valid),
                isValid: valid
            };
        }

        const sig = JSON.stringify(out);
        if (sig === this.lastOutputSig) {
            return;
        }
        this.lastOutputSig = sig;
        const write = this.props.store.props;
        write.write('startDateTime', out.startDateTime);
        write.write('endDateTime', out.endDateTime);
        write.write('days', out.days);
        write.write('durationHours', out.durationHours);
        write.write('durationLabel', out.durationLabel);
        write.write('isValid', out.isValid);
    }

    // --- rendering -------------------------------------------------------
    private dayState(day: Date): DayState {
        if (this.isDisabled(day)) {
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

    private renderGrid(): React.ReactNode {
        const { firstDayMonday } = this.props.props;
        const monthStart = startOfMonth(this.state.viewMonth);
        const offset = firstCellOffset(monthStart, firstDayMonday);
        const count = daysInMonth(monthStart);

        const cells: React.ReactNode[] = [];
        for (let i = 0; i < offset; i++) {
            cells.push(<div key={`blank-${i}`} className="dtrp-cell dtrp-cell--empty" />);
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
                    disabled={disabled}
                    aria-disabled={disabled}
                    aria-label={fmtDate(day)}
                    onClick={() => this.onDayClick(day)}
                    onMouseEnter={() => this.onDayHover(day)}
                >
                    {d}
                </button>
            );
        }
        return cells;
    }

    render() {
        const { props, emit } = this.props;
        const { startDate, endDate, startTimeSec, endTimeSec, timeStepSeconds } = props;
        const hasRange = !!parseDate(startDate) && !!parseDate(endDate);
        const step = Math.max(1, Math.floor(timeStepSeconds || 1));

        return (
            <div {...emit({ classes: ['mustry-datetime-range-picker'] })}>
                <div className="dtrp-header">
                    <button
                        type="button"
                        className="dtrp-nav"
                        onClick={this.prevMonth}
                        disabled={!this.canPrev()}
                        aria-label="Previous month"
                    >
                        ‹
                    </button>
                    <span className="dtrp-month">{monthLabel(this.state.viewMonth)}</span>
                    <button
                        type="button"
                        className="dtrp-nav"
                        onClick={this.nextMonth}
                        disabled={!this.canNext()}
                        aria-label="Next month"
                    >
                        ›
                    </button>
                </div>

                <div className="dtrp-weekdays">
                    {weekdayHeaders(props.firstDayMonday).map((w) => (
                        <div key={w} className="dtrp-weekday">{w}</div>
                    ))}
                </div>

                <div className="dtrp-grid" onMouseLeave={this.clearHover}>
                    {this.renderGrid()}
                </div>

                <div className="dtrp-times">
                    <label className="dtrp-time-field">
                        <span className="dtrp-time-label">Start time</span>
                        <input
                            type="time"
                            step={step}
                            value={secToHms(startTimeSec)}
                            onChange={this.onStartTime}
                        />
                    </label>
                    <label className="dtrp-time-field">
                        <span className="dtrp-time-label">End time</span>
                        <input
                            type="time"
                            step={step}
                            value={secToHms(endTimeSec)}
                            onChange={this.onEndTime}
                        />
                    </label>
                </div>

                <div className="dtrp-footer">
                    <span className="dtrp-duration">
                        {hasRange ? this.durationLabel(
                            daysBetween(parseDate(startDate)!, parseDate(endDate)!),
                            (combine(parseDate(endDate)!, clampSec(endTimeSec)).getTime()
                                - combine(parseDate(startDate)!, clampSec(startTimeSec)).getTime()) / 3600000,
                            combine(parseDate(endDate)!, clampSec(endTimeSec)).getTime()
                                > combine(parseDate(startDate)!, clampSec(startTimeSec)).getTime()
                        ) : 'Select a range'}
                    </span>
                    <button type="button" className="dtrp-clear" onClick={this.clear}>
                        Clear
                    </button>
                </div>
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
            disableDates: tree.readString('disableDates', 'past') as DisableMode,
            minDate: tree.readString('minDate', ''),
            maxDate: tree.readString('maxDate', ''),
            shortSpanHours: tree.readNumber('shortSpanHours', 24),
            timeStepSeconds: tree.readNumber('timeStepSeconds', 1),
            firstDayMonday: tree.readBoolean('firstDayMonday', true),
            startDate: tree.readString('startDate', ''),
            endDate: tree.readString('endDate', ''),
            startTimeSec: tree.readNumber('startTimeSec', 0),
            endTimeSec: tree.readNumber('endTimeSec', 86399)
        };
    }
}
