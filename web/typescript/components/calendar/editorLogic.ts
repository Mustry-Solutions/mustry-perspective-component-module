// Pure logic for the built-in event editor and the gesture commits: constructing
// an editor from an event, the recurrence rule round-trip, and the save / delete /
// move / resize decisions (what onChange should carry). Kept perspective-client-
// and DOM-free so it can be unit-tested under node jest; the component fires the
// returned ChangeSpec and closes the editor.
import { CalEvent, RRule } from '../calendarLogic';
import { emitWall, instantToZonedIso } from '../dateUtils';
import { Editor } from './types';

/** What a mutation should fire: the onChange action, payload, and recurrence context. */
export interface ChangeSpec {
    action: 'create' | 'edit' | 'delete' | 'move' | 'resize';
    event: object;
    extra?: { scope?: 'series' | 'occurrence'; seriesId?: string; occurrenceDate?: string | null };
}

/** Lookup for the raw (unexpanded) base event of a series id in the bound data. */
export type BaseEventLookup = (id: string) => CalEvent | undefined;

/** Default recurrence + edit-context fields for a fresh editor (no repeat, no series). */
export function editorDefaults(): Pick<Editor,
    'repeatFreq' | 'repeatInterval' | 'repeatByweekday' | 'repeatEndMode' | 'repeatUntil' | 'repeatCount' |
    'seriesId' | 'occurrenceDate' | 'scope'> {
    return {
        repeatFreq: '', repeatInterval: 1, repeatByweekday: [], repeatEndMode: 'never', repeatUntil: '', repeatCount: 10,
        seriesId: null, occurrenceDate: null, scope: 'series'
    };
}

/** A fresh editor for a new event on the given range. */
export function editorForCreate(startIso: string, endIso: string, allDay: boolean, defaultCategory: string): Editor {
    const start = allDay ? startIso.slice(0, 10) : startIso.slice(0, 16);
    const end = allDay ? (endIso || startIso).slice(0, 10) : endIso.slice(0, 16);
    return { id: null, title: '', start, end, allDay, category: defaultCategory, description: '', ...editorDefaults() };
}

/** An editor pre-filled from an existing event, to edit it in place. For a recurring
 *  occurrence (id "base::date") it recovers the series' rule and defaults the
 *  apply-to scope to "this event". */
export function editorForEvent(ev: CalEvent, baseEventById: BaseEventLookup): Editor {
    const allDay = !!ev.allDay;
    const cut = (v: string | undefined) => (v || '').slice(0, allDay ? 10 : 16);
    const rawId = ev.id || '';
    const isOcc = rawId.indexOf('::') >= 0;
    const seriesId = isOcc ? rawId.split('::')[0] : null;
    const occurrenceDate = isOcc ? rawId.split('::')[1] : null;
    const rr = seriesId ? (baseEventById(seriesId) || {} as CalEvent).rrule : undefined;
    return {
        id: rawId,
        title: ev.title || '',
        start: cut(ev.start),
        end: cut(ev.end || ev.start),
        allDay,
        category: ev.category || '',
        description: ev.description || '',
        repeatFreq: rr ? rr.freq : '',
        repeatInterval: rr && rr.interval ? rr.interval : 1,
        repeatByweekday: rr && rr.byweekday ? rr.byweekday.slice() : [],
        repeatEndMode: rr ? (rr.until ? 'until' : (rr.count ? 'count' : 'never')) : 'never',
        repeatUntil: rr && rr.until ? rr.until : '',
        repeatCount: rr && rr.count ? rr.count : 10,
        seriesId,
        occurrenceDate,
        scope: isOcc ? 'occurrence' : 'series'
    };
}

/** The editor patch for flipping the all-day toggle: trim to dates, or restore
 *  default working-hour times where the value has none. */
export function toggleAllDayPatch(ed: Editor, allDay: boolean): Partial<Editor> {
    if (allDay) {
        return { allDay: true, start: ed.start.slice(0, 10), end: ed.end.slice(0, 10) };
    }
    return {
        allDay: false,
        start: ed.start.length >= 16 ? ed.start : `${ed.start.slice(0, 10)}T09:00`,
        end: ed.end.length >= 16 ? ed.end : `${ed.end.slice(0, 10)}T10:00`
    };
}

/** Build an RRule from the editor's repeat fields (undefined = does not repeat).
 *  Preserves an existing series' exdate list when re-saving the whole series. */
export function buildRRule(ed: Editor, baseEventById: BaseEventLookup): RRule | undefined {
    if (!ed.repeatFreq) {
        return undefined;
    }
    const rr: RRule = { freq: ed.repeatFreq };
    if (ed.repeatInterval > 1) {
        rr.interval = ed.repeatInterval;
    }
    if (ed.repeatFreq === 'weekly' && ed.repeatByweekday.length) {
        rr.byweekday = ed.repeatByweekday.slice().sort((a, b) => a - b);
    }
    if (ed.repeatEndMode === 'until' && ed.repeatUntil) {
        rr.until = ed.repeatUntil;
    } else if (ed.repeatEndMode === 'count' && ed.repeatCount > 0) {
        rr.count = ed.repeatCount;
    }
    const base = ed.seriesId ? baseEventById(ed.seriesId) : undefined;
    if (base && base.rrule && base.rrule.exdate && base.rrule.exdate.length) {
        rr.exdate = base.rrule.exdate.slice();   // keep prior exceptions across a series edit
    }
    return rr;
}

/** Keep a series anchored on the base's (zone-local) date while applying an edited time. */
export function reanchorSeries(baseRaw: string | undefined, editedWall: string, allDay: boolean, timezone: string): string {
    const baseDate = instantToZonedIso(baseRaw || '', timezone).slice(0, 10);
    if (allDay) {
        return baseDate;
    }
    return baseDate + (editedWall.length >= 11 ? editedWall.slice(10) : 'T00:00:00');
}

/**
 * Decide what saving the editor should fire:
 *  (1) one occurrence of a series -> a detached standalone override (the series gets an EXDATE);
 *  (2) the whole series -> the base event, re-anchored, with the (possibly removed) rule;
 *  (3) a plain create / edit of a standalone event.
 */
export function editorSaveSpec(
    ed: Editor,
    timezone: string,
    baseEventById: BaseEventLookup,
    newId: () => string = () => `evt-${new Date().getTime()}`
): ChangeSpec {
    const norm = (v: string) => (ed.allDay ? v.slice(0, 10) : (v.length === 16 ? `${v}:00` : v));
    const common = { title: ed.title || 'New event', allDay: ed.allDay, category: ed.category, description: ed.description };

    if (ed.seriesId && ed.scope === 'occurrence') {
        return {
            action: 'edit',
            event: {
                id: `${ed.seriesId}-x-${ed.occurrenceDate}`,
                ...common,
                start: emitWall(norm(ed.start), ed.allDay, timezone),
                end: emitWall(norm(ed.end), ed.allDay, timezone)
            },
            extra: { scope: 'occurrence', seriesId: ed.seriesId, occurrenceDate: ed.occurrenceDate }
        };
    }

    const rr = buildRRule(ed, baseEventById);

    if (ed.seriesId && ed.scope === 'series') {
        const base = baseEventById(ed.seriesId);
        return {
            action: 'edit',
            event: {
                id: ed.seriesId,
                ...common,
                start: emitWall(reanchorSeries(base && base.start, norm(ed.start), ed.allDay, timezone), ed.allDay, timezone),
                end: emitWall(reanchorSeries(base && (base.end || base.start), norm(ed.end), ed.allDay, timezone), ed.allDay, timezone),
                rrule: rr || null   // null = recurrence removed from the series
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
            start: emitWall(norm(ed.start), ed.allDay, timezone),
            end: emitWall(norm(ed.end), ed.allDay, timezone),
            rrule: rr || null
        }
    };
}

/** Decide what deleting from the editor should fire (null = nothing to delete). */
export function editorDeleteSpec(ed: Editor): ChangeSpec | null {
    if (ed.id === null) {
        return null;
    }
    // One occurrence of a series -> EXDATE (and drop any override for that date).
    if (ed.seriesId && ed.scope === 'occurrence') {
        return {
            action: 'delete',
            event: { id: `${ed.seriesId}-x-${ed.occurrenceDate}` },
            extra: { scope: 'occurrence', seriesId: ed.seriesId, occurrenceDate: ed.occurrenceDate }
        };
    }
    // Whole series.
    if (ed.seriesId && ed.scope === 'series') {
        return { action: 'delete', event: { id: ed.seriesId }, extra: { scope: 'series', seriesId: ed.seriesId } };
    }
    // Plain standalone delete.
    return { action: 'delete', event: { id: ed.id, title: ed.title || '' } };
}

/** A complete event object (incl. category/notes, raw colour) with start/end overrides applied — for onChange. */
function changedEvent(ev: CalEvent, over: { start?: string; end?: string }, timezone: string): object {
    const allDay = !!ev.allDay;
    return {
        id: ev.id || '',
        title: ev.title || '',
        start: emitWall(over.start ?? ev.start ?? '', allDay, timezone),
        end: emitWall(over.end ?? ev.end ?? '', allDay, timezone),
        allDay,
        color: ev.color || '',         // raw override only (empty when category-coloured)
        category: ev.category || '',
        description: ev.description || ''
    };
}

/** What a committed move/resize should fire. Dragging a single recurring occurrence
 *  (id "base::date") detaches it into a standalone override + an EXDATE on the series. */
export function moveResizeSpec(
    action: 'move' | 'resize',
    ev: CalEvent,
    over: { start?: string; end?: string },
    timezone: string
): ChangeSpec {
    const rawId = ev.id || '';
    if (rawId.indexOf('::') >= 0) {
        const seriesId = rawId.split('::')[0];
        const occurrenceDate = rawId.split('::')[1];
        return {
            action,
            event: changedEvent({ ...ev, id: `${seriesId}-x-${occurrenceDate}` }, over, timezone),
            extra: { scope: 'occurrence', seriesId, occurrenceDate }
        };
    }
    return { action, event: changedEvent(ev, over, timezone) };
}
