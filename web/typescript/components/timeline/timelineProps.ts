// Pure mapping from the component's PropertyTree to typed TimelineProps. Kept
// perspective-client-free (PropReader) so it can be unit-tested under node jest.
import { PropReader } from '../../shared/propReader';
import { Category } from '../../shared/types';
import { EN_TIMELINE_LABELS, TimelineLabels, timelineLabelBase } from '../../shared/labelPacks';
import { TimelineEvent, TimelineResource, TimelineZoom } from './timelineLogic';

export type { TimelineEvent };

export interface TimelineProps {
    zoom: TimelineZoom;      // two-way: the toolbar writes the choice back
    showToolbar: boolean;
    showLegend: boolean;
    rowHeight: number;
    timezone: string;        // IANA zone for display (empty = browser-local)
    locale: string;
    refreshSeconds: number;  // periodic re-render so the now-line ticks (0 = off)
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
    return {
        zoom: ((z) => (z === 'hour' || z === 'week' ? z : 'day'))(tree.readString('config.zoom', 'day')) as TimelineZoom,
        showToolbar: tree.readBoolean('config.showToolbar', true),
        showLegend: tree.readBoolean('config.showLegend', true),
        rowHeight: ((h) => (Number.isFinite(h) ? Math.max(20, Math.min(120, h)) : 36))(tree.readNumber('config.rowHeight', 36)),
        timezone: tree.readString('config.timezone', ''),
        locale,
        refreshSeconds: tree.readNumber('config.refreshSeconds', 0),
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
