import {
    buildRRule, editorDefaults, editorForCreate, editorForEvent, editorGapWall, editorProblem,
    editorDeleteSpec, editorSaveSpec, gestureKeepsOrder, moveResizeSpec, reanchorSeries, toggleAllDayPatch
} from '../calendar/calendarEditorLogic';
import { Editor } from '../calendar/calendarTypes';
import { CalEvent } from '../calendar/calendarLogic';
import { emitWall } from '../../shared/dateUtils';
import { expandEvents, RRule } from '../../shared/recurrence';

// All specs are computed in UTC so the emitted offsets are machine-independent.
const TZ = 'UTC';

const ed = (o: Partial<Editor> = {}): Editor => ({
    id: null, title: 'Job', start: '2026-06-15T09:00', end: '2026-06-15T10:00', allDay: false,
    category: '', description: '', ...editorDefaults(), ...o
});

const none = (): CalEvent | undefined => undefined;

/** An occurrence as expandEvents tags it. */
const occOf = (seriesId: string, date: string, ev: Omit<CalEvent, 'id'>): CalEvent =>
    ({ ...ev, id: `${seriesId}::${date}`, __seriesId: seriesId, __occDate: date });

describe('emitWall', () => {
    it('emits an offset-bearing instant for timed values', () => {
        expect(emitWall('2026-06-15T09:00:00', false, TZ)).toBe('2026-06-15T09:00:00+00:00');
        expect(emitWall('2026-06-15T09:30', false, TZ)).toBe('2026-06-15T09:30:00+00:00');
    });
    it('emits a date-only string for all-day values', () => {
        expect(emitWall('2026-06-15T09:00:00', true, TZ)).toBe('2026-06-15');
    });
    it('passes empty / unparseable input through unchanged', () => {
        expect(emitWall('', false, TZ)).toBe('');
        expect(emitWall('not-a-date', false, TZ)).toBe('not-a-date');
    });
});

describe('editorForCreate', () => {
    it('trims a timed range to editor precision and applies the default category', () => {
        const e = editorForCreate('2026-06-15T09:00:00', '2026-06-15T10:30:00', false, 'work');
        expect(e).toMatchObject({ id: null, start: '2026-06-15T09:00', end: '2026-06-15T10:30', allDay: false, category: 'work' });
        expect(e.repeatFreq).toBe('');
        expect(e.seriesId).toBeNull();
    });
    it('all-day: date-only, and a missing end falls back to the start', () => {
        const e = editorForCreate('2026-06-15', '', true, '');
        expect(e.start).toBe('2026-06-15');
        expect(e.end).toBe('2026-06-15');
    });
});

describe('editorForEvent', () => {
    it('standalone event: no series context, no repeat', () => {
        const e = editorForEvent(
            { id: 'a', title: 'T', start: '2026-06-15T09:00:00', end: '2026-06-15T10:00:00' }, none);
        expect(e).toMatchObject({ id: 'a', start: '2026-06-15T09:00', end: '2026-06-15T10:00', seriesId: null, scope: 'series', repeatFreq: '' });
    });
    it('occurrence: recovers the series rule and scopes to "this event"', () => {
        const base: CalEvent = {
            id: 'a', title: 'T', start: '2026-06-01T09:00:00',
            rrule: { freq: 'weekly', interval: 2, byweekday: [1, 3], until: '2026-08-01' }
        };
        const e = editorForEvent(
            occOf('a', '2026-06-17', { title: 'T', start: '2026-06-17T09:00:00' }),
            (id) => (id === 'a' ? base : undefined));
        expect(e).toMatchObject({
            seriesId: 'a', occurrenceDate: '2026-06-17', scope: 'occurrence',
            repeatFreq: 'weekly', repeatInterval: 2, repeatByweekday: [1, 3],
            repeatEndMode: 'until', repeatUntil: '2026-08-01'
        });
    });
    it('maps a count-ended rule to the count end mode', () => {
        const base: CalEvent = { id: 'a', title: 'T', start: '2026-06-01', rrule: { freq: 'daily', count: 5 } };
        const e = editorForEvent(occOf('a', '2026-06-03', { title: 'T', start: '2026-06-03' }), () => base);
        expect(e.repeatEndMode).toBe('count');
        expect(e.repeatCount).toBe(5);
    });
    it('a plain event whose id contains "::" stays a plain event (#143)', () => {
        const lookup = jest.fn(none);
        const e = editorForEvent({ id: 'WO::1234', title: 'T', start: '2026-06-15T09:00:00' }, lookup);
        expect(e).toMatchObject({ id: 'WO::1234', seriesId: null, occurrenceDate: null, scope: 'series' });
        expect(lookup).not.toHaveBeenCalled();
    });
    it('an occurrence of a series whose id contains "::" keeps the whole series id (#143)', () => {
        const e = editorForEvent(occOf('line::A', '2026-06-17', { title: 'T', start: '2026-06-17T09:00:00' }), none);
        expect(e).toMatchObject({ seriesId: 'line::A', occurrenceDate: '2026-06-17', scope: 'occurrence' });
    });
});

describe('toggleAllDayPatch', () => {
    it('to all-day: trims both endpoints to dates', () => {
        expect(toggleAllDayPatch(ed(), true)).toEqual({ allDay: true, start: '2026-06-15', end: '2026-06-15' });
    });
    it('to timed: restores default working-hour times on date-only values', () => {
        expect(toggleAllDayPatch(ed({ allDay: true, start: '2026-06-15', end: '2026-06-16' }), false))
            .toEqual({ allDay: false, start: '2026-06-15T09:00', end: '2026-06-16T10:00' });
    });
    it('to timed: keeps values that already carry a time', () => {
        expect(toggleAllDayPatch(ed(), false)).toEqual({ allDay: false, start: '2026-06-15T09:00', end: '2026-06-15T10:00' });
    });
});

describe('buildRRule', () => {
    it('no frequency -> undefined (does not repeat)', () => {
        expect(buildRRule(ed(), none)).toBeUndefined();
    });
    it('weekly: sorts the weekday picks; interval only when > 1; open-ended omits until/count', () => {
        const rr = buildRRule(ed({ repeatFreq: 'weekly', repeatByweekday: [5, 1, 3] }), none)!;
        expect(rr).toEqual({ freq: 'weekly', byweekday: [1, 3, 5] });
        expect(buildRRule(ed({ repeatFreq: 'daily', repeatInterval: 3 }), none)).toEqual({ freq: 'daily', interval: 3 });
    });
    it('until / count end modes land in the rule', () => {
        expect(buildRRule(ed({ repeatFreq: 'daily', repeatEndMode: 'until', repeatUntil: '2026-08-01' }), none))
            .toEqual({ freq: 'daily', until: '2026-08-01' });
        expect(buildRRule(ed({ repeatFreq: 'daily', repeatEndMode: 'count', repeatCount: 7 }), none))
            .toEqual({ freq: 'daily', count: 7 });
    });
    it('preserves the series’ prior exceptions (exdate) across a series edit', () => {
        const base: CalEvent = { id: 'a', title: 'T', start: '2026-06-01', rrule: { freq: 'daily', exdate: ['2026-06-16'] } };
        const rr = buildRRule(ed({ repeatFreq: 'daily', seriesId: 'a' }), (id) => (id === 'a' ? base : undefined))!;
        expect(rr.exdate).toEqual(['2026-06-16']);
    });
    it('keeps a weekly series’ wkst (the editor has no field for it) and drops it off byweekday rules', () => {
        const base: CalEvent = { id: 'a', title: 'T', start: '2026-09-05', rrule: { freq: 'weekly', interval: 2, byweekday: [0, 6], wkst: 0 } };
        const lookup = (id: string) => (id === 'a' ? base : undefined);
        expect(buildRRule(ed({ repeatFreq: 'weekly', repeatInterval: 2, repeatByweekday: [6, 0], seriesId: 'a' }), lookup))
            .toEqual({ freq: 'weekly', interval: 2, byweekday: [0, 6], wkst: 0 });
        expect(buildRRule(ed({ repeatFreq: 'daily', seriesId: 'a' }), lookup)).toEqual({ freq: 'daily' });
    });
});

describe('reanchorSeries', () => {
    it('keeps the base date while applying the edited time', () => {
        expect(reanchorSeries('2026-06-01T09:00:00', '2026-06-15T10:30:00', false, TZ)).toBe('2026-06-01T10:30:00');
    });
    it('all-day: just the base date', () => {
        expect(reanchorSeries('2026-06-01T09:00:00', '2026-06-15', true, TZ)).toBe('2026-06-01');
    });
    it('resolves an offset-bearing base instant into the display zone first', () => {
        expect(reanchorSeries('2026-06-01T09:00:00+00:00', '2026-06-15T10:30:00', false, TZ)).toBe('2026-06-01T10:30:00');
    });
});

describe('editorSaveSpec', () => {
    it('create: fresh id, emitted instants, defaulted title, explicit rrule null', () => {
        const spec = editorSaveSpec(ed({ title: '' }), TZ, none);
        expect(spec.action).toBe('create');
        expect(spec.extra).toBeUndefined();
        expect(spec.event).toMatchObject({
            title: 'New event', allDay: false, rrule: null,
            start: '2026-06-15T09:00:00+00:00', end: '2026-06-15T10:00:00+00:00'
        });
        expect((spec.event as { id: string }).id).toMatch(/^evt-\d+$/);
    });
    it('create: an injected id generator is honoured', () => {
        const spec = editorSaveSpec(ed(), TZ, none, () => 'fixed-id');
        expect((spec.event as { id: string }).id).toBe('fixed-id');
    });
    it('edit of a standalone event keeps its id and can add recurrence', () => {
        const spec = editorSaveSpec(ed({ id: 'a', repeatFreq: 'daily' }), TZ, none);
        expect(spec.action).toBe('edit');
        expect(spec.event).toMatchObject({ id: 'a', rrule: { freq: 'daily' } });
    });
    it('occurrence scope: a detached override id + occurrence context, no rrule on the override', () => {
        const spec = editorSaveSpec(
            ed({ id: 'a::2026-06-17', seriesId: 'a', occurrenceDate: '2026-06-17', scope: 'occurrence', start: '2026-06-17T11:00', end: '2026-06-17T12:00' }),
            TZ, none);
        expect(spec.action).toBe('edit');
        expect(spec.event).toMatchObject({ id: 'a-x-2026-06-17', start: '2026-06-17T11:00:00+00:00' });
        expect('rrule' in (spec.event as object)).toBe(false);
        expect(spec.extra).toEqual({ scope: 'occurrence', seriesId: 'a', occurrenceDate: '2026-06-17' });
    });
    it('series scope: re-anchors on the base date, keeps exdate, updates the rule', () => {
        const base: CalEvent = {
            id: 'a', title: 'T', start: '2026-06-01T09:00:00',
            rrule: { freq: 'weekly', exdate: ['2026-06-10'] }
        };
        const spec = editorSaveSpec(
            ed({ id: 'a::2026-06-17', seriesId: 'a', occurrenceDate: '2026-06-17', scope: 'series', repeatFreq: 'weekly', repeatByweekday: [2], start: '2026-06-17T10:30', end: '2026-06-17T11:30' }),
            TZ, (id) => (id === 'a' ? base : undefined));
        expect(spec.action).toBe('edit');
        expect(spec.event).toMatchObject({
            id: 'a',
            start: '2026-06-01T10:30:00+00:00',   // base date + edited time
            rrule: { freq: 'weekly', byweekday: [2], exdate: ['2026-06-10'] }
        });
        expect(spec.extra).toEqual({ scope: 'series', seriesId: 'a' });
    });
    it('series scope: clearing the repeat control removes the recurrence (rrule null)', () => {
        const base: CalEvent = { id: 'a', title: 'T', start: '2026-06-01T09:00:00', rrule: { freq: 'daily' } };
        const spec = editorSaveSpec(
            ed({ id: 'a', seriesId: 'a', scope: 'series', repeatFreq: '' }),
            TZ, () => base);
        expect((spec.event as { rrule: unknown }).rrule).toBeNull();
    });
});

describe('editorProblem', () => {
    it('timed: end must be strictly after start', () => {
        expect(editorProblem(ed(), TZ)).toBeNull();
        expect(editorProblem(ed({ end: '2026-06-15T09:00' }), TZ)).toBe('range');
        expect(editorProblem(ed({ end: '2026-06-15T08:00' }), TZ)).toBe('range');
        expect(editorProblem(ed({ end: '' }), TZ)).toBe('parse');
    });
    it('all-day: the end date is inclusive, so same-day is valid', () => {
        const ad = (o: Partial<Editor> = {}) => ed({ allDay: true, start: '2026-06-15', end: '2026-06-15', ...o });
        expect(editorProblem(ad(), TZ)).toBeNull();
        expect(editorProblem(ad({ end: '2026-06-14' }), TZ)).toBe('range');
        expect(editorProblem(ad({ end: '' }), TZ)).toBe('parse');
    });
});

describe('a range that a DST gap collapses', () => {
    const NY = 'America/New_York';
    const BX = 'Europe/Brussels';
    const timed = (start: string, end?: string): CalEvent => ({ id: 'a', title: 'A', start, end });

    it('editor: blocks what would otherwise be written with the end before the start', () => {
        const reversed = ed({ start: '2026-03-08T02:30', end: '2026-03-08T03:00' });
        const saved = editorSaveSpec(reversed, NY, none).event as { start: string; end: string };
        expect(saved.start).toBe('2026-03-08T03:30:00-04:00');
        expect(saved.end).toBe('2026-03-08T03:00:00-04:00');
        expect(editorProblem(reversed, NY)).toBe('gap');
    });
    it('editor: blocks what would otherwise be written with zero length', () => {
        const empty = ed({ start: '2026-03-08T02:00', end: '2026-03-08T03:00' });
        const saved = editorSaveSpec(empty, NY, none).event as { start: string; end: string };
        expect(saved.start).toBe(saved.end);
        expect(editorProblem(empty, NY)).toBe('gap');
    });
    it('editor: the same check east of UTC', () => {
        expect(editorProblem(ed({ start: '2026-03-29T02:30', end: '2026-03-29T03:00' }), BX)).toBe('gap');
        expect(editorProblem(ed({ start: '2026-03-29T02:00', end: '2026-03-29T03:00' }), BX)).toBe('gap');
    });
    it('editor: a wall-reversed range that resolves forward saves, as in the timeline', () => {
        // 02:30 is 03:30 EDT, after the 03:00 start: what is written is a real 30 minutes.
        const r = ed({ start: '2026-03-08T03:00', end: '2026-03-08T02:30' });
        expect(editorProblem(r, NY)).toBeNull();
        const saved = editorSaveSpec(r, NY, none).event as { start: string; end: string };
        expect(saved.start).toBe('2026-03-08T03:00:00-04:00');
        expect(saved.end).toBe('2026-03-08T03:30:00-04:00');
    });
    it('editor: an unparseable time is a parse problem, not a range one', () => {
        expect(editorProblem(ed({ start: 'not-a-date-value' }), NY)).toBe('parse');
    });

    it('drag: a move or resize that collapses is refused', () => {
        const ev = timed('2026-03-07T02:30:00', '2026-03-07T03:00:00');
        expect(gestureKeepsOrder(ev, { start: '2026-03-08T02:30:00', end: '2026-03-08T03:00:00' }, NY)).toBe(false);
        const long = timed('2026-03-08T01:00:00', '2026-03-08T03:00:00');
        expect(gestureKeepsOrder(long, { start: '2026-03-08T02:30:00' }, NY)).toBe(false);
        const open = timed('2026-03-08T01:00:00');
        expect(gestureKeepsOrder(open, { start: '2026-03-08T02:30:00', end: '2026-03-08T03:30:00' }, NY)).toBe(false);
    });
    it('drag: an occurrence the gap already collapsed cannot be dragged into a new collapsed range', () => {
        const ev = timed('2026-03-08T02:30:00', '2026-03-08T03:00:00');
        expect(gestureKeepsOrder(ev, { start: '2026-03-08T02:45:00', end: '2026-03-08T03:15:00' }, NY)).toBe(false);
        expect(gestureKeepsOrder(ev, { start: '2026-03-09T02:30:00', end: '2026-03-09T03:00:00' }, NY)).toBe(true);
    });
    it('drag: bound data that already runs backwards can still be moved', () => {
        const ev = timed('2026-06-15T10:00:00', '2026-06-15T09:00:00');
        expect(gestureKeepsOrder(ev, { start: '2026-06-16T10:00:00', end: '2026-06-16T09:00:00' }, NY)).toBe(true);
    });
    it('drag: anything that stays forward still fires', () => {
        const ev = timed('2026-03-07T01:30:00', '2026-03-07T02:30:00');
        expect(gestureKeepsOrder(ev, { start: '2026-03-08T01:30:00', end: '2026-03-08T02:30:00' }, NY)).toBe(true);
        expect(gestureKeepsOrder(ev, { start: '2026-06-15T02:30:00', end: '2026-06-15T03:00:00' }, NY)).toBe(true);
    });
    it('drag: open-ended, all-day and already-empty events are not its business', () => {
        expect(gestureKeepsOrder(timed('2026-03-08T01:00:00'), { start: '2026-03-08T02:30:00' }, NY)).toBe(true);
        const allDay = { ...timed('2026-03-07', '2026-03-07'), allDay: true };
        expect(gestureKeepsOrder(allDay, { start: '2026-03-08', end: '2026-03-08' }, NY)).toBe(true);
        const empty = timed('2026-06-15T09:00:00', '2026-06-15T09:00:00');
        expect(gestureKeepsOrder(empty, { start: '2026-03-08T02:30:00', end: '2026-03-08T02:30:00' }, NY)).toBe(true);
    });
});

describe('carry-through of fields the editor does not edit', () => {
    const rich: CalEvent = {
        id: 'a', title: 'T', start: '2026-06-15T09:00:00', end: '2026-06-15T10:00:00',
        color: '#00ff00', status: 'tentative', display: 'background'
    };

    it('editorForEvent captures color/status/display and save re-emits them', () => {
        const e = editorForEvent(rich, none);
        expect(e.carry).toEqual({ color: '#00ff00', status: 'tentative', display: 'background' });
        const spec = editorSaveSpec(e, TZ, none);
        expect(spec.event).toMatchObject({ color: '#00ff00', status: 'tentative', display: 'background' });
    });

    it('the series branch carries them too, without disturbing the explicit rrule', () => {
        const base: CalEvent = { ...rich, rrule: { freq: 'daily' } };
        const e = editorForEvent(occOf('a', '2026-06-17', { ...rich, start: '2026-06-17T09:00:00' }), () => base);
        const spec = editorSaveSpec({ ...e, scope: 'series' }, TZ, () => base);
        expect(spec.event).toMatchObject({ status: 'tentative', rrule: { freq: 'daily' } });
    });

    it('move/resize specs carry status and display', () => {
        const spec = moveResizeSpec('move', rich, { start: '2026-06-16T09:00:00', end: '2026-06-16T10:00:00' }, TZ);
        expect(spec.event).toMatchObject({ status: 'tentative', display: 'background' });
    });
});

describe('editorDeleteSpec', () => {
    it('nothing to delete while creating (id null)', () => {
        expect(editorDeleteSpec(ed())).toBeNull();
    });
    it('standalone delete carries id + title', () => {
        expect(editorDeleteSpec(ed({ id: 'a', title: 'T' })))
            .toEqual({ action: 'delete', event: { id: 'a', title: 'T' } });
    });
    it('occurrence delete targets the override id with occurrence context', () => {
        expect(editorDeleteSpec(ed({ id: 'a::2026-06-17', seriesId: 'a', occurrenceDate: '2026-06-17', scope: 'occurrence' })))
            .toEqual({
                action: 'delete', event: { id: 'a-x-2026-06-17' },
                extra: { scope: 'occurrence', seriesId: 'a', occurrenceDate: '2026-06-17' }
            });
    });
    it('series delete targets the base id', () => {
        expect(editorDeleteSpec(ed({ id: 'a::2026-06-17', seriesId: 'a', scope: 'series' })))
            .toEqual({ action: 'delete', event: { id: 'a' }, extra: { scope: 'series', seriesId: 'a' } });
    });
});

describe('moveResizeSpec', () => {
    const ev: CalEvent = { id: 'e1', title: 'T', start: '2026-06-15T09:00:00', end: '2026-06-15T10:00:00', category: 'ops' };

    it('move: emits the full event with the new start/end', () => {
        const spec = moveResizeSpec('move', ev, { start: '2026-06-16T11:00:00', end: '2026-06-16T12:00:00' }, TZ);
        expect(spec.action).toBe('move');
        expect(spec.extra).toBeUndefined();
        expect(spec.event).toEqual({
            id: 'e1', title: 'T', allDay: false, color: '', category: 'ops', description: '',
            start: '2026-06-16T11:00:00+00:00', end: '2026-06-16T12:00:00+00:00'
        });
    });
    it('resize: only the end moves; the start is the (emitted) original', () => {
        const spec = moveResizeSpec('resize', ev, { end: '2026-06-15T11:30:00' }, TZ);
        expect(spec.event).toMatchObject({ start: '2026-06-15T09:00:00+00:00', end: '2026-06-15T11:30:00+00:00' });
    });
    it('dragging a recurring occurrence detaches it into an override with occurrence context', () => {
        const spec = moveResizeSpec('move', occOf('a', '2026-06-17', ev), { start: '2026-06-17T11:00:00', end: '2026-06-17T12:00:00' }, TZ);
        expect((spec.event as { id: string }).id).toBe('a-x-2026-06-17');
        expect(spec.extra).toEqual({ scope: 'occurrence', seriesId: 'a', occurrenceDate: '2026-06-17' });
    });
    it('the occurrence tags never reach the onChange event payload', () => {
        const spec = moveResizeSpec('move', occOf('a', '2026-06-17', ev), { start: '2026-06-17T11:00:00' }, TZ);
        expect(Object.keys(spec.event).filter((k) => k.indexOf('__') === 0)).toEqual([]);
    });
    it('dragging a plain event whose id contains "::" is a plain move (#143)', () => {
        const spec = moveResizeSpec('move', { ...ev, id: 'WO::1234' }, { start: '2026-06-16T11:00:00', end: '2026-06-16T12:00:00' }, TZ);
        expect((spec.event as { id: string }).id).toBe('WO::1234');
        expect(spec.extra).toBeUndefined();
    });
    it('an occurrence of a series whose id contains "::" detaches against the whole series id (#143)', () => {
        const spec = moveResizeSpec('move', occOf('line::A', '2026-06-17', ev), { start: '2026-06-17T11:00:00' }, TZ);
        expect((spec.event as { id: string }).id).toBe('line::A-x-2026-06-17');
        expect(spec.extra).toEqual({ scope: 'occurrence', seriesId: 'line::A', occurrenceDate: '2026-06-17' });
    });
});

describe('whole-series edits are checked where they are written (#248)', () => {
    const NY = 'America/New_York';
    const series = (start: string, end: string): CalEvent => ({ id: 's', title: 'S', start, end, rrule: { freq: 'daily' } });
    const allEvents = (start: string, end: string, occDate: string, allDay = false): Editor =>
        ed({ id: `s::${occDate}`, seriesId: 's', occurrenceDate: occDate, scope: 'series', repeatFreq: 'daily', start, end, allDay });
    const written = (e: Editor, base: CalEvent, tz: string) =>
        editorSaveSpec(e, tz, (id) => (id === 's' ? base : undefined)).event as { start: string; end: string };

    it('an overnight edit stays overnight on the series date instead of ending before it starts', () => {
        const base = series('2026-03-02T22:00:00', '2026-03-02T23:00:00');
        const e = allEvents('2026-03-15T22:00', '2026-03-16T02:00', '2026-03-15');
        expect(editorProblem(e, NY, () => base)).toBeNull();
        expect(written(e, base, NY)).toMatchObject({ start: '2026-03-02T22:00:00-05:00', end: '2026-03-03T02:00:00-05:00' });
    });
    it('an overnight series edited to end the same day ends the same day', () => {
        const base = series('2026-06-01T22:00:00', '2026-06-02T02:00:00');
        const e = allEvents('2026-06-15T21:00', '2026-06-15T23:00', '2026-06-15');
        expect(written(e, base, TZ)).toMatchObject({ start: '2026-06-01T21:00:00+00:00', end: '2026-06-01T23:00:00+00:00' });
    });
    it('blocks an edit that a DST gap on the series date would reverse', () => {
        const base = series('2026-03-08T09:00:00', '2026-03-08T10:00:00');   // a gap day in New York
        const e = allEvents('2026-03-15T02:30', '2026-03-15T03:00', '2026-03-15');
        expect(editorProblem(e, NY)).toBeNull();                  // fine on the opened date...
        expect(editorProblem(e, NY, () => base)).toBe('gap');   // ...but written on the gap day
    });
    it('allows an edit opened on a gap day when the series date has no gap', () => {
        const base = series('2026-03-01T09:00:00', '2026-03-01T10:00:00');
        const e = allEvents('2026-03-08T02:30', '2026-03-08T03:00', '2026-03-08');
        expect(editorProblem(e, NY)).toBe('gap');               // on the opened date it would reverse
        expect(editorProblem(e, NY, () => base)).toBeNull();
        expect(written(e, base, NY)).toMatchObject({ start: '2026-03-01T02:30:00-05:00', end: '2026-03-01T03:00:00-05:00' });
    });
    it('an all-day series keeps the edited span in days', () => {
        const base: CalEvent = { id: 's', title: 'S', start: '2026-06-01', end: '2026-06-03', allDay: true, rrule: { freq: 'weekly' } };
        const e = allEvents('2026-06-15', '2026-06-16', '2026-06-15', true);
        expect(editorProblem(e, TZ, () => base)).toBeNull();
        expect(written(e, base, TZ)).toMatchObject({ start: '2026-06-01', end: '2026-06-02' });
    });
    it('without the base event bound, saves and checks the editor walls as they are', () => {
        const e = allEvents('2026-06-15T09:00', '2026-06-15T10:00', '2026-06-15');
        expect(editorProblem(e, TZ, none)).toBeNull();
        expect(editorSaveSpec(e, TZ, none).event).toMatchObject({ start: '2026-06-15T09:00:00+00:00', end: '2026-06-15T10:00:00+00:00' });
    });
    it('an occurrence-only edit is still checked on its own date', () => {
        const base = series('2026-03-08T09:00:00', '2026-03-08T10:00:00');
        const e = { ...allEvents('2026-03-15T02:30', '2026-03-15T03:00', '2026-03-15'), scope: 'occurrence' as const };
        expect(editorProblem(e, NY, () => base)).toBeNull();
    });
});

describe('a whole-series edit that moves the start date moves the series (#291)', () => {
    const daily = (start: string, end: string, rrule: RRule = { freq: 'daily' }): CalEvent =>
        ({ id: 's', title: 'S', start, end, rrule });
    const allEvents = (start: string, end: string, occDate: string, o: Partial<Editor> = {}): Editor =>
        ed({ id: `s::${occDate}`, seriesId: 's', occurrenceDate: occDate, scope: 'series', repeatFreq: 'daily', start, end, ...o });
    const save = (e: Editor, base: CalEvent) =>
        editorSaveSpec(e, TZ, (id) => (id === 's' ? base : undefined)).event as { start: string; end: string; rrule: RRule };

    it('moves the series start by the days the opened occurrence moved', () => {
        const base = daily('2026-06-01T09:00:00', '2026-06-01T10:00:00');
        const out = save(allEvents('2026-06-14T09:00', '2026-06-14T10:00', '2026-06-15'), base);
        expect(out).toMatchObject({ start: '2026-05-31T09:00:00+00:00', end: '2026-05-31T10:00:00+00:00' });
    });
    it('keeps the edited span in days when only the start date moved (the case in the issue)', () => {
        const base = daily('2026-06-01T09:00:00', '2026-06-01T10:00:00');
        const out = save(allEvents('2026-06-14T09:00', '2026-06-15T10:00', '2026-06-15'), base);
        expect(out).toMatchObject({ start: '2026-05-31T09:00:00+00:00', end: '2026-06-01T10:00:00+00:00' });
    });
    it('a time-only edit still keeps the series on its own date', () => {
        const base = daily('2026-06-01T09:00:00', '2026-06-01T10:00:00');
        const out = save(allEvents('2026-06-15T11:00', '2026-06-15T12:00', '2026-06-15'), base);
        expect(out).toMatchObject({ start: '2026-06-01T11:00:00+00:00', end: '2026-06-01T12:00:00+00:00' });
    });
    it('moves the exdates with the series, so removed occurrences stay removed', () => {
        const base = daily('2026-06-01T09:00:00', '2026-06-01T10:00:00', { freq: 'daily', exdate: ['2026-06-03', '2026-06-10'] });
        const out = save(allEvents('2026-06-17T09:00', '2026-06-17T10:00', '2026-06-15'), base);
        expect(out.rrule.exdate).toEqual(['2026-06-05', '2026-06-12']);
    });
    it('turns a weekly rule\'s weekdays with the start, and the expansion follows', () => {
        // Mon/Wed from Mon 2026-06-01, Wed 06-10 removed; Mon 06-15 is moved to Tue 06-16.
        const base = daily('2026-06-01T09:00:00', '2026-06-01T10:00:00', { freq: 'weekly', byweekday: [1, 3], exdate: ['2026-06-10'] });
        const e = allEvents('2026-06-16T09:00', '2026-06-16T10:00', '2026-06-15', { repeatFreq: 'weekly', repeatByweekday: [1, 3] });
        const out = save(e, base);
        expect(out.rrule).toMatchObject({ byweekday: [2, 4], exdate: ['2026-06-11'] });
        expect(out.start).toBe('2026-06-02T09:00:00+00:00');
        const dates = expandEvents([{ ...base, ...out } as CalEvent], new Date(2026, 5, 1), new Date(2026, 6, 1), TZ)
            .map((o) => o.start.slice(0, 10));
        expect(dates).toEqual(['2026-06-02', '2026-06-04', '2026-06-09', '2026-06-16', '2026-06-18', '2026-06-23', '2026-06-25', '2026-06-30']);
    });
    it('keeps weekdays the user changed in the same save', () => {
        const base = daily('2026-06-01T09:00:00', '2026-06-01T10:00:00', { freq: 'weekly', byweekday: [1, 3] });
        const e = allEvents('2026-06-16T09:00', '2026-06-16T10:00', '2026-06-15', { repeatFreq: 'weekly', repeatByweekday: [2, 5] });
        expect(save(e, base).rrule.byweekday).toEqual([2, 5]);
    });
    it('a move by whole weeks keeps the weekdays', () => {
        const base = daily('2026-06-01T09:00:00', '2026-06-01T10:00:00', { freq: 'weekly', byweekday: [1, 3] });
        const e = allEvents('2026-06-22T09:00', '2026-06-22T10:00', '2026-06-15', { repeatFreq: 'weekly', repeatByweekday: [1, 3] });
        const out = save(e, base);
        expect(out.rrule.byweekday).toEqual([1, 3]);
        expect(out.start).toBe('2026-06-08T09:00:00+00:00');
    });
    it('keeps until and count as the editor shows them', () => {
        const base = daily('2026-06-01T09:00:00', '2026-06-01T10:00:00', { freq: 'daily', until: '2026-06-30' });
        const e = allEvents('2026-06-16T09:00', '2026-06-16T10:00', '2026-06-15', { repeatEndMode: 'until', repeatUntil: '2026-06-30' });
        expect(save(e, base).rrule.until).toBe('2026-06-30');
    });
    it('moves an all-day series by days', () => {
        const base: CalEvent = { id: 's', title: 'S', start: '2026-06-01', end: '2026-06-02', allDay: true, rrule: { freq: 'daily', exdate: ['2026-06-05'] } };
        const out = save(allEvents('2026-06-13', '2026-06-14', '2026-06-15', { allDay: true }), base);
        expect(out).toMatchObject({ start: '2026-05-30', end: '2026-05-31' });
        expect(out.rrule.exdate).toEqual(['2026-06-03']);
    });
    it('the check runs on the moved date', () => {
        // Moved from 03-15 to 03-14 while the base is on 03-09: written on 03-08, the New York gap day.
        const base = daily('2026-03-09T09:00:00', '2026-03-09T10:00:00');
        const e = allEvents('2026-03-14T02:30', '2026-03-14T03:00', '2026-03-15');
        expect(editorProblem(e, 'America/New_York', () => base)).toBe('gap');
        expect(editorGapWall(e, 'America/New_York', () => base)).toBe('2026-03-08T02:30');
    });
    it('a "This event" save never moves the series', () => {
        const base = daily('2026-06-01T09:00:00', '2026-06-01T10:00:00', { freq: 'daily', exdate: ['2026-06-03'] });
        const spec = editorSaveSpec({ ...allEvents('2026-06-17T09:00', '2026-06-17T10:00', '2026-06-15'), scope: 'occurrence' }, TZ, () => base);
        expect(spec.extra).toMatchObject({ scope: 'occurrence', occurrenceDate: '2026-06-15' });
        expect(spec.event).not.toHaveProperty('rrule');
    });
});

describe('a series that starts in a DST gap (#297)', () => {
    const NY = 'America/New_York';
    const base: CalEvent = { id: 's', title: 'S', start: '2026-03-08T02:30:00', end: '2026-03-08T03:30:00', rrule: { freq: 'daily' } };
    const lookup = (id: string): CalEvent | undefined => (id === 's' ? base : undefined);
    const opened = (date: string): Editor =>
        editorForEvent(occOf('s', date, { title: 'S', start: `${date}T02:30:00`, end: `${date}T03:30:00` }), lookup);

    it('an "All events" save that keeps the times is allowed, from any occurrence', () => {
        for (const date of ['2026-03-08', '2026-03-09', '2026-04-01']) {
            const e = { ...opened(date), scope: 'series' as const, title: 'Renamed' };
            expect(editorProblem(e, NY, lookup)).toBeNull();
        }
    });
    it('writes the stored gap time back as it is, not resolved to 03:30', () => {
        const e = { ...opened('2026-03-09'), scope: 'series' as const, title: 'Renamed' };
        const out = editorSaveSpec(e, NY, lookup).event as { start: string; end: string; title: string };
        expect(out).toMatchObject({ title: 'Renamed', start: '2026-03-08T02:30:00', end: '2026-03-08T03:30:00-04:00' });
    });
    it('a rule-only change goes through too', () => {
        const e = { ...opened('2026-03-09'), scope: 'series' as const, repeatFreq: 'weekly' as const };
        expect(editorProblem(e, NY, lookup)).toBeNull();
    });
    it('changing a time is still checked, and the message names the skipped time', () => {
        const e = { ...opened('2026-03-09'), scope: 'series' as const, end: '2026-03-09T03:15' };
        expect(editorProblem(e, NY, lookup)).toBe('gap');
        expect(editorGapWall(e, NY, lookup)).toBe('2026-03-08T02:30');
    });
    it('a "This event" save on the gap day gets the gap message', () => {
        const e = opened('2026-03-08');
        expect(editorProblem(e, NY, lookup)).toBe('gap');
        expect(editorGapWall(e, NY, lookup)).toBe('2026-03-08T02:30');
    });
    it('a range typed backwards keeps the plain message, even with a time in the gap', () => {
        expect(editorProblem(ed({ start: '2026-03-08T04:00', end: '2026-03-08T02:30' }), NY)).toBe('range');
    });
    it('the exemption never passes a range stored backwards', () => {
        const back: CalEvent = { id: 's', title: 'S', start: '2026-06-01T10:00:00', end: '2026-06-01T09:00:00', rrule: { freq: 'daily' } };
        const e = { ...editorForEvent(occOf('s', '2026-06-15', { title: 'S', start: '2026-06-15T10:00:00', end: '2026-06-15T09:00:00' }), () => back), scope: 'series' as const };
        expect(editorProblem(e, NY, () => back)).toBe('range');
    });
    it('dropping the rule makes a one-off, which is checked as one', () => {
        const e = { ...opened('2026-03-09'), scope: 'series' as const, repeatFreq: '' as const };
        expect(editorProblem(e, NY, lookup)).toBe('gap');
    });
    it('a series with no stored end has nothing to keep and is checked as usual', () => {
        const noEnd: CalEvent = { ...base, end: undefined };
        const e = { ...opened('2026-03-09'), scope: 'series' as const };
        expect(editorProblem(e, NY, () => noEnd)).toBe('gap');
    });
});
