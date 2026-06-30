// Pure mapping from the component's PropertyTree to typed CalendarProps. Extracted from
// CalendarMeta.getPropsReducer so it can be unit-tested without perspective-client.
import { PropReader } from './propReader';
import { CalendarProps, CalView, WeekStart, Category } from './calendar/types';

export function mapCalendarProps(tree: PropReader): CalendarProps {
    return {
        view: tree.readString('config.view', 'month') as CalView,
        showToolbar: tree.readBoolean('config.showToolbar', true),
        showMiniNav: tree.readBoolean('config.showMiniNav', true),
        showExport: tree.readBoolean('config.showExport', false),
        showLegend: tree.readBoolean('config.showLegend', true),
        categories: (tree.readArray('config.categories', []) || [])
            .map((c: any) => ({
                id: String((c && c.id) || ''),
                label: String((c && (c.label ?? c.id)) || ''),
                color: String((c && c.color) || ''),
                icon: c && c.icon ? String(c.icon) : undefined
            }))
            .filter((c: Category) => c.id),
        editable: tree.readBoolean('config.editable', false),
        selectable: tree.readBoolean('config.selectable', false),
        builtInEditor: tree.readBoolean('config.builtInEditor', false),
        weekStart: tree.readString('config.weekStart', 'monday') as WeekStart,
        locale: tree.readString('config.locale', ''),
        timezone: tree.readString('config.timezone', ''),
        showWeekends: tree.readBoolean('config.showWeekends', true),
        dayStartHour: tree.readNumber('config.dayStartHour', 0),
        dayEndHour: tree.readNumber('config.dayEndHour', 24),
        scrollToHour: tree.readNumber('config.scrollToHour', 7),
        scrollToNow: tree.readBoolean('config.scrollToNow', false),
        refreshSeconds: tree.readNumber('config.refreshSeconds', 0),
        events: (tree.readArray('data.events', []) || []).map((e: any) => ({
            id: String((e && e.id) || ''),
            title: String((e && e.title) || ''),
            start: String((e && e.start) || ''),
            end: e && e.end ? String(e.end) : undefined,
            allDay: !!(e && e.allDay),
            color: e && e.color ? String(e.color) : undefined,
            category: e && e.category ? String(e.category) : undefined,
            status: e && e.status ? String(e.status) : undefined,
            description: e && e.description ? String(e.description) : undefined,
            display: e && e.display ? String(e.display) : undefined,
            rrule: e && e.rrule && e.rrule.freq ? e.rrule : undefined
        }))
    };
}
