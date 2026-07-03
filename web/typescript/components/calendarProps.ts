// Pure mapping from the component's PropertyTree to typed CalendarProps. Extracted from
// CalendarMeta.getPropsReducer so it can be unit-tested without perspective-client.
import { PropReader } from '../shared/propReader';
import { CalendarProps, CalLabels, CalView, WeekStart, Category } from './calendar/types';
import { CalEvent } from './calendarLogic';
import { calendarLabelBase, EN_CALENDAR_LABELS } from '../shared/labelPacks';

/** The built-in English UI text; config.locale swaps the base language (labelPacks)
 *  and config.labels overrides individual keys. */
export const DEFAULT_LABELS: CalLabels = EN_CALENDAR_LABELS;

function mapLabels(tree: PropReader, locale: string): CalLabels {
    const base = calendarLabelBase(locale);
    const out = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof CalLabels>).forEach((k) => {
        // A value equal to the built-in English text counts as "unset": gateways
        // that ran an older module version can have the then-current schema
        // defaults materialized into the property tree, and those must not
        // shadow the locale pack. (To force English under another locale, use
        // any different wording or set config.locale = ''.)
        const v = tree.readString(`config.labels.${k}`, '');
        out[k] = v === '' || v === EN_CALENDAR_LABELS[k] ? base[k] : v;
    });
    return out as unknown as CalLabels;
}

function mapEvent(e: any): CalEvent {
    return {
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
    };
}

export function mapCalendarProps(tree: PropReader): CalendarProps {
    const locale = tree.readString('config.locale', '');
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
        emptyMessage: tree.readString('config.emptyMessage', 'No events'),
        loading: tree.readBoolean('config.loading', false),
        refetchDebounceMs: Math.max(0, tree.readNumber('config.refetchDebounceMs', 150)),
        editable: tree.readBoolean('config.editable', false),
        selectable: tree.readBoolean('config.selectable', false),
        builtInEditor: tree.readBoolean('config.builtInEditor', false),
        weekStart: tree.readString('config.weekStart', 'monday') as WeekStart,
        locale,
        timezone: tree.readString('config.timezone', ''),
        showWeekends: tree.readBoolean('config.showWeekends', true),
        dayStartHour: tree.readNumber('config.dayStartHour', 0),
        dayEndHour: tree.readNumber('config.dayEndHour', 24),
        slotMinutes: ((v) => (Number.isFinite(v) && v >= 5 && v <= 60 && 60 % v === 0 ? v : 60))(tree.readNumber('config.slotMinutes', 60)),
        scrollToHour: tree.readNumber('config.scrollToHour', 7),
        scrollToNow: tree.readBoolean('config.scrollToNow', false),
        refreshSeconds: tree.readNumber('config.refreshSeconds', 0),
        labels: mapLabels(tree, locale),
        events: (tree.readArray('data.events', []) || []).map(mapEvent),
        recurringEvents: (tree.readArray('data.recurringEvents', []) || []).map(mapEvent)
    };
}
