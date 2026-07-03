import {
    buildRRule, editorDefaults, editorForCreate, editorForEvent, editorProblem,
    editorDeleteSpec, editorSaveSpec, moveResizeSpec, reanchorSeries, toggleAllDayPatch
} from '../calendar/editorLogic';
import { Editor } from '../calendar/types';
import { CalEvent } from '../calendarLogic';
import { emitWall } from '../../shared/dateUtils';

// All specs are computed in UTC so the emitted offsets are machine-independent.
const TZ = 'UTC';

const ed = (o: Partial<Editor> = {}): Editor => ({
    id: null, title: 'Job', start: '2026-06-15T09:00', end: '2026-06-15T10:00', allDay: false,
    category: '', description: '', ...editorDefaults(), ...o
});

const none = (): CalEvent | undefined => undefined;

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
    it('occurrence (id "base::date"): recovers the series rule and scopes to "this event"', () => {
        const base: CalEvent = {
            id: 'a', title: 'T', start: '2026-06-01T09:00:00',
            rrule: { freq: 'weekly', interval: 2, byweekday: [1, 3], until: '2026-08-01' }
        };
        const e = editorForEvent(
            { id: 'a::2026-06-17', title: 'T', start: '2026-06-17T09:00:00' },
            (id) => (id === 'a' ? base : undefined));
        expect(e).toMatchObject({
            seriesId: 'a', occurrenceDate: '2026-06-17', scope: 'occurrence',
            repeatFreq: 'weekly', repeatInterval: 2, repeatByweekday: [1, 3],
            repeatEndMode: 'until', repeatUntil: '2026-08-01'
        });
    });
    it('maps a count-ended rule to the count end mode', () => {
        const base: CalEvent = { id: 'a', title: 'T', start: '2026-06-01', rrule: { freq: 'daily', count: 5 } };
        const e = editorForEvent({ id: 'a::2026-06-03', title: 'T', start: '2026-06-03' }, () => base);
        expect(e.repeatEndMode).toBe('count');
        expect(e.repeatCount).toBe(5);
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
        expect(editorProblem(ed())).toBeNull();
        expect(editorProblem(ed({ end: '2026-06-15T09:00' }))).toBe('range');
        expect(editorProblem(ed({ end: '2026-06-15T08:00' }))).toBe('range');
        expect(editorProblem(ed({ end: '' }))).toBe('parse');
    });
    it('all-day: the end date is inclusive, so same-day is valid', () => {
        const ad = (o: Partial<Editor> = {}) => ed({ allDay: true, start: '2026-06-15', end: '2026-06-15', ...o });
        expect(editorProblem(ad())).toBeNull();
        expect(editorProblem(ad({ end: '2026-06-14' }))).toBe('range');
        expect(editorProblem(ad({ end: '' }))).toBe('parse');
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
        const e = editorForEvent({ ...rich, id: 'a::2026-06-17', start: '2026-06-17T09:00:00' }, () => base);
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
        const spec = moveResizeSpec('move', { ...ev, id: 'a::2026-06-17' }, { start: '2026-06-17T11:00:00', end: '2026-06-17T12:00:00' }, TZ);
        expect((spec.event as { id: string }).id).toBe('a-x-2026-06-17');
        expect(spec.extra).toEqual({ scope: 'occurrence', seriesId: 'a', occurrenceDate: '2026-06-17' });
    });
});
