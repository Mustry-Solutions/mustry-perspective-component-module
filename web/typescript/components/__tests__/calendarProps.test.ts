import { DEFAULT_LABELS, mapCalendarProps } from '../calendarProps';
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
        expect(p.emptyMessage).toBe('No events');
        expect(p.loading).toBe(false);
        expect(p.refetchDebounceMs).toBe(150);
        expect(p.categories).toEqual([]);
        expect(p.events).toEqual([]);
        expect(p.recurringEvents).toEqual([]);
        expect(p.labels).toEqual(DEFAULT_LABELS);   // full English label set by default
    });

    it('labels: individual keys override, the rest keep their English defaults', () => {
        const p = mapCalendarProps(stubReader({
            config: { labels: { today: "Aujourd'hui", allDayTime: 'journée', more: '+{n} autres' } }
        }));
        expect(p.labels.today).toBe("Aujourd'hui");
        expect(p.labels.allDayTime).toBe('journée');
        expect(p.labels.more).toBe('+{n} autres');
        expect(p.labels.month).toBe('Month');       // untouched keys fall back
        expect(p.labels.editEvent).toBe('Edit event');
    });

    it('labels: config.locale selects a built-in language pack', () => {
        const fr = mapCalendarProps(stubReader({ config: { locale: 'fr' } }));
        expect(fr.labels.today).toBe("Aujourd'hui");
        expect(fr.labels.month).toBe('Mois');
        expect(fr.labels.editEvent).toBe("Modifier l'événement");
        const de = mapCalendarProps(stubReader({ config: { locale: 'de-AT' } }));   // region variants match the base language
        expect(de.labels.today).toBe('Heute');
        expect(de.labels.doesNotRepeat).toBe('Wiederholt sich nicht');
        const xx = mapCalendarProps(stubReader({ config: { locale: 'xx-YY' } }));   // unknown -> English
        expect(xx.labels.today).toBe('Today');
    });

    it('labels: materialized English defaults do not shadow the locale pack', () => {
        const p = mapCalendarProps(stubReader({
            config: { locale: 'fr', labels: { today: 'Today', month: 'Mes' } }
        }));
        expect(p.labels.today).toBe("Aujourd'hui");   // English default -> pack
        expect(p.labels.month).toBe('Mes');           // real override wins
    });

    it('labels: an explicit config.labels key beats the locale pack', () => {
        const p = mapCalendarProps(stubReader({
            config: { locale: 'fr', labels: { today: 'NU!' } }
        }));
        expect(p.labels.today).toBe('NU!');       // override wins
        expect(p.labels.month).toBe('Mois');      // the rest stay French
    });

    it('reads loading + refetchDebounceMs (clamped to >= 0) and the separate recurringEvents source', () => {
        const p = mapCalendarProps(stubReader({
            config: { loading: true, refetchDebounceMs: -50 },
            data: { recurringEvents: [{ id: 'r1', title: 'Standup', start: '2026-06-01T09:00:00', rrule: { freq: 'weekly' } }] }
        }));
        expect(p.loading).toBe(true);
        expect(p.refetchDebounceMs).toBe(0);   // negative clamped
        expect(p.recurringEvents).toHaveLength(1);
        expect(p.recurringEvents[0].rrule).toEqual({ freq: 'weekly' });
    });

    it('accepts valid slotMinutes (divisors of 60) and rejects the rest', () => {
        const slot = (v: any) => mapCalendarProps(stubReader({ config: { slotMinutes: v } })).slotMinutes;
        expect(slot(15)).toBe(15);
        expect(slot(5)).toBe(5);
        expect(slot(30)).toBe(30);
        expect(slot(7)).toBe(60);    // not a divisor -> fallback
        expect(slot(0)).toBe(60);    // out of range -> fallback
        expect(slot(90)).toBe(60);   // > 60 -> fallback
    });

    it('reads a custom (or empty/opt-out) emptyMessage', () => {
        expect(mapCalendarProps(stubReader({ config: { emptyMessage: 'Nothing scheduled' } })).emptyMessage).toBe('Nothing scheduled');
        expect(mapCalendarProps(stubReader({ config: { emptyMessage: '' } })).emptyMessage).toBe('');
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
        expect(p.slotMinutes).toBe(60);   // default
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
