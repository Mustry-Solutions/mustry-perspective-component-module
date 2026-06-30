import { mapPickerProps } from '../pickerProps';
import { stubReader } from './_stubReader';

describe('mapPickerProps (datetime picker reducer)', () => {
    it('applies defaults when config/selection are empty', () => {
        const p = mapPickerProps(stubReader({}));
        expect(p.enabled).toBe(true);
        expect(p.display).toBe('inline');
        expect(p.popoverPlaceholder).toBe('Select dates');
        expect(p.popoverCloseOnSelect).toBe(true);
        expect(p.popoverDateFormat).toBe('DD/MM/YYYY');
        expect(p.showClear).toBe(true);
        expect(p.disableDates).toBe('past');
        expect(p.granularity).toBe('second');
        expect(p.weekStart).toBe('monday');
        expect(p.timezone).toBe('');
        expect(p.layout).toBe('auto');
        expect(p.minSpanDays).toBe(0);
        expect(p.maxSpanDays).toBe(0);
        expect(p.durationLabelThresholdHours).toBe(24);
        expect(p.compactBelowHeight).toBe(260);
        expect(p.compactBelowWidth).toBe(240);
        expect(p.twoMonthsAboveWidth).toBe(560);
        expect(p.showPresets).toBe(true);
        expect(p.presets).toEqual([]);
        expect(p.startDate).toBe('');
        expect(p.startTimeSec).toBe(0);
        expect(p.endTimeSec).toBe(86399);
        expect(p.labels.startTime).toBe('Start time');
        expect(p.labels.nextMonth).toBe('Next month');
    });

    it('reads grouped/nested config paths and overrides', () => {
        const p = mapPickerProps(stubReader({
            config: {
                display: 'popover',
                popover: { placeholder: 'Pick', closeOnSelect: false, dateFormat: 'YYYY-MM-DD' },
                dateBounds: { earliest: '2026-01-01', latest: '2026-12-31' },
                spanDays: { min: 1, max: 30 },
                breakpoints: { compactBelowHeight: 200, compactBelowWidth: 220, twoMonthsAboveWidth: 600 },
                granularity: 'minute', timezone: 'Europe/Brussels', layout: 'twoMonths',
                labels: { clear: 'Reset' }
            }
        }));
        expect(p.display).toBe('popover');
        expect(p.popoverPlaceholder).toBe('Pick');
        expect(p.popoverCloseOnSelect).toBe(false);
        expect(p.popoverDateFormat).toBe('YYYY-MM-DD');
        expect(p.earliestDate).toBe('2026-01-01');
        expect(p.latestDate).toBe('2026-12-31');
        expect(p.minSpanDays).toBe(1);
        expect(p.maxSpanDays).toBe(30);
        expect(p.compactBelowHeight).toBe(200);
        expect(p.compactBelowWidth).toBe(220);
        expect(p.twoMonthsAboveWidth).toBe(600);
        expect(p.granularity).toBe('minute');
        expect(p.timezone).toBe('Europe/Brussels');
        expect(p.layout).toBe('twoMonths');
        expect(p.labels.clear).toBe('Reset');
        expect(p.labels.startTime).toBe('Start time');   // untouched labels keep defaults
    });

    it('flattens preset items (rolling / calendar) with per-field defaults', () => {
        const p = mapPickerProps(stubReader({
            config: { presets: [
                { label: 'Last 7 days', type: 'rolling', rolling: { amount: 7, unit: 'days' } },
                { label: 'This month', type: 'calendar', calendar: { period: 'thisMonth' } },
                { label: 'Bare' }   // unknown type -> rolling defaults
            ] }
        }));
        expect(p.presets[0]).toEqual({ label: 'Last 7 days', type: 'rolling', amount: 7, unit: 'days', period: 'thisMonth' });
        expect(p.presets[1]).toEqual({ label: 'This month', type: 'calendar', amount: 0, unit: 'days', period: 'thisMonth' });
        expect(p.presets[2]).toEqual({ label: 'Bare', type: 'rolling', amount: 0, unit: 'days', period: 'thisMonth' });
    });

    it('reads the two-way selection values', () => {
        const p = mapPickerProps(stubReader({
            selection: { startDate: '2026-06-01', endDate: '2026-06-10', startTimeSec: 3600, endTimeSec: 7200 }
        }));
        expect(p.startDate).toBe('2026-06-01');
        expect(p.endDate).toBe('2026-06-10');
        expect(p.startTimeSec).toBe(3600);
        expect(p.endTimeSec).toBe(7200);
    });
});
