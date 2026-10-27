// Pure logic for the timeline's drag gesture state machine — epoch-space preview
// geometry, row hit-testing and the commit decision. DOM-free so it can be
// unit-tested under node jest; the controller measures the DOM, calls these, and
// applies setState / fires events (same split as the calendar's calendarGestureLogic).

import { MS_PER_DAY, zoneWallClock } from '../../shared/dateUtils';
import { MIN_SNAP_MINUTES } from './timelineLogic';

export type TlGestureMode = 'move' | 'resize-start' | 'resize-end' | 'create';

export const MS_PER_MIN = 60000;

/** The snap step in whole ms. Snaps may be fractional minutes at the sub-hour
 *  zoom presets (0.25 = 15 s, 0.1/60 = 100 ms) down to MIN_SNAP_MINUTES, and the
 *  product is rounded so a 1/60-minute step is exactly 1000 ms. */
export function snapStepMs(snapMinutes: number): number {
    return Math.round(Math.max(MIN_SNAP_MINUTES, snapMinutes) * MS_PER_MIN);
}

/** The zone wall clock of an instant as a fake UTC epoch (Date.UTC of its wall
 *  fields, ms kept). In this space every day is exactly 24 h, so grid math is
 *  plain arithmetic; `wall - ms` is the zone offset at `ms`. */
function wallMs(ms: number, timeZone: string): number {
    const w = zoneWallClock(new Date(ms), timeZone);
    return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) + (((ms % 1000) + 1000) % 1000);
}

/**
 * The instant nearest `ms` whose wall clock in `timeZone` sits on the snap grid:
 * whole steps from zone midnight, shifted by `phaseMs`. Rounding the wall clock
 * alone is not enough on DST days: in the repeated hour a wall time names two
 * instants an hour apart, and before a spring-forward gap the next grid line
 * may be the jump itself. So the grid neighbours are taken under every offset
 * the zone has near `ms`, and only those the zone really shows at that instant
 * are kept.
 */
function snapToWallGrid(ms: number, step: number, timeZone: string, phaseMs: number): number {
    const span = step + MS_PER_DAY;
    const offsets: number[] = [];
    for (const probe of [ms, ms - span, ms + span]) {
        const off = wallMs(probe, timeZone) - probe;
        if (offsets.indexOf(off) < 0) {
            offsets.push(off);
        }
    }
    let best = ms;
    let bestDist = Infinity;
    for (const off of offsets) {
        const wall = ms + off;
        const midnight = Math.floor(wall / MS_PER_DAY) * MS_PER_DAY;
        const lo = midnight + phaseMs + Math.floor((wall - midnight - phaseMs) / step) * step;
        for (const gridWall of [lo, lo + step]) {
            const x = gridWall - off;
            const dist = Math.abs(x - ms);
            // Ties go to the later instant, like Math.round.
            if (wallMs(x, timeZone) === gridWall && (dist < bestDist || (dist === bestDist && x > best))) {
                best = x;
                bestDist = dist;
            }
        }
    }
    return best;
}

/** Snap an epoch instant to the nearest step of the zone's wall clock, counted
 *  from zone midnight (`timeZone` is the display zone; '' = browser-local). */
export function snapMs(ms: number, snapMinutes: number, timeZone: string): number {
    return snapToWallGrid(ms, snapStepMs(snapMinutes), timeZone, 0);
}

export interface MsRange {
    startMs: number;
    endMs: number;
}

/** Move: land the bar on the snap grid nearest the pointer, preserving its
 *  duration and its original grid offset (an 08:07 bar stays :07-aligned; a
 *  sloppy near-zero drag snaps back to exactly the original, so no silent retime
 *  on a wobbly click). The grid is the zone's wall clock, so a bar dragged across
 *  a DST change keeps its time of day instead of shifting by the hour. */
export function movePreviewMs(origStartMs: number, origEndMs: number, deltaMs: number, snapMinutes: number, timeZone: string): MsRange {
    const step = snapStepMs(snapMinutes);
    const wall = wallMs(origStartMs, timeZone);
    const phaseMs = (wall - Math.floor(wall / MS_PER_DAY) * MS_PER_DAY) % step;
    const startMs = snapToWallGrid(origStartMs + deltaMs, step, timeZone, phaseMs);
    return { startMs, endMs: startMs + (origEndMs - origStartMs) };
}

/** Whether a committed move preview is a no-op (same row, same instants) — the
 *  component treats those as a click instead of firing a phantom onChange. */
export function isNoopMove(origStartMs: number, origResourceId: string, previewStartMs: number, previewResourceId: string): boolean {
    return origStartMs === previewStartMs && origResourceId === previewResourceId;
}

/** Resize one edge by `deltaMs`, snapped, keeping at least one snap step of duration. */
export function resizePreviewMs(
    edge: 'start' | 'end', origStartMs: number, origEndMs: number, deltaMs: number, snapMinutes: number, timeZone: string
): MsRange {
    const minDur = snapStepMs(snapMinutes);
    if (edge === 'start') {
        const startMs = Math.min(snapMs(origStartMs + deltaMs, snapMinutes, timeZone), origEndMs - minDur);
        return { startMs, endMs: origEndMs };
    }
    const endMs = Math.max(snapMs(origEndMs + deltaMs, snapMinutes, timeZone), origStartMs + minDur);
    return { startMs: origStartMs, endMs };
}

/** Create: the snapped range between the anchor and the pointer, at least one step long. */
export function createPreviewMs(anchorMs: number, currentMs: number, snapMinutes: number, timeZone: string): MsRange {
    const a = snapMs(Math.min(anchorMs, currentMs), snapMinutes, timeZone);
    const b = snapMs(Math.max(anchorMs, currentMs), snapMinutes, timeZone);
    return { startMs: a, endMs: Math.max(b, a + snapStepMs(snapMinutes)) };
}

/** Vertical extent of a resource row track (screen px), for reassign hit-testing. */
export interface RowBound {
    resourceId: string;
    top: number;
    bottom: number;
}

/** The resource row under `y`, or null if the pointer is outside every track. */
export function rowAtY(rows: RowBound[], y: number): RowBound | null {
    for (const r of rows) {
        if (y >= r.top && y < r.bottom) {
            return r;
        }
    }
    return null;
}

export type TlCommitKind =
    | 'editEvent'     // open the built-in editor on the clicked bar
    | 'eventClick'    // fire onEventClick (no built-in editor)
    | 'move'          // commit a move (possibly to another row)
    | 'resize'        // commit an edge resize
    | 'selectEditor'  // open the editor on a dragged-out range
    | 'select'        // fire onSelect for a dragged-out range
    | 'createEditor'  // open the editor on a plain click on empty track
    | 'none';

export interface TlGestureFlags {
    editable: boolean;
    selectable: boolean;
    useEditor: boolean;        // built-in editor for create/select
    useEditorForEdit: boolean; // built-in editor for editing an existing bar
}

/** Decide what a released gesture should do (the onDocUp branch table). */
export function tlCommitDecision(mode: TlGestureMode, moved: boolean, hasPreview: boolean, f: TlGestureFlags): TlCommitKind {
    if (mode === 'move') {
        if (!f.editable || !moved || !hasPreview) {
            return f.useEditorForEdit ? 'editEvent' : 'eventClick';
        }
        return 'move';
    }
    if (mode === 'resize-start' || mode === 'resize-end') {
        return moved && hasPreview ? 'resize' : 'none';
    }
    // create
    if (moved && hasPreview && f.selectable) {
        return f.useEditor ? 'selectEditor' : 'select';
    }
    if (f.useEditor && f.selectable) {
        return 'createEditor';
    }
    return 'none';
}
