import { msToWallInput, msToZonedIso } from '../../shared/dateUtils';
import {
    createPreviewMs, isNoopMove, movePreviewMs, resizePreviewMs, rowAtY, snapMs, tlCommitDecision, TlGestureFlags
} from '../timeline/timelineGestureLogic';
import {
    tlDeleteSpec, tlEditorForCreate, tlEditorForEvent, tlEditorProblem, tlMoveResizeSpec, tlSaveSpec
} from '../timeline/timelineEditorLogic';
import { TimelineEvent } from '../timeline/timelineLogic';

const TZ = 'UTC';
const T0 = Date.UTC(2026, 6, 3, 8);   // 2026-07-03T08:00Z
const MIN = 60000;

describe('epoch emit helpers', () => {
    it('msToZonedIso emits an offset-bearing instant in the zone', () => {
        expect(msToZonedIso(T0, 'UTC')).toBe('2026-07-03T08:00:00+00:00');
        expect(msToZonedIso(T0, 'America/Chicago')).toBe('2026-07-03T03:00:00-05:00');
    });
    it('msToWallInput emits a datetime-local value in the zone', () => {
        expect(msToWallInput(T0, 'UTC')).toBe('2026-07-03T08:00');
        expect(msToWallInput(T0, 'America/Chicago')).toBe('2026-07-03T03:00');
    });
});

describe('gesture preview math', () => {
    it('snapMs rounds to the nearest step', () => {
        expect(snapMs(T0 + 7 * MIN, 15)).toBe(T0);                 // 08:07 -> 08:00
        expect(snapMs(T0 + 8 * MIN, 15)).toBe(T0 + 15 * MIN);      // 08:08 -> 08:15
        expect(snapMs(T0 + 7 * MIN, 5)).toBe(T0 + 5 * MIN);        // 08:07 -> 08:05
    });
    it('move preserves duration and snaps the start', () => {
        const r = movePreviewMs(T0, T0 + 90 * MIN, 22 * MIN, 15);
        expect(r.startMs).toBe(T0 + 15 * MIN);
        expect(r.endMs - r.startMs).toBe(90 * MIN);
    });
    it('move snaps the DELTA, so an off-grid start keeps its offset', () => {
        const orig = T0 + 7 * MIN;   // 08:07, off the 15-min grid
        expect(movePreviewMs(orig, orig + 60 * MIN, 0, 15).startMs).toBe(orig);            // untouched
        expect(movePreviewMs(orig, orig + 60 * MIN, 5 * MIN, 15).startMs).toBe(orig);      // sub-step wobble -> no shift
        expect(movePreviewMs(orig, orig + 60 * MIN, 20 * MIN, 15).startMs).toBe(orig + 15 * MIN);   // one step, :07 preserved
        expect(movePreviewMs(orig, orig + 60 * MIN, -8 * MIN, 15).startMs).toBe(orig - 15 * MIN);
    });
    it('isNoopMove: same start + same row only', () => {
        expect(isNoopMove(T0, 'm1', T0, 'm1')).toBe(true);
        expect(isNoopMove(T0, 'm1', T0 + 15 * MIN, 'm1')).toBe(false);
        expect(isNoopMove(T0, 'm1', T0, 'm2')).toBe(false);
    });
    it('resize keeps at least one snap step of duration on either edge', () => {
        expect(resizePreviewMs('end', T0, T0 + 60 * MIN, -120 * MIN, 15))
            .toEqual({ startMs: T0, endMs: T0 + 15 * MIN });
        expect(resizePreviewMs('start', T0, T0 + 60 * MIN, 120 * MIN, 15))
            .toEqual({ startMs: T0 + 45 * MIN, endMs: T0 + 60 * MIN });
        expect(resizePreviewMs('start', T0, T0 + 60 * MIN, -30 * MIN, 15).startMs).toBe(T0 - 30 * MIN);
    });
    it('create orders the anchor and pointer with a minimum length', () => {
        expect(createPreviewMs(T0 + 60 * MIN, T0, 15)).toEqual({ startMs: T0, endMs: T0 + 60 * MIN });
        expect(createPreviewMs(T0, T0 + 3 * MIN, 15)).toEqual({ startMs: T0, endMs: T0 + 15 * MIN });
    });
    it('rowAtY hit-tests row tracks', () => {
        const rows = [{ resourceId: 'a', top: 0, bottom: 40 }, { resourceId: 'b', top: 40, bottom: 80 }];
        expect(rowAtY(rows, 39)!.resourceId).toBe('a');
        expect(rowAtY(rows, 40)!.resourceId).toBe('b');
        expect(rowAtY(rows, 99)).toBeNull();
    });
});

describe('tlCommitDecision', () => {
    const f = (o: Partial<TlGestureFlags> = {}): TlGestureFlags =>
        ({ editable: false, selectable: false, useEditor: false, useEditorForEdit: false, ...o });

    it('move: a real drag commits only when editable; a click edits or fires onEventClick', () => {
        expect(tlCommitDecision('move', true, true, f({ editable: true }))).toBe('move');
        expect(tlCommitDecision('move', true, true, f())).toBe('eventClick');
        expect(tlCommitDecision('move', false, true, f({ editable: true, useEditorForEdit: true }))).toBe('editEvent');
    });
    it('resize commits only when actually dragged', () => {
        expect(tlCommitDecision('resize-end', true, true, f({ editable: true }))).toBe('resize');
        expect(tlCommitDecision('resize-start', false, true, f({ editable: true }))).toBe('none');
    });
    it('create: drag selects (or opens the editor); plain click needs the editor', () => {
        expect(tlCommitDecision('create', true, true, f({ selectable: true }))).toBe('select');
        expect(tlCommitDecision('create', true, true, f({ selectable: true, useEditor: true }))).toBe('selectEditor');
        expect(tlCommitDecision('create', false, false, f({ selectable: true, useEditor: true }))).toBe('createEditor');
        expect(tlCommitDecision('create', false, false, f({ selectable: true }))).toBe('none');
    });
});

describe('editor logic', () => {
    const ev: TimelineEvent = {
        id: 'e1', resourceId: 'm1', title: 'Job', category: 'prod', description: 'd',
        start: '2026-07-03T08:00:00Z', end: '2026-07-03T10:00:00Z'
    };

    it('editorForCreate/forEvent produce zone-local input values', () => {
        const c = tlEditorForCreate('m2', T0, T0 + 60 * MIN, TZ, 'prod');
        expect(c).toMatchObject({ id: null, resourceId: 'm2', start: '2026-07-03T08:00', end: '2026-07-03T09:00', category: 'prod' });
        const e = tlEditorForEvent(ev, TZ);
        expect(e).toMatchObject({ id: 'e1', resourceId: 'm1', start: '2026-07-03T08:00', end: '2026-07-03T10:00' });
    });

    it('save: create gets a fresh id, edit keeps it; times emit with offsets', () => {
        const created = tlSaveSpec(tlEditorForCreate('m2', T0, T0 + 60 * MIN, TZ, ''), TZ, () => 'fixed');
        expect(created.action).toBe('create');
        expect(created.event).toMatchObject({ id: 'fixed', resourceId: 'm2', start: '2026-07-03T08:00:00+00:00' });
        const edited = tlSaveSpec(tlEditorForEvent(ev, TZ), TZ);
        expect(edited.action).toBe('edit');
        expect(edited.event).toMatchObject({ id: 'e1', title: 'Job' });
    });

    it('delete: null while creating; id + resourceId when editing', () => {
        expect(tlDeleteSpec(tlEditorForCreate('m2', T0, T0, TZ, ''))).toBeNull();
        expect(tlDeleteSpec(tlEditorForEvent(ev, TZ)))
            .toEqual({ action: 'delete', event: { id: 'e1', resourceId: 'm1', title: 'Job' } });
    });

    it('move spec carries the final resourceId and flags a reassign', () => {
        const same = tlMoveResizeSpec('move', ev, { startMs: T0 + 60 * MIN, endMs: T0 + 180 * MIN }, TZ);
        expect(same.fromResourceId).toBeUndefined();
        expect(same.event).toMatchObject({ resourceId: 'm1', start: '2026-07-03T09:00:00+00:00', end: '2026-07-03T11:00:00+00:00' });

        const moved = tlMoveResizeSpec('move', ev, { startMs: T0, endMs: T0 + 120 * MIN, resourceId: 'm7' }, TZ);
        expect(moved.fromResourceId).toBe('m1');
        expect(moved.event).toMatchObject({ resourceId: 'm7' });
    });

    it('resize spec keeps the row and the untouched edge', () => {
        const spec = tlMoveResizeSpec('resize', ev, { endMs: T0 + 240 * MIN }, TZ);
        expect(spec.action).toBe('resize');
        expect(spec.fromResourceId).toBeUndefined();
        expect(spec.event).toMatchObject({
            resourceId: 'm1', start: '2026-07-03T08:00:00+00:00', end: '2026-07-03T12:00:00+00:00'
        });
    });

    it('moving an open-ended bar keeps it open-ended (no invented end)', () => {
        const open: TimelineEvent = { id: 'e2', resourceId: 'm1', title: 'Run', start: '2026-07-03T08:00:00Z' };
        const spec = tlMoveResizeSpec('move', open, { startMs: T0 + 60 * MIN }, TZ);
        expect(spec.event).toMatchObject({ start: '2026-07-03T09:00:00+00:00', end: '' });
    });

    it('move/resize specs carry status and display through unchanged', () => {
        const styled: TimelineEvent = { ...ev, status: 'tentative', display: 'bar' };
        const spec = tlMoveResizeSpec('move', styled, { startMs: T0 + 60 * MIN, endMs: T0 + 180 * MIN }, TZ);
        expect(spec.event).toMatchObject({ status: 'tentative', display: 'bar' });
        // absent fields stay absent rather than materializing as '' keys
        expect('status' in (tlMoveResizeSpec('move', ev, { startMs: T0 }, TZ).event as object)).toBe(false);
    });

    it('save spec carries color/status/display/rrule the editor does not edit', () => {
        const rich: TimelineEvent = {
            ...ev, color: '#ff0000', status: 'confirmed', display: 'bar', rrule: { freq: 'daily' }
        };
        const spec = tlSaveSpec(tlEditorForEvent(rich, TZ), TZ);
        expect(spec.event).toMatchObject({
            color: '#ff0000', status: 'confirmed', display: 'bar', rrule: { freq: 'daily' }
        });
        // a plain event carries nothing extra
        expect('rrule' in (tlSaveSpec(tlEditorForEvent(ev, TZ), TZ).event as object)).toBe(false);
    });

    it('tlEditorProblem blocks a reversed or unparseable range', () => {
        const ok = tlEditorForCreate('m1', T0, T0 + 60 * MIN, TZ, '');
        expect(tlEditorProblem(ok, TZ)).toBeNull();
        expect(tlEditorProblem({ ...ok, end: ok.start }, TZ)).toBe('range');
        expect(tlEditorProblem({ ...ok, end: '2026-07-03T07:00' }, TZ)).toBe('range');
        expect(tlEditorProblem({ ...ok, end: '' }, TZ)).toBe('parse');
    });
});
