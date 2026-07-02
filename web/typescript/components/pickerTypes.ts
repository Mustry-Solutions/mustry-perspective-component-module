// Type definitions for the DateTimeRangePicker, kept perspective-client-free so the
// prop mapper (pickerProps.ts) and its tests can run under plain node jest.
import { DisableMode, Granularity, LayoutMode, PresetDef, PresetUnit } from './pickerLogic';

export type WeekStart = 'monday' | 'sunday';
export type DisplayMode = 'inline' | 'popover';

export interface LabelConfig {
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
    // realtime (opt-in): rolling presets arm a live window that re-derives from "now"
    realtimeEnabled: boolean;
    realtimeRefreshSeconds: number;
    // selection (two-way)
    startDate: string;     // "YYYY-MM-DD" or ""
    endDate: string;       // "YYYY-MM-DD" or ""
    startTimeSec: number;  // 0..86399
    endTimeSec: number;    // 0..86399
    // the armed rolling window (two-way; 0 = not armed). Writable by authors so a
    // dashboard can open already-live without a user click.
    rollingAmount: number;
    rollingUnit: PresetUnit;
}
