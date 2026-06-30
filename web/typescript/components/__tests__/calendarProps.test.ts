import { mapCalendarProps } from '../calendarProps';
import { stubReader } from './_stubReader';

describe('mapCalendarProps (calendar reducer)', () => {
    it('applies defaults when config/data are empty', () => {
        const p = mapCalendarProps(stubReader({}));
        expect(p.view).toBe('month');
        expect(p.showToolbar).toBe(true);
        expect(p.showMiniNav).toBe(true);
        expect(p.showExport).toBe(false);
        expect(p.showLegend).toBe(true);
        expect(p.editable).toBe(false);
        expect(p.selectable).toBe(false);
        expect(p.builtInEditor).toBe(false);
        expect(p.weekStart).toBe('monday');
        expect(p.locale).toBe('');
        expect(p.timezone).toBe('');
        expect(p.showWeekends).toBe(true);
        expect(p.dayStartHour).toBe(0);
        expect(p.dayEndHour).toBe(24);
        expect(p.scrollToHour).toBe(7);
        expect(p.scrollToNow).toBe(false);
        expect(p.refreshSeconds).toBe(0);
        expect(p.categories).toEqual([]);
        expect(p.events).toEqual([]);
    });

    it('reads config overrides', () => {
        const p = mapCalendarProps(stubReader({
            config: { view: 'week', editable: true, selectable: true, builtInEditor: true,
                timezone: 'America/Chicago', dayStartHour: 6, dayEndHour: 20,
                scrollToNow: true, refreshSeconds: 60, showWeekends: false, weekStart: 'sunday' }
        }));
        expect(p.view).toBe('week');
        expect(p.editable).toBe(true);
        expect(p.selectable).toBe(true);
        expect(p.builtInEditor).toBe(true);
        expect(p.timezone).toBe('America/Chicago');
        expect(p.dayStartHour).toBe(6);
        expect(p.dayEndHour).toBe(20);
        expect(p.scrollToNow).toBe(true);
        expect(p.refreshSeconds).toBe(60);
        expect(p.showWeekends).toBe(false);
        expect(p.weekStart).toBe('sunday');
    });

    it('maps categories: label falls back to id, entries without an id are dropped', () => {
        const p = mapCalendarProps(stubReader({
            config: { categories: [
                { id: 'ops', label: 'Operations', color: '#0c7bb3', icon: 'material/settings' },
                { id: 'x', color: '#ffffff' },     // no label -> id
                { color: '#000000' }               // no id -> filtered
            ] }
        }));
        expect(p.categories).toEqual([
            { id: 'ops', label: 'Operations', color: '#0c7bb3', icon: 'material/settings' },
            { id: 'x', label: 'x', color: '#ffffff', icon: undefined }
        ]);
    });

    it('maps events: coerces start, drops empty end, keeps rrule only with a freq', () => {
        const p = mapCalendarProps(stubReader({
            data: { events: [
                { id: '1', title: 'A', start: 1782655200000 },                    // epoch -> string
                { id: '2', title: 'B', start: '2026-06-24T09:00:00', end: '2026-06-24T10:00:00',
                  color: '#fff', category: 'ops', status: 'done', description: 'n',
                  display: 'background', rrule: { freq: 'daily', exdate: ['2026-06-25'] } },
                { id: '3', title: 'C', start: '2026-06-24', rrule: { interval: 2 } }  // no freq -> undefined
            ] }
        }));
        expect(p.events[0].start).toBe('1782655200000');
        expect(p.events[0].end).toBeUndefined();
        expect(p.events[0].allDay).toBe(false);
        expect(p.events[1].rrule).toEqual({ freq: 'daily', exdate: ['2026-06-25'] });
        expect(p.events[1].display).toBe('background');
        expect(p.events[1].status).toBe('done');
        expect(p.events[2].rrule).toBeUndefined();
    });
});
