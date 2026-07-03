import {
    MS_PER_HOUR, TimeScale, ZOOM_PRESETS, buildRows, buildTicks, msToPx, pxToMs, scaleWidth
} from '../timeline/timelineLogic';
import { mapTimelineProps } from '../timeline/timelineProps';
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

    it('ungrouped resources get no header; label falls back to id; empty ids drop', () => {
        const rows = buildRows([
            { id: 'a', label: '' },
            { id: '', label: 'ghost' },
            { id: 'b', label: 'B', group: 'G' }
        ] as any);
        expect(rows.map((r) => `${r.type}:${r.label}`)).toEqual(['resource:a', 'group:G', 'resource:B']);
    });
});

describe('mapTimelineProps', () => {
    it('applies defaults (day zoom, clamped rowHeight, empty arrays, English labels)', () => {
        const p = mapTimelineProps(stubReader({}));
        expect(p.zoom).toBe('day');
        expect(p.rowHeight).toBe(36);
        expect(p.showToolbar).toBe(true);
        expect(p.resources).toEqual([]);
        expect(p.events).toEqual([]);
        expect(p.labels.today).toBe('Today');
        expect(p.labels.zoomWeek).toBe('Week');
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
});
