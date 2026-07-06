// Pure mapping from the component's PropertyTree to typed TimelineProps. Kept
// perspective-client-free (PropReader) so it can be unit-tested under node jest.
import { PropReader } from '../../shared/propReader';
import { Category } from '../../shared/types';
import { EN_TIMELINE_LABELS, TimelineLabels, timelineLabelBase } from '../../shared/labelPacks';
import { ShiftDef, parseShifts } from '../../shared/shifts';
import { TimelineEvent, TimelineResource, TimelineZoom } from './timelineLogic';

export type { TimelineEvent };

export interface TimelineProps {
    zoom: TimelineZoom;      // two-way (state.zoom): the toolbar writes the choice back
    showToolbar: boolean;
    showMiniNav: boolean;    // title opens the mini month navigator (false = plain title)
    showLegend: boolean;
    editable: boolean;       // drag to move/reassign, edge-resize, click-to-edit (with builtInEditor)
    selectable: boolean;     // drag empty track to create
    builtInEditor: boolean;  // built-in editor popover for create/edit/delete
    showExport: boolean;     // toolbar CSV-download button
    weekStart: 'monday' | 'sunday';   // for the mini month navigator
    shifts: ShiftDef[];               // enables the 'shift' zoom preset when non-empty
    snapMinutes: number;              // gesture snap override; 0 = each zoom preset's built-in
    collapsedGroups: string[];        // two-way (state.collapsedGroups): clicking a group header writes it back
    hiddenCategories: string[];       // two-way (state.hiddenCategories): the legend filter writes it back
    rowHeight: number;
    timezone: string;        // IANA zone for display (empty = browser-local)
    locale: string;
    refreshSeconds: number;  // periodic re-render so the now-line ticks (0 = off)
    followNow: boolean;      // two-way (state.followNow): the toolbar's Live toggle writes it back
    emptyMessage: string;    // toolbar badge when no events are configured ('' = hidden)
    loading: boolean;
    refetchDebounceMs: number;
    labels: TimelineLabels;
    categories: Category[];
    resources: TimelineResource[];
    events: TimelineEvent[];
    recurringEvents: TimelineEvent[];
}

function mapEvent(e: any): TimelineEvent {
    return {
        id: String((e && e.id) || ''),
        resourceId: String((e && e.resourceId) || ''),
        title: String((e && e.title) || ''),
        start: String((e && e.start) || ''),
        end: e && e.end ? String(e.end) : undefined,
        color: e && e.color ? String(e.color) : undefined,
        category: e && e.category ? String(e.category) : undefined,
        status: e && e.status ? String(e.status) : undefined,
        description: e && e.description ? String(e.description) : undefined,
        display: e && e.display ? String(e.display) : undefined,
        rrule: e && e.rrule && e.rrule.freq ? e.rrule : undefined
    };
}

export function mapTimelineProps(tree: PropReader): TimelineProps {
    const locale = tree.readString('config.locale', '');
    // config.locale picks the built-in label language; config.labels.* overrides per
    // key. A value equal to the built-in English text counts as "unset" (see the
    // calendar/picker mappers — materialized schema defaults must not shadow packs).
    const base = timelineLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof TimelineLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v === '' || v === EN_TIMELINE_LABELS[k] ? base[k] : v;
    });
    const shifts: ShiftDef[] = parseShifts(tree.readArray('config.shifts', []));
    return {
        // 'shift' is only meaningful when shifts are configured; else fall back to day.
        zoom: ((z) => (z === 'hour' || z === 'week' || (z === 'shift' && shifts.length) ? z : 'day'))(
            tree.readString('state.zoom', 'day')) as TimelineZoom,
        showToolbar: tree.readBoolean('config.showToolbar', true),
        showMiniNav: tree.readBoolean('config.showMiniNav', true),
        showLegend: tree.readBoolean('config.showLegend', true),
        editable: tree.readBoolean('config.editable', false),
        selectable: tree.readBoolean('config.selectable', false),
        builtInEditor: tree.readBoolean('config.builtInEditor', false),
        showExport: tree.readBoolean('config.showExport', false),
        weekStart: (tree.readString('config.weekStart', 'monday') === 'sunday' ? 'sunday' : 'monday'),
        shifts,
        // 0 = keep each zoom preset's built-in snap; anything non-finite/non-positive -> 0.
        snapMinutes: ((n) => (Number.isFinite(n) && n > 0 ? n : 0))(tree.readNumber('config.snapMinutes', 0)),
        collapsedGroups: (tree.readArray('state.collapsedGroups', []) || []).map((g: any) => String(g)).filter((g: string) => g),
        hiddenCategories: (tree.readArray('state.hiddenCategories', []) || []).map((c: any) => String(c)).filter((c: string) => c),
        rowHeight: ((h) => (Number.isFinite(h) ? Math.max(20, Math.min(120, h)) : 36))(tree.readNumber('config.rowHeight', 36)),
        timezone: tree.readString('config.timezone', ''),
        locale,
        refreshSeconds: tree.readNumber('config.refreshSeconds', 0),
        followNow: tree.readBoolean('state.followNow', false),
        emptyMessage: tree.readString('config.emptyMessage', 'No events'),
        loading: tree.readBoolean('config.loading', false),
        refetchDebounceMs: Math.max(0, tree.readNumber('config.refetchDebounceMs', 150)),
        labels: labels as unknown as TimelineLabels,
        categories: (tree.readArray('config.categories', []) || [])
            .map((c: any) => ({
                id: String((c && c.id) || ''),
                label: String((c && (c.label ?? c.id)) || ''),
                color: String((c && c.color) || ''),
                icon: c && c.icon ? String(c.icon) : undefined
            }))
            .filter((c: Category) => c.id),
        resources: (tree.readArray('config.resources', []) || [])
            .map((r: any) => ({
                id: String((r && r.id) || ''),
                label: String((r && (r.label ?? r.id)) || ''),
                group: r && r.group ? String(r.group) : undefined,
                color: r && r.color ? String(r.color) : undefined,
                icon: r && r.icon ? String(r.icon) : undefined
            }))
            .filter((r: TimelineResource) => r.id),
        events: (tree.readArray('data.events', []) || []).map(mapEvent),
        recurringEvents: (tree.readArray('data.recurringEvents', []) || []).map(mapEvent)
    };
}
