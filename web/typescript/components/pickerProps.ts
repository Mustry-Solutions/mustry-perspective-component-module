// Pure mapping from the component's PropertyTree to typed DateTimeRangePickerProps.
// Extracted from the picker's getPropsReducer so it can be unit-tested without
// perspective-client.
import { PropReader } from './propReader';
import { DateTimeRangePickerProps, DisplayMode, WeekStart } from './pickerTypes';
import { DisableMode, Granularity, LayoutMode, PresetType, PresetUnit, PresetPeriod } from './pickerLogic';

export function mapPickerProps(tree: PropReader): DateTimeRangePickerProps {
    return {
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
