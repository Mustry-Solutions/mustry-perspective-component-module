// Pure mapping from the component's PropertyTree to typed DateTimeRangePickerProps.
// Extracted from the picker's getPropsReducer so it can be unit-tested without
// perspective-client.
import { PropReader } from './propReader';
import { DateTimeRangePickerProps, DisplayMode, LabelConfig, WeekStart } from './pickerTypes';
import { DisableMode, Granularity, LayoutMode, PresetType, PresetUnit, PresetPeriod } from './pickerLogic';
import { pickerLabelBase } from './labelPacks';

export function mapPickerProps(tree: PropReader): DateTimeRangePickerProps {
    const locale = tree.readString('config.locale', '');
    // config.locale picks the built-in label language; config.labels.* overrides per key.
    const base = pickerLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof LabelConfig>).forEach((k) => {
        labels[k] = tree.readString(`config.labels.${k}`, base[k]);
    });
    return {
        enabled: tree.readBoolean('config.enabled', true),
        display: tree.readString('config.display', 'inline') as DisplayMode,
        popoverPlaceholder: tree.readString('config.popover.placeholder', 'Select dates'),
        popoverCloseOnSelect: tree.readBoolean('config.popover.closeOnSelect', true),
        popoverDateFormat: tree.readString('config.popover.dateFormat', 'DD/MM/YYYY'),
        showClear: tree.readBoolean('config.showClear', true),
        labels: labels as unknown as LabelConfig,
        disableDates: tree.readString('config.disableDates', 'past') as DisableMode,
        earliestDate: tree.readString('config.dateBounds.earliest', ''),
        latestDate: tree.readString('config.dateBounds.latest', ''),
        minSpanDays: tree.readNumber('config.spanDays.min', 0),
        maxSpanDays: tree.readNumber('config.spanDays.max', 0),
        durationLabelThresholdHours: tree.readNumber('config.durationLabelThresholdHours', 24),
        granularity: tree.readString('config.granularity', 'second') as Granularity,
        weekStart: tree.readString('config.weekStart', 'monday') as WeekStart,
        timezone: tree.readString('config.timezone', ''),
        locale,
        layout: tree.readString('config.layout', 'auto') as LayoutMode,
        compactBelowHeight: tree.readNumber('config.breakpoints.compactBelowHeight', 260),
        compactBelowWidth: tree.readNumber('config.breakpoints.compactBelowWidth', 240),
        twoMonthsAboveWidth: tree.readNumber('config.breakpoints.twoMonthsAboveWidth', 560),
        showPresets: tree.readBoolean('config.showPresets', true),
        presets: (tree.readArray('config.presets', []) || []).map((p: any) => ({
            label: String((p && p.label) || ''),
            type: ((p && p.type) === 'calendar' ? 'calendar' : 'rolling') as PresetType,
            amount: Number((p && p.rolling && p.rolling.amount) || 0),
            unit: ((p && p.rolling && p.rolling.unit) || 'days') as PresetUnit,
            period: ((p && p.calendar && p.calendar.period) || 'thisMonth') as PresetPeriod
        })),
        realtimeEnabled: tree.readBoolean('config.realtime.enabled', false),
        realtimeRefreshSeconds: Math.max(1, tree.readNumber('config.realtime.refreshSeconds', 300)),
        startDate: tree.readString('selection.startDate', ''),
        endDate: tree.readString('selection.endDate', ''),
        startTimeSec: tree.readNumber('selection.startTimeSec', 0),
        endTimeSec: tree.readNumber('selection.endTimeSec', 86399),
        rollingAmount: Math.max(0, tree.readNumber('selection.rollingAmount', 0)),
        rollingUnit: ((u) => (u === 'days' || u === 'weeks' || u === 'months' ? u : 'hours'))(tree.readString('selection.rollingUnit', 'hours')) as PresetUnit
    };
}
