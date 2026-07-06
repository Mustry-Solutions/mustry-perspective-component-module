// Pure, framework-free logic for the Date/Time Range Picker. Extracted from the
// component so the bug-prone parts (output contract, preset ranges, conflict and
// span checks, layout resolution) can be unit-tested without rendering or mocking
// Perspective. Everything here takes explicit inputs (including `now`/`today`) and
// returns plain values — no `this`, no I/O.

import {
    addDays, clampSec, combine, daysBetween, fmtDate, maxDate, minDate,
    parseDate, resolveZoned, secondsOfDay, startOfDay, startOfMonth, startOfWeek, today
} from '../shared/dateUtils';

export type DisableMode = 'past' | 'future' | 'none';
export type Granularity = 'day' | 'hour' | 'minute' | 'second';
export type LayoutMode = 'auto' | 'compact' | 'oneMonth' | 'twoMonths';
export type ResolvedLayout = 'compact' | 'oneMonth' | 'twoMonths';
export type PresetUnit = 'hours' | 'days' | 'weeks' | 'months';
export type PresetType = 'rolling' | 'calendar';
export type PresetPeriod =
    'today' | 'yesterday' | 'thisWeek' | 'lastWeek'
    | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear';

export interface PresetDef {
    label: string;
    type: PresetType;
    // rolling
    amount: number;
    unit: PresetUnit;
    // calendar
    period: PresetPeriod;
}

export interface DateRange {
    start: Date;
    end: Date;
}

// --- layout resolution ------------------------------------------------------

export interface LayoutInput {
    layout: LayoutMode;
    width: number;
    height: number;
    compactBelowWidth: number;
    compactBelowHeight: number;
    twoMonthsAboveWidth: number;
}

/** Resolve the effective layout: honour an explicit choice, else pick by size. */
export function resolveLayout(i: LayoutInput): ResolvedLayout {
    if (i.layout === 'compact' || i.layout === 'oneMonth' || i.layout === 'twoMonths') {
        return i.layout;
    }
    if (i.height < i.compactBelowHeight || i.width < i.compactBelowWidth) {
        return 'compact';
    }
    if (i.width >= i.twoMonthsAboveWidth) {
        return 'twoMonths';
    }
    return 'oneMonth';
}

// --- selectable bounds ------------------------------------------------------

/** Earliest selectable day: explicit bound, else today in forward-only ('past') mode. */
export function effMin(disableDates: DisableMode, earliestDate: string, todayDate: Date = today()): Date | null {
    const parsed = parseDate(earliestDate);
    if (parsed) {
        return parsed;
    }
    return disableDates === 'past' ? todayDate : null;
}

/** Latest selectable day: explicit bound, else today in backward-only ('future') mode. */
export function effMax(disableDates: DisableMode, latestDate: string, todayDate: Date = today()): Date | null {
    const parsed = parseDate(latestDate);
    if (parsed) {
        return parsed;
    }
    return disableDates === 'future' ? todayDate : null;
}

// --- preset ranges ----------------------------------------------------------

export interface PresetContext {
    now: Date;            // the "current" instant
    forward: boolean;     // rolling direction (disableDates === 'past')
    mondayFirst: boolean; // weekStart === 'monday'
}

/** Rolling preset: a window of amount*unit from `now`, in the given direction. */
export function rollingRange(amount: number, unit: PresetUnit, now: Date, forward: boolean): DateRange {
    const sign = forward ? 1 : -1;
    let other: Date;
    switch (unit) {
        case 'hours':
            other = new Date(now.getTime() + sign * amount * 3600000);
            break;
        case 'weeks':
            other = new Date(now.getTime() + sign * amount * 7 * 86400000);
            break;
        case 'months':
            other = new Date(
                now.getFullYear(), now.getMonth() + sign * amount, now.getDate(),
                now.getHours(), now.getMinutes(), now.getSeconds()
            );
            break;
        case 'days':
        default:
            other = new Date(now.getTime() + sign * amount * 86400000);
            break;
    }
    return { start: forward ? now : other, end: forward ? other : now };
}

/** Calendar preset: a period snapped to boundaries. 'this*' = period-to-date,
 *  'last*' = the full previous period. Week periods honour `mondayFirst`. */
export function calendarRange(period: PresetPeriod, now: Date, mondayFirst: boolean): DateRange {
    const todayStart = startOfDay(now);
    const endOfToday = combine(todayStart, 86399);

    switch (period) {
        case 'today':
            return { start: todayStart, end: endOfToday };
        case 'yesterday': {
            const y = addDays(todayStart, -1);
            return { start: y, end: combine(y, 86399) };
        }
        case 'thisWeek':
            return { start: startOfWeek(now, mondayFirst), end: endOfToday };
        case 'lastWeek': {
            const ws = startOfWeek(now, mondayFirst);
            return { start: addDays(ws, -7), end: combine(addDays(ws, -1), 86399) };
        }
        case 'thisMonth':
            return { start: startOfMonth(now), end: endOfToday };
        case 'lastMonth': {
            const lastEnd = addDays(startOfMonth(now), -1);
            return { start: startOfMonth(lastEnd), end: combine(lastEnd, 86399) };
        }
        case 'thisYear':
            return { start: new Date(now.getFullYear(), 0, 1), end: endOfToday };
        case 'lastYear':
        default: {
            const y = now.getFullYear() - 1;
            return { start: new Date(y, 0, 1), end: combine(new Date(y, 11, 31), 86399) };
        }
    }
}

/** The (datetime) endpoints a preset would set. */
export function presetRange(p: PresetDef, ctx: PresetContext): DateRange {
    if (p.type === 'calendar') {
        return calendarRange(p.period, ctx.now, ctx.mondayFirst);
    }
    return rollingRange(p.amount, p.unit, ctx.now, ctx.forward);
}

// --- realtime (live rolling window) ------------------------------------------

/** Whether the picker keeps the selection live: the opt-in flag is on AND a
 *  rolling window is armed (selection.rollingAmount > 0). */
export function realtimeArmed(realtimeEnabled: boolean, rollingAmount: number): boolean {
    return realtimeEnabled && rollingAmount > 0;
}

export interface RealtimeSelection {
    startDate: string;
    startTimeSec: number;
    endDate: string;
    endTimeSec: number;
}

/** One realtime tick: the selection writes for the armed rolling window re-derived
 *  from `now` (the alarm-journal-style "last N hours, live" behaviour). */
export function realtimeSelection(amount: number, unit: PresetUnit, now: Date, forward: boolean): RealtimeSelection {
    const { start, end } = rollingRange(amount, unit, now, forward);
    return {
        startDate: fmtDate(startOfDay(start)),
        startTimeSec: secondsOfDay(start),
        endDate: fmtDate(startOfDay(end)),
        endTimeSec: secondsOfDay(end)
    };
}

// --- label templates ----------------------------------------------------------

/** Fill a label template: '{n} {days}' + {n: 3, days: 'days'} -> '3 days'.
 *  Unknown placeholders are left untouched. */
export function fillLabel(tpl: string, vars: { [k: string]: string | number }): string {
    return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** The strings a day count formats with ('1 day' / '3 days', localized). */
export interface DayWordLabels {
    dayOne: string;    // 'day'
    dayMany: string;   // 'days'
}

/** The localized word for a day count. */
export function dayWord(n: number, labels: DayWordLabels): string {
    return n === 1 ? labels.dayOne : labels.dayMany;
}

// --- popover focus trap -------------------------------------------------------

/** One Tab step of a dialog focus trap. Given the number of focusable elements in
 *  the panel, the index of the currently focused one (-1 = focus is outside the
 *  panel) and the Tab direction, the index that should receive focus to stay
 *  inside — or -1 to let the browser move focus natively (an in-bounds step). */
export function focusTrapTarget(count: number, activeIndex: number, shiftKey: boolean): number {
    if (count <= 0) {
        return -1;   // nothing focusable; the caller keeps focus where it is
    }
    if (shiftKey) {
        // Backwards off the first element (or from outside) wraps to the last.
        return activeIndex <= 0 ? count - 1 : -1;
    }
    // Forwards off the last element (or from outside) wraps to the first.
    return activeIndex === count - 1 || activeIndex === -1 ? 0 : -1;
}

// --- preset conflict --------------------------------------------------------

export interface ConflictLabels {
    presetBeforeEarliest: string;  // 'Starts before the earliest selectable date ({date})'
    presetAfterLatest: string;     // 'Ends after the latest selectable date ({date})'
    presetTooShort: string;        // 'Shorter than the {n}-day minimum'
    presetTooLong: string;         // 'Exceeds the {n}-day maximum'
}

export interface ConflictContext extends PresetContext {
    min: Date | null;     // effMin
    max: Date | null;     // effMax
    minSpanDays: number;
    maxSpanDays: number;
    labels: ConflictLabels;
}

/** Reason a preset's resulting range would be invalid (dateBounds / spanDays), '' if OK. */
export function presetConflict(p: PresetDef, ctx: ConflictContext): string {
    const range = presetRange(p, ctx);
    const lo = startOfDay(minDate(range.start, range.end));
    const hi = startOfDay(maxDate(range.start, range.end));
    if (ctx.min && lo.getTime() < ctx.min.getTime()) {
        return fillLabel(ctx.labels.presetBeforeEarliest, { date: fmtDate(ctx.min) });
    }
    if (ctx.max && hi.getTime() > ctx.max.getTime()) {
        return fillLabel(ctx.labels.presetAfterLatest, { date: fmtDate(ctx.max) });
    }
    const span = daysBetween(lo, hi);
    if (ctx.minSpanDays > 0 && span < ctx.minSpanDays) {
        return fillLabel(ctx.labels.presetTooShort, { n: ctx.minSpanDays });
    }
    if (ctx.maxSpanDays > 0 && span > ctx.maxSpanDays) {
        return fillLabel(ctx.labels.presetTooLong, { n: ctx.maxSpanDays });
    }
    return '';
}

// --- time-of-day granularity ------------------------------------------------

export function stepSeconds(g: Granularity): number {
    switch (g) {
        case 'day': return 86400;
        case 'hour': return 3600;
        case 'minute': return 60;
        default: return 1;
    }
}

/** Snap seconds-since-midnight down to the chosen granularity. */
export function snapSec(sec: number, g: Granularity): number {
    return Math.floor(clampSec(sec) / stepSeconds(g)) * stepSeconds(g);
}

/** Effective start time-of-day: whole-day start (0) in 'day' mode, else snapped. */
export function effStartSec(startTimeSec: number, g: Granularity): number {
    return g === 'day' ? 0 : snapSec(startTimeSec, g);
}

/** Effective end time-of-day: whole-day end (23:59:59) in 'day' mode, else snapped. */
export function effEndSec(endTimeSec: number, g: Granularity): number {
    return g === 'day' ? 86399 : snapSec(endTimeSec, g);
}

// --- outputs ----------------------------------------------------------------

/** The strings the duration text formats with (all localized). */
export interface DurationLabels extends DayWordLabels {
    sameDay: string;        // 'Same day'
    durationDays: string;   // '{n} {days}'
}

export interface OutputsInput {
    startDate: string;
    endDate: string;
    startTimeSec: number;
    endTimeSec: number;
    granularity: Granularity;
    timezone: string;
    minSpanDays: number;
    maxSpanDays: number;
    durationLabelThresholdHours: number;
    labels: DurationLabels;
}

export interface Outputs {
    startDateTime: string;
    endDateTime: string;
    startEpochMs: number;
    endEpochMs: number;
    durationDays: number;
    durationHours: number;
    durationLabel: string;
    isValid: boolean;
}

/** Adaptive duration text: days, or 'Hh Mm' / 'Mm Ss' / 'Ss' below the threshold. */
export function durationLabel(
    days: number, durationHours: number, valid: boolean,
    g: Granularity, thresholdHours: number, labels: DurationLabels
): string {
    if (!valid) {
        return '';
    }
    const inDays = fillLabel(labels.durationDays, { n: days, days: dayWord(days, labels) });
    if (g === 'day') {
        return days === 0 ? labels.sameDay : inDays;
    }
    if (durationHours >= thresholdHours) {
        return inDays;
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
export function computeOutputs(i: OutputsInput): Outputs {
    const start = parseDate(i.startDate);
    const end = parseDate(i.endDate);
    const base: Outputs = {
        startDateTime: '', endDateTime: '', startEpochMs: 0, endEpochMs: 0,
        durationDays: 0, durationHours: 0, durationLabel: '', isValid: false
    };
    if (!start || !end) {
        return base;
    }
    // Resolve the picked wall-clock times into absolute instants in the configured
    // timezone (blank = browser-local): offset-bearing ISO + epoch milliseconds.
    const sZ = resolveZoned(combine(start, effStartSec(i.startTimeSec, i.granularity)), i.timezone);
    const eZ = resolveZoned(combine(end, effEndSec(i.endTimeSec, i.granularity)), i.timezone);
    const durationDays = daysBetween(start, end);
    let valid = eZ.epochMs > sZ.epochMs;
    if (i.minSpanDays > 0 && durationDays < i.minSpanDays) {
        valid = false;
    }
    if (i.maxSpanDays > 0 && durationDays > i.maxSpanDays) {
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
        durationLabel: durationLabel(
            durationDays, durationHours, valid, i.granularity, i.durationLabelThresholdHours, i.labels
        ),
        isValid: valid
    };
}
