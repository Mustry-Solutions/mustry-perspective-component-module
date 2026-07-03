// Pure logic for the timeline's built-in editor and gesture commits: editor
// construction and the save / delete / move / resize ChangeSpecs (what onChange
// should carry). DOM- and perspective-client-free, unit-tested under node jest.
//
// V1 recurrence is display-only: occurrences (id "base::date") are not editable
// or draggable here — the component routes their clicks to onEventClick instead.
import { msToZonedIso, msToWallInput, toEpochMs } from '../../shared/dateUtils';
import { TimelineEvent } from './timelineLogic';

/** What a mutation should fire: the onChange action, payload, and reassign context. */
export interface TlChangeSpec {
    action: 'create' | 'edit' | 'delete' | 'move' | 'resize';
    event: object;
    fromResourceId?: string;   // set when a move crossed rows (reassign)
}

/** The built-in editor's working state (times as zone-local datetime-local values). */
export interface TlEditor {
    id: string | null;   // null = creating a new event; set = editing an existing one
    resourceId: string;
    title: string;
    start: string;       // 'YYYY-MM-DDTHH:mm' in the display zone
    end: string;
    category: string;
    description: string;
}

/** A fresh editor for a new bar on the given row/range. */
export function tlEditorForCreate(resourceId: string, startMs: number, endMs: number, timezone: string, defaultCategory: string): TlEditor {
    return {
        id: null, resourceId, title: '',
        start: msToWallInput(startMs, timezone),
        end: msToWallInput(endMs, timezone),
        category: defaultCategory, description: ''
    };
}

/** An editor pre-filled from an existing bar (a missing/invalid end shows one hour). */
export function tlEditorForEvent(ev: TimelineEvent, timezone: string): TlEditor {
    const startMs = toEpochMs(ev.start, timezone) ?? Date.now();
    let endMs = ev.end ? toEpochMs(ev.end, timezone) : null;
    if (endMs === null || endMs <= startMs) {
        endMs = startMs + 3600000;
    }
    return {
        id: ev.id || '', resourceId: ev.resourceId, title: ev.title || '',
        start: msToWallInput(startMs, timezone),
        end: msToWallInput(endMs, timezone),
        category: ev.category || '', description: ev.description || ''
    };
}

/** The emitted form of an editor time field: offset-bearing ISO in the display zone. */
function emitWallInput(v: string, timezone: string): string {
    const ms = toEpochMs(v, timezone);
    return ms === null ? v : msToZonedIso(ms, timezone);
}

/** Decide what saving the editor should fire (create or edit of a standalone bar). */
export function tlSaveSpec(ed: TlEditor, timezone: string, newId: () => string = () => `evt-${new Date().getTime()}`): TlChangeSpec {
    const isEdit = ed.id !== null;
    return {
        action: isEdit ? 'edit' : 'create',
        event: {
            id: isEdit ? ed.id : newId(),
            resourceId: ed.resourceId,
            title: ed.title || 'New event',
            start: emitWallInput(ed.start, timezone),
            end: emitWallInput(ed.end, timezone),
            category: ed.category,
            description: ed.description
        }
    };
}

/** Decide what deleting from the editor should fire (null = nothing to delete). */
export function tlDeleteSpec(ed: TlEditor): TlChangeSpec | null {
    if (ed.id === null) {
        return null;
    }
    return { action: 'delete', event: { id: ed.id, resourceId: ed.resourceId, title: ed.title || '' } };
}

/** A complete event payload with epoch overrides applied — for move/resize commits.
 *  `over.resourceId` set to a different row adds the reassign context. */
export function tlMoveResizeSpec(
    action: 'move' | 'resize',
    ev: TimelineEvent,
    over: { startMs?: number; endMs?: number; resourceId?: string },
    timezone: string
): TlChangeSpec {
    const resourceId = over.resourceId || ev.resourceId;
    const startMs = over.startMs ?? toEpochMs(ev.start, timezone);
    const endMs = over.endMs ?? (ev.end ? toEpochMs(ev.end, timezone) : null);
    const spec: TlChangeSpec = {
        action,
        event: {
            id: ev.id || '',
            resourceId,
            title: ev.title || '',
            start: startMs !== null ? msToZonedIso(startMs, timezone) : ev.start,
            end: endMs !== null ? msToZonedIso(endMs, timezone) : '',
            color: ev.color || '',
            category: ev.category || '',
            description: ev.description || ''
        }
    };
    if (resourceId !== ev.resourceId) {
        spec.fromResourceId = ev.resourceId;
    }
    return spec;
}
