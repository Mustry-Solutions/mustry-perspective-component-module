import { stubReader } from './_stubReader';
import { mapScheduleProps } from '../schedule/scheduleProps';

describe('mapScheduleProps', () => {
    it('supplies defaults on an empty tree', () => {
        const p = mapScheduleProps(stubReader({}));
        expect(p.firstDayOfWeek).toBe('monday');
        expect(p.dayStartHour).toBe(0);
        expect(p.dayEndHour).toBe(24);
        expect(p.schedules).toEqual([]);
        expect(p.selectedSchedule).toBe('');
        expect(p.labels.listHeader).toBe('Schedules');
    });

    it('normalizes bound schedules from the flat bean mirror', () => {
        const p = mapScheduleProps(stubReader({
            data: { schedules: [{ name: 'Days', monday: true, mondayTime: '8:00-17:00' }] }
        }));
        expect(p.schedules).toHaveLength(1);
        expect(p.schedules[0].days.monday).toEqual({ enabled: true, time: '8:00-17:00' });
    });

    it('clamps a nonsensical hour window to the full day', () => {
        const p = mapScheduleProps(stubReader({ config: { dayStartHour: 20, dayEndHour: 6 } }));
        expect([p.dayStartHour, p.dayEndHour]).toEqual([0, 24]);
    });

    it('resolves locale packs with per-key overrides winning', () => {
        const p = mapScheduleProps(stubReader({
            config: { locale: 'fr-FR', labels: { activeNow: 'En service' } }
        }));
        expect(p.labels.listHeader).toBe('Horaires');   // from the fr pack
        expect(p.labels.activeNow).toBe('En service');  // per-key override wins
    });

    it('falls back to sane enum values', () => {
        const p = mapScheduleProps(stubReader({ config: { firstDayOfWeek: 'wednesday' } }));
        expect(p.firstDayOfWeek).toBe('monday');
    });
});
