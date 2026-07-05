// Pure logic for the timeline's built-in editor and gesture commits: editor
// construction and the save / delete / move / resize ChangeSpecs (what onChange
// should carry). DOM- and perspective-client-free, unit-tested under node jest.
//
// Recurring occurrences (id "base::date") edit like the calendar's: touching ONE
// occurrence detaches it into a standalone override (id "base-x-date") plus an
// EXDATE on the series; the editor's apply-to choice can target the whole series
// instead, which re-anchors on the base's date and keeps its rule.
import { msToZonedIso, msToWallInput, reanchorSeries, toEpochMs } from '../../shared/dateUtils';
import { TimelineEvent } from './timelineLogic';

/** Recurrence context of a mutation (same contract as the calendar's onChange). */
export interface TlChangeExtra {
    scope: 'series' | 'occurrence';
    seriesId: string;
    occurrenceDate?: string | null;
}

/** What a mutation should fire: the onChange action, payload, and its context. */
export interface TlChangeSpec {
    action: 'create' | 'edit' | 'delete' | 'move' | 'resize';
    event: object;
    fromResourceId?: string;   // set when a move crossed rows (reassign)
    extra?: TlChangeExtra;     // set when the mutation involves a recurring series
}

/** Lookup for the raw (unexpanded) base event of a series id in the bound data. */
export type TlBaseEventLookup = (id: string) => TimelineEvent | undefined;

/** The built-in editor's working state (times as zone-local datetime-local values). */
export interface TlEditor {
    id: string | null;   // null = creating a new event; set = editing an existing one
    resourceId: string;
    title: string;
    start: string;       // 'YYYY-MM-DDTHH:mm' in the display zone
    end: string;
    category: string;
    description: string;
    /** Fields the editor doesn't edit but the save payload must not drop
     *  (a verbatim write-back would otherwise strip them from the row). */
    carry: { color?: string; status?: string; display?: string; rrule?: object };
    // --- edit context for an occurrence of an existing series ---
    seriesId: string | null;       // base event id when editing a recurring occurrence (else null)
    occurrenceDate: string | null; // 'YYYY-MM-DD' of the opened occurrence
    scope: 'series' | 'occurrence';// apply-to choice (only meaningful when seriesId != null)
}

/** A fresh editor for a new bar on the given row/range. */
export function tlEditorForCreate(resourceId: string, startMs: number, endMs: number, timezone: string, defaultCategory: string): TlEditor {
    return {
        id: null, resourceId, title: '',
        start: msToWallInput(startMs, timezone),
        end: msToWallInput(endMs, timezone),
        category: defaultCategory, description: '', carry: {},
        seriesId: null, occurrenceDate: null, scope: 'series'
    };
}

/** An editor pre-filled from an existing bar (a missing/invalid end shows one
 *  hour). A recurring occurrence (id "base::date") recovers its series context
 *  and defaults the apply-to scope to "this event". */
export function tlEditorForEvent(ev: TimelineEvent, timezone: string): TlEditor {
    const startMs = toEpochMs(ev.start, timezone) ?? Date.now();
    let endMs = ev.end ? toEpochMs(ev.end, timezone) : null;
    if (endMs === null || endMs <= startMs) {
        endMs = startMs + 3600000;
    }
    const rawId = ev.id || '';
    const isOcc = rawId.indexOf('::') >= 0;
    return {
        id: rawId, resourceId: ev.resourceId, title: ev.title || '',
        start: msToWallInput(startMs, timezone),
        end: msToWallInput(endMs, timezone),
        category: ev.category || '', description: ev.description || '',
        carry: {
            ...(ev.color ? { color: ev.color } : {}),
            ...(ev.status ? { status: ev.status } : {}),
            ...(ev.display ? { display: ev.display } : {}),
            ...(ev.rrule ? { rrule: ev.rrule } : {})   // occurrences never carry one (expansion strips it)
        },
        seriesId: isOcc ? rawId.split('::')[0] : null,
        occurrenceDate: isOcc ? rawId.split('::')[1] : null,
        scope: isOcc ? 'occurrence' : 'series'
    };
}

/** Why the editor can't save, or null when it can: 'parse' = a time field doesn't
 *  parse; 'range' = end is not after start. */
export function tlEditorProblem(ed: TlEditor, timezone: string): 'parse' | 'range' | null {
    const s = toEpochMs(ed.start, timezone);
    const e = toEpochMs(ed.end, timezone);
    if (s === null || e === null) {
        return 'parse';
    }
    return e > s ? null : 'range';
}

/** The emitted form of an editor time field: offset-bearing ISO in the display zone. */
function emitWallInput(v: string, timezone: string): string {
    const ms = toEpochMs(v, timezone);
    return ms === null ? v : msToZonedIso(ms, timezone);
}

/**
 * Decide what saving the editor should fire:
 *  (1) one occurrence of a series -> a detached standalone override (the series gets
 *      an EXDATE from the write-back; the override must NOT carry the rule);
 *  (2) the whole series -> the base event, re-anchored on its own date, keeping
 *      the base's rule (the timeline editor doesn't edit rules);
 *  (3) a plain create / edit of a standalone bar.
 *  Carries the fields the editor doesn't edit (color/status/display) so a
 *  verbatim write-back never strips them.
 */
export function tlSaveSpec(
    ed: TlEditor,
    timezone: string,
    baseEventById: TlBaseEventLookup = () => undefined,
    newId: () => string = () => `evt-${new Date().getTime()}`
): TlChangeSpec {
    const common = {
        resourceId: ed.resourceId,
        title: ed.title || 'New event',
        category: ed.category,
        description: ed.description,
        ...ed.carry
    };

    if (ed.seriesId && ed.scope === 'occurrence') {
        return {
            action: 'edit',
            event: {
                id: `${ed.seriesId}-x-${ed.occurrenceDate}`,
                ...common,
                start: emitWallInput(ed.start, timezone),
                end: emitWallInput(ed.end, timezone)
            },
            extra: { scope: 'occurrence', seriesId: ed.seriesId, occurrenceDate: ed.occurrenceDate }
        };
    }

    if (ed.seriesId && ed.scope === 'series') {
        const base = baseEventById(ed.seriesId);
        return {
            action: 'edit',
            event: {
                id: ed.seriesId,
                ...common,
                start: emitWallInput(reanchorSeries(base && base.start, ed.start, false, timezone), timezone),
                end: emitWallInput(reanchorSeries(base && (base.end || base.start), ed.end, false, timezone), timezone),
                // The rule stays the base's (incl. its exdates); rules aren't edited here.
                rrule: (base && base.rrule) || null
            },
            extra: { scope: 'series', seriesId: ed.seriesId }
        };
    }

    const isEdit = ed.id !== null;
    return {
        action: isEdit ? 'edit' : 'create',
        event: {
            id: isEdit ? ed.id : newId(),
            ...common,
            start: emitWallInput(ed.start, timezone),
            end: emitWallInput(ed.end, timezone)
        }
    };
}

/** Decide what deleting from the editor should fire (null = nothing to delete). */
export function tlDeleteSpec(ed: TlEditor): TlChangeSpec | null {
    if (ed.id === null) {
        return null;
    }
    // One occurrence of a series -> EXDATE (and drop any override for that date).
    if (ed.seriesId && ed.scope === 'occurrence') {
        return {
            action: 'delete',
            event: { id: `${ed.seriesId}-x-${ed.occurrenceDate}`, resourceId: ed.resourceId, title: ed.title || '' },
            extra: { scope: 'occurrence', seriesId: ed.seriesId, occurrenceDate: ed.occurrenceDate }
        };
    }
    // Whole series.
    if (ed.seriesId && ed.scope === 'series') {
        return {
            action: 'delete',
            event: { id: ed.seriesId, resourceId: ed.resourceId, title: ed.title || '' },
            extra: { scope: 'series', seriesId: ed.seriesId }
        };
    }
    return { action: 'delete', event: { id: ed.id, resourceId: ed.resourceId, title: ed.title || '' } };
}

/** A complete event payload with epoch overrides applied — for move/resize commits.
 *  `over.resourceId` set to a different row adds the reassign context. Dragging a
 *  recurring occurrence (id "base::date") detaches it into a standalone override
 *  (id "base-x-date") + an EXDATE on the series, like the calendar. */
export function tlMoveResizeSpec(
    action: 'move' | 'resize',
    ev: TimelineEvent,
    over: { startMs?: number; endMs?: number; resourceId?: string },
    timezone: string
): TlChangeSpec {
    const resourceId = over.resourceId || ev.resourceId;
    const startMs = over.startMs ?? toEpochMs(ev.start, timezone);
    const endMs = over.endMs ?? (ev.end ? toEpochMs(ev.end, timezone) : null);
    const rawId = ev.id || '';
    const isOcc = rawId.indexOf('::') >= 0;
    const seriesId = isOcc ? rawId.split('::')[0] : '';
    const occurrenceDate = isOcc ? rawId.split('::')[1] : '';
    const spec: TlChangeSpec = {
        action,
        event: {
            id: isOcc ? `${seriesId}-x-${occurrenceDate}` : rawId,
            resourceId,
            title: ev.title || '',
            start: startMs !== null ? msToZonedIso(startMs, timezone) : ev.start,
            end: endMs !== null ? msToZonedIso(endMs, timezone) : '',
            color: ev.color || '',
            category: ev.category || '',
            description: ev.description || '',
            // Untouched-by-gestures fields ride along so verbatim write-backs keep them.
            ...(ev.status ? { status: ev.status } : {}),
            ...(ev.display ? { display: ev.display } : {})
        }
    };
    if (isOcc) {
        spec.extra = { scope: 'occurrence', seriesId, occurrenceDate };
    }
    if (resourceId !== ev.resourceId) {
        spec.fromResourceId = ev.resourceId;
    }
    return spec;
}
