import {
    BAR_HANDLES_MIN_PX, MIN_BAR_PX, MS_PER_HOUR, TimeScale, TimelineEvent, ZOOM_PRESETS,
    barGeom, buildRows, buildTicks, followAnchorMs, followDisarms, followTickMs,
    isConfiguredEmpty, layoutRowBands, layoutRowBars, msToPx, pxToMs, resolveSnapMinutes,
    scaleWidth, timelineEventsToCsv, windowOutputs
} from '../timeline/timelineLogic';
import { mapTimelineProps } from '../timeline/timelineProps';
import { toEpochMs } from '../../shared/dateUtils';
import { stubReader } from './_stubReader';

// A fixed UTC window: 2026-06-17T00:00Z .. +24h at the day preset's density.
const scale: TimeScale = {
    startMs: Date.UTC(2026, 5, 17),
    endMs: Date.UTC(2026, 5, 18),
    pxPerHour: 60
};

describe('time scale (epoch-linear)', () => {
    it('maps ms <-> px linearly from the window start', () => {
        expect(msToPx(scale, scale.startMs)).toBe(0);
        expect(msToPx(scale, scale.startMs + 6 * MS_PER_HOUR)).toBe(360);
        expect(pxToMs(scale, 360)).toBe(scale.startMs + 6 * MS_PER_HOUR);
        expect(scaleWidth(scale)).toBe(24 * 60);
    });

    it('round-trips arbitrary points', () => {
        const ms = scale.startMs + 3.5 * MS_PER_HOUR;
        expect(pxToMs(scale, msToPx(scale, ms))).toBeCloseTo(ms, 6);
    });
});

describe('buildTicks', () => {
    it('day zoom: one upper (day) tick and hourly lower ticks in UTC', () => {
        const t = buildTicks(scale, 'day', 'UTC', 'en-US');
        expect(t.upper).toHaveLength(1);
        expect(t.upper[0].px).toBe(0);
        expect(t.upper[0].label).toMatch(/Jun 17|17/);
        expect(t.lower).toHaveLength(24);
        expect(t.lower[1].px).toBe(60);
        expect(t.lower[1].label).toBe('01:00');
    });

    it('week zoom: seven day ticks stepping by the preset', () => {
        const week: TimeScale = {
            startMs: scale.startMs,
            endMs: scale.startMs + ZOOM_PRESETS.week.spanHours * MS_PER_HOUR,
            pxPerHour: ZOOM_PRESETS.week.pxPerHour
        };
        const t = buildTicks(week, 'week', 'UTC', 'en-US');
        expect(t.upper).toHaveLength(7);
        expect(t.upper[1].px).toBe(24 * ZOOM_PRESETS.week.pxPerHour);
        expect(t.lower).toHaveLength((7 * 24 * 60) / ZOOM_PRESETS.week.lowerStepMin);
    });

    it('labels follow the timezone', () => {
        const t = buildTicks(scale, 'day', 'America/Chicago', 'en-US');
        expect(t.lower[0].label).toBe('19:00');   // 00:00Z = 19:00 CDT the previous evening
    });
});

describe('toEpochMs', () => {
    it('absolute instants: epoch digits and offset/Z ISO strings', () => {
        expect(toEpochMs(String(Date.UTC(2026, 5, 17, 14)), 'UTC')).toBe(Date.UTC(2026, 5, 17, 14));
        expect(toEpochMs('2026-06-17T14:00:00Z', 'America/Chicago')).toBe(Date.UTC(2026, 5, 17, 14));
        expect(toEpochMs('2026-06-17T14:00:00+02:00', 'UTC')).toBe(Date.UTC(2026, 5, 17, 12));
    });
    it('naive datetimes and date-only strings are wall clock in the zone', () => {
        expect(toEpochMs('2026-06-17T09:00:00', 'UTC')).toBe(Date.UTC(2026, 5, 17, 9));
        expect(toEpochMs('2026-06-17T09:00:00', 'America/Chicago')).toBe(Date.UTC(2026, 5, 17, 14));  // CDT = UTC-5
        expect(toEpochMs('2026-06-17', 'UTC')).toBe(Date.UTC(2026, 5, 17));
    });
    it('empty / unparseable -> null', () => {
        expect(toEpochMs('', 'UTC')).toBeNull();
        expect(toEpochMs('not-a-date', 'UTC')).toBeNull();
    });
});

// Helpers for layout tests: a 24h UTC window on 2026-06-17.
const win: TimeScale = { startMs: Date.UTC(2026, 5, 17), endMs: Date.UTC(2026, 5, 18), pxPerHour: 60 };
const ev = (o: Partial<TimelineEvent>): TimelineEvent =>
    ({ id: 'e', resourceId: 'm1', title: 'T', start: '2026-06-17T08:00:00Z', ...o });

describe('layoutRowBars', () => {
    it('filters to the row, clamps to the window and flags continuation', () => {
        const bars = layoutRowBars([
            ev({ id: 'a', start: '2026-06-17T08:00:00Z', end: '2026-06-17T10:00:00Z' }),
            ev({ id: 'other-row', resourceId: 'm2' }),
            ev({ id: 'outside', start: '2026-06-18T08:00:00Z', end: '2026-06-18T09:00:00Z' }),
            ev({ id: 'spans-in', start: '2026-06-16T20:00:00Z', end: '2026-06-17T04:00:00Z' })
        ], 'm1', win, 'UTC');
        expect(bars.map((b) => b.event.id)).toEqual(['spans-in', 'a']);
        expect(bars[0].startMs).toBe(win.startMs);        // clamped
        expect(bars[0].continuesLeft).toBe(true);
        expect(bars[1].continuesLeft).toBe(false);
    });

    it('a bar without an end runs the default duration', () => {
        const bars = layoutRowBars([ev({ end: undefined })], 'm1', win, 'UTC');
        expect(bars[0].endMs - bars[0].startMs).toBe(60 * 60000);
    });

    it('packs transitively-overlapping bars into lanes', () => {
        const bars = layoutRowBars([
            ev({ id: 'a', start: '2026-06-17T08:00:00Z', end: '2026-06-17T11:00:00Z' }),
            ev({ id: 'b', start: '2026-06-17T09:00:00Z', end: '2026-06-17T10:00:00Z' }),
            ev({ id: 'c', start: '2026-06-17T10:30:00Z', end: '2026-06-17T12:00:00Z' }),
            ev({ id: 'solo', start: '2026-06-17T14:00:00Z', end: '2026-06-17T15:00:00Z' })
        ], 'm1', win, 'UTC');
        const byId = Object.fromEntries(bars.map((b) => [b.event.id, b]));
        expect(byId.a.lane).toBe(0);
        expect(byId.b.lane).toBe(1);          // overlaps a
        expect(byId.c.lane).toBe(1);          // overlaps a only; reuses b's freed lane
        expect(byId.a.lanes).toBe(2);         // cluster width
        expect(byId.solo.lanes).toBe(1);      // separate cluster
    });

    it('excludes state/background displays', () => {
        const bars = layoutRowBars([
            ev({ id: 's', display: 'state' }), ev({ id: 'g', display: 'background' }), ev({ id: 'b' })
        ], 'm1', win, 'UTC');
        expect(bars.map((b) => b.event.id)).toEqual(['b']);
    });
});

describe('layoutRowBands', () => {
    it('selects one display kind, in start order', () => {
        const states = layoutRowBands([
            ev({ id: 's2', display: 'state', start: '2026-06-17T10:00:00Z', end: '2026-06-17T12:00:00Z' }),
            ev({ id: 's1', display: 'state', start: '2026-06-17T06:00:00Z', end: '2026-06-17T10:00:00Z' }),
            ev({ id: 'bar' })
        ], 'm1', 'state', win, 'UTC');
        expect(states.map((b) => b.event.id)).toEqual(['s1', 's2']);
    });

    it('an ongoing state (no end) runs to the window edge', () => {
        const states = layoutRowBands([ev({ display: 'state', end: undefined })], 'm1', 'state', win, 'UTC');
        expect(states[0].endMs).toBe(win.endMs);
        expect(states[0].continuesRight).toBe(false);   // no known end -> not flagged
    });
});

describe('buildRows', () => {
    it('renders resources in order with group headers on group change', () => {
        const rows = buildRows([
            { id: 'm1', label: 'Mixer 1', group: 'Line 1' },
            { id: 'm2', label: 'Mixer 2', group: 'Line 1' },
            { id: 'p1', label: 'Packer 1', group: 'Line 2' }
        ]);
        expect(rows.map((r) => `${r.type}:${r.label}`)).toEqual([
            'group:Line 1', 'resource:Mixer 1', 'resource:Mixer 2',
            'group:Line 2', 'resource:Packer 1'
        ]);
    });

    it('collapsed groups keep their header (flagged, with a hidden count) but drop their rows', () => {
        const rows = buildRows([
            { id: 'm1', label: 'Mixer 1', group: 'Line 1' },
            { id: 'm2', label: 'Mixer 2', group: 'Line 1' },
            { id: 'p1', label: 'Packer 1', group: 'Line 2' },
            { id: 'solo', label: 'Solo' }
        ], new Set(['Line 1']));
        expect(rows.map((r) => `${r.type}:${r.label}`)).toEqual([
            'group:Line 1', 'group:Line 2', 'resource:Packer 1', 'resource:Solo'
        ]);
        expect(rows[0]).toMatchObject({ collapsed: true, hiddenCount: 2, group: 'Line 1' });
        expect(rows[1]).toMatchObject({ collapsed: false });
    });

    it('collapse is keyed on the group name: a split group collapses in every section', () => {
        const rows = buildRows([
            { id: 'a', label: 'A', group: 'G' },
            { id: 'x', label: 'X', group: 'Other' },
            { id: 'b', label: 'B', group: 'G' }
        ], new Set(['G']));
        expect(rows.map((r) => `${r.type}:${r.label}`)).toEqual([
            'group:G', 'group:Other', 'resource:X', 'group:G'
        ]);
        expect(rows[0].hiddenCount).toBe(1);
        expect(rows[3].hiddenCount).toBe(1);
    });

    it('ungrouped resources get no header; label falls back to id; empty ids drop', () => {
        const rows = buildRows([
            { id: 'a', label: '' },
            { id: '', label: 'ghost' },
            { id: 'b', label: 'B', group: 'G' }
        ] as any);
        expect(rows.map((r) => `${r.type}:${r.label}`)).toEqual(['resource:a', 'group:G', 'resource:B']);
    });
});

describe('timelineEventsToCsv', () => {
    it('serialises one row per event with RFC-4180 quoting', () => {
        const csv = timelineEventsToCsv([
            { id: 'a', resourceId: 'm1', title: 'Job, "special"', start: '2026-07-03T08:00:00', end: '2026-07-03T10:00:00', category: 'prod' },
            { id: 'b', resourceId: 'm2', title: 'Shift', start: '2026-06-01T06:00:00', rrule: { freq: 'daily' } }
        ]);
        const lines = csv.split('\r\n');
        expect(lines[0]).toBe('id,resourceId,title,start,end,category,status,display,color,description,rrule');
        expect(lines[1]).toContain('"Job, ""special"""');
        expect(lines[2]).toContain('"{""freq"":""daily""}"');
        expect(lines).toHaveLength(3);
    });

    it('guards formula-looking cells against CSV injection', () => {
        const csv = timelineEventsToCsv([
            { id: '=1+1', resourceId: 'm1', title: '=SUM(A1:A9)', start: '2026-07-03T08:00:00', description: '+cmd, run' },
            { id: 'b', resourceId: 'm2', title: '@import', start: '2026-07-03T08:00:00', category: '-x' }
        ]);
        const lines = csv.split('\r\n');
        expect(lines[1]).toContain("'=1+1");
        expect(lines[1]).toContain("'=SUM(A1:A9)");
        expect(lines[1]).toContain('"\'+cmd, run"');   // guard first, then RFC quoting
        expect(lines[2]).toContain("'@import");
        expect(lines[2]).toContain("'-x");
        expect(lines[2]).toContain('m2,');             // plain cells untouched
    });
});

// shiftStartMinutes / parseShifts now live in shared/shifts.ts (adopted from the
// timeline's internal parser) — unit coverage is in shifts.test.ts; here we keep
// the timeline-level behaviour that consumes them.
describe('shift zoom', () => {
    it('shift ticks sit on the configured boundaries, labelled with the shift names', () => {
        const w: TimeScale = { startMs: Date.UTC(2026, 5, 17), endMs: Date.UTC(2026, 5, 18), pxPerHour: 60 };
        const shifts = [
            { label: 'Early', start: '06:00' }, { label: 'Late', start: '14:00' }, { label: 'Night', start: '22:00' }
        ];
        const { lower } = buildTicks(w, 'shift', 'UTC', 'en-US', shifts);
        expect(lower).toHaveLength(3);
        expect(lower.map((t) => t.px)).toEqual([6 * 60, 14 * 60, 22 * 60]);
        expect(lower[0].label).toContain('Early');
        expect(lower[2].label).toContain('Night');
    });

    it('shift boundaries follow the WALL clock across a DST day', () => {
        const CHI = 'America/Chicago';
        const anchor = toEpochMs('2026-03-08T00:00:00', CHI)!;   // 23h spring-forward day
        const w: TimeScale = { startMs: anchor, endMs: toEpochMs('2026-03-09T00:00:00', CHI)!, pxPerHour: 60 };
        const { lower } = buildTicks(w, 'shift', CHI, 'en-US', [{ label: 'Early', start: '06:00' }]);
        expect(lower).toHaveLength(1);
        // 06:00 wall on the 23h day is only 5 epoch-hours after midnight.
        expect(lower[0].px).toBe(5 * 60);
        expect(lower[0].label).toContain('06:00');
    });
});

describe('resolveSnapMinutes', () => {
    it('0 keeps each zoom preset\'s built-in snap', () => {
        expect(resolveSnapMinutes('hour', 0)).toBe(ZOOM_PRESETS.hour.snapMinutes);
        expect(resolveSnapMinutes('day', 0)).toBe(ZOOM_PRESETS.day.snapMinutes);
        expect(resolveSnapMinutes('shift', 0)).toBe(ZOOM_PRESETS.shift.snapMinutes);
        expect(resolveSnapMinutes('week', 0)).toBe(ZOOM_PRESETS.week.snapMinutes);
    });
    it('a positive override wins at every zoom', () => {
        expect(resolveSnapMinutes('hour', 30)).toBe(30);
        expect(resolveSnapMinutes('week', 30)).toBe(30);
        expect(resolveSnapMinutes('day', 1)).toBe(1);
        expect(resolveSnapMinutes('day', 7.5)).toBe(7.5);
    });
    it('invalid overrides (negative / NaN / infinite) fall back to the preset', () => {
        expect(resolveSnapMinutes('day', -15)).toBe(ZOOM_PRESETS.day.snapMinutes);
        expect(resolveSnapMinutes('day', NaN)).toBe(ZOOM_PRESETS.day.snapMinutes);
        expect(resolveSnapMinutes('day', Infinity)).toBe(ZOOM_PRESETS.day.snapMinutes);
    });
});

describe('windowOutputs', () => {
    it('emits ISO UTC instants plus their raw epoch-ms twins', () => {
        const out = windowOutputs(scale);
        expect(out.visibleStart).toBe('2026-06-17T00:00:00.000Z');
        expect(out.visibleEnd).toBe('2026-06-18T00:00:00.000Z');
        expect(out.visibleStartMs).toBe(scale.startMs);
        expect(out.visibleEndMs).toBe(scale.endMs);
        // The two representations name the same instants.
        expect(Date.parse(out.visibleStart)).toBe(out.visibleStartMs);
        expect(Date.parse(out.visibleEnd)).toBe(out.visibleEndMs);
    });
});

describe('barGeom', () => {
    it('floors the rendered width so short bars stay grabbable', () => {
        expect(barGeom(100, 101)).toEqual({ left: 100, width: MIN_BAR_PX, showHandles: false });
        expect(barGeom(100, 400)).toEqual({ left: 100, width: 300, showHandles: true });
    });
    it('drops the edge handles when they would swallow the bar', () => {
        expect(barGeom(0, BAR_HANDLES_MIN_PX - 1).showHandles).toBe(false);
        expect(barGeom(0, BAR_HANDLES_MIN_PX).showHandles).toBe(true);
    });
});

describe('follow-now (live) mode', () => {
    it('followTickMs: refreshSeconds when > 0, 60s fallback, 1s floor', () => {
        expect(followTickMs(30)).toBe(30000);
        expect(followTickMs(1)).toBe(1000);
        expect(followTickMs(0)).toBe(60000);       // unset -> one minute
        expect(followTickMs(-5)).toBe(60000);
        expect(followTickMs(0.2)).toBe(1000);      // clamped to the 1s minimum
    });

    it("followAnchorMs: day/week anchor on today's zone-local midnight (Today-button parity)", () => {
        const now = Date.UTC(2026, 5, 17, 14, 30);
        expect(followAnchorMs(now, 'day', 'UTC')).toBe(Date.UTC(2026, 5, 17));
        expect(followAnchorMs(now, 'week', 'UTC')).toBe(Date.UTC(2026, 5, 17));
        expect(followAnchorMs(now, 'shift', 'UTC')).toBe(Date.UTC(2026, 5, 17));
        // Zone-aware: 02:00Z on the 17th is still the evening of the 16th in Chicago.
        expect(followAnchorMs(Date.UTC(2026, 5, 17, 2), 'day', 'America/Chicago'))
            .toBe(Date.UTC(2026, 5, 16, 5));   // 2026-06-16T00:00 CDT
    });

    it('followAnchorMs: hour zoom pages forward from midnight until the window contains now', () => {
        // 8h span: pages anchor at 00 / 08 / 16.
        expect(followAnchorMs(Date.UTC(2026, 5, 17, 3), 'hour', 'UTC')).toBe(Date.UTC(2026, 5, 17));
        expect(followAnchorMs(Date.UTC(2026, 5, 17, 14, 30), 'hour', 'UTC')).toBe(Date.UTC(2026, 5, 17, 8));
        expect(followAnchorMs(Date.UTC(2026, 5, 17, 23), 'hour', 'UTC')).toBe(Date.UTC(2026, 5, 17, 16));
        // Exactly on a page boundary: the half-open window starts there.
        expect(followAnchorMs(Date.UTC(2026, 5, 17, 8), 'hour', 'UTC')).toBe(Date.UTC(2026, 5, 17, 8));
    });

    it('followDisarms: paging and mini-nav picks disarm; Today / zoom / legend / edits do not', () => {
        expect(followDisarms('page')).toBe(true);
        expect(followDisarms('miniPick')).toBe(true);
        expect(followDisarms('today')).toBe(false);
        expect(followDisarms('zoom')).toBe(false);
        expect(followDisarms('legend')).toBe(false);
        expect(followDisarms('edit')).toBe(false);
    });
});

describe('isConfiguredEmpty', () => {
    const e = [{ id: 'e1' }];
    it('true only when both sources are empty and not loading', () => {
        expect(isConfiguredEmpty(false, [], [])).toBe(true);
        expect(isConfiguredEmpty(false, e, [])).toBe(false);
        expect(isConfiguredEmpty(false, [], e)).toBe(false);   // a recurring series counts
        expect(isConfiguredEmpty(true, [], [])).toBe(false);   // loading suppresses the badge
    });
    it('tolerates missing arrays', () => {
        expect(isConfiguredEmpty(false, undefined as unknown as [], null as unknown as [])).toBe(true);
    });
});

describe('mapTimelineProps', () => {
    it('maps followNow (default off) and emptyMessage (default English badge text)', () => {
        const p = mapTimelineProps(stubReader({}));
        expect(p.followNow).toBe(false);
        expect(p.emptyMessage).toBe('No events');
        expect(p.labels.followNow).toBe('Live');
        expect(p.labels.emptyHintIntro).toContain('timeline');
        const q = mapTimelineProps(stubReader({ state: { followNow: true }, config: { emptyMessage: '', locale: 'fr' } }));
        expect(q.followNow).toBe(true);
        expect(q.emptyMessage).toBe('');            // explicit empty = badge off
        expect(q.labels.followNow).toBe('En direct');
    });

    it('applies defaults (day zoom, clamped rowHeight, empty arrays, English labels)', () => {
        const p = mapTimelineProps(stubReader({}));
        expect(p.zoom).toBe('day');
        expect(p.rowHeight).toBe(36);
        expect(p.showToolbar).toBe(true);
        expect(p.resources).toEqual([]);
        expect(p.events).toEqual([]);
        expect(p.labels.today).toBe('Today');
        expect(p.labels.zoomWeek).toBe('Week');
        expect(p.editable).toBe(false);
        expect(p.showExport).toBe(false);
        expect(p.weekStart).toBe('monday');
        expect(p.labels.previousMonth).toBe('Previous month');
        expect(mapTimelineProps(stubReader({ config: { weekStart: 'sunday', locale: 'fr' } })).weekStart).toBe('sunday');
        expect(mapTimelineProps(stubReader({ config: { locale: 'fr' } })).labels.previousMonth).toBe('Mois précédent');
    });

    it('sanitises zoom and rowHeight; maps resources and events', () => {
        const p = mapTimelineProps(stubReader({
            config: {
                zoom: 'quarter', rowHeight: 999,
                resources: [{ id: 'm1', group: 'Line 1' }, { label: 'no-id' }]
            },
            data: { events: [{ id: 'e1', resourceId: 'm1', title: 'Job', start: '2026-06-17T08:00:00', rrule: { freq: 'daily' } }] }
        }));
        expect(p.zoom).toBe('day');            // unknown -> default
        expect(p.rowHeight).toBe(120);         // clamped
        expect(p.resources).toEqual([{ id: 'm1', label: 'm1', group: 'Line 1', color: undefined, icon: undefined }]);
        expect(p.events[0]).toMatchObject({ id: 'e1', resourceId: 'm1', rrule: { freq: 'daily' } });
    });

    it('labels: config.locale selects the pack; materialized English does not shadow it', () => {
        const p = mapTimelineProps(stubReader({
            config: { locale: 'fr-BE', labels: { today: 'Today', zoomDay: 'Journée' } }
        }));
        expect(p.labels.today).toBe("Aujourd'hui");   // English default -> pack
        expect(p.labels.zoomDay).toBe('Journée');     // real override wins
        expect(p.labels.zoomWeek).toBe('Semaine');
    });

    it('labels: hover status badges localize like every other key', () => {
        const p = mapTimelineProps(stubReader({}));
        expect(p.labels.statusTentative).toBe('Tentative');
        expect(p.labels.statusCancelled).toBe('Cancelled');
        expect(p.labels.statusDone).toBe('Done');
        const q = mapTimelineProps(stubReader({ config: { locale: 'de', labels: { statusDone: 'Fertig' } } }));
        expect(q.labels.statusTentative).toBe('Vorläufig');   // pack
        expect(q.labels.statusDone).toBe('Fertig');           // override wins
    });

    it('snapMinutes: default 0 (per-zoom snap); positive kept; negative/invalid -> 0', () => {
        expect(mapTimelineProps(stubReader({})).snapMinutes).toBe(0);
        expect(mapTimelineProps(stubReader({ config: { snapMinutes: 30 } })).snapMinutes).toBe(30);
        expect(mapTimelineProps(stubReader({ config: { snapMinutes: 0 } })).snapMinutes).toBe(0);
        expect(mapTimelineProps(stubReader({ config: { snapMinutes: -10 } })).snapMinutes).toBe(0);
        expect(mapTimelineProps(stubReader({ config: { snapMinutes: 'coarse' } })).snapMinutes).toBe(0);
        expect(mapTimelineProps(stubReader({ config: { snapMinutes: NaN } })).snapMinutes).toBe(0);
    });

    it('shifts parse through shared/shifts with the same malformed-entry filtering as before', () => {
        const p = mapTimelineProps(stubReader({
            config: {
                shifts: [
                    { label: 'Early', start: '06:00' },
                    { label: 'Broken', start: '25:00' },   // invalid hour -> dropped
                    { label: 'NoStart' },                  // missing start -> dropped
                    null,                                  // null row -> dropped
                    { start: '14:00' }                     // label coerces to ''
                ]
            }
        }));
        expect(p.shifts).toEqual([{ label: 'Early', start: '06:00' }, { label: '', start: '14:00' }]);
        // Valid shifts still enable the 'shift' zoom; without them it falls back to day.
        expect(mapTimelineProps(stubReader({
            state: { zoom: 'shift' }, config: { shifts: [{ label: 'E', start: '06:00' }] }
        })).zoom).toBe('shift');
        expect(mapTimelineProps(stubReader({
            config: { zoom: 'shift', shifts: [{ label: 'Broken', start: '99:99' }] }
        })).zoom).toBe('day');
    });
});

describe('followScrollLeft (keep the now-line in the visible scroll)', () => {
    const { followScrollLeft } = require('../timeline/timelineLogic');
    const LABEL = 160;

    it('null while the line is comfortably visible', () => {
        // viewport shows content x 160..1034 (1058 wide, 24px edge margin)
        expect(followScrollLeft(0, 1058, LABEL, 500)).toBeNull();
        expect(followScrollLeft(0, 1058, LABEL, 1030)).toBeNull();
    });

    it('scrolls the line to ~60% of the time viewport when off to the right', () => {
        const t = followScrollLeft(0, 1058, LABEL, 1490) as number;
        expect(t).toBeCloseTo(1490 - LABEL - (1058 - LABEL) * 0.6, 5);
        // and the line is visible at the target
        expect(followScrollLeft(t, 1058, LABEL, 1490)).toBeNull();
    });

    it('scrolls back when off to the left, clamped at 0', () => {
        expect(followScrollLeft(800, 1058, LABEL, 300)).not.toBeNull();
        expect(followScrollLeft(800, 1058, LABEL, 100)).toBe(0);
    });

    it('hugging the right edge counts as out (margin)', () => {
        expect(followScrollLeft(0, 1058, LABEL, 1050)).not.toBeNull();
    });
});
