// Pure mapping from the component's PropertyTree to typed ScheduleManagerProps.
import { PropReader } from '../../shared/propReader';
import { ScheduleManagerLabels, scheduleLabelBase } from '../../shared/labels/schedule';
import { clampHourWindow, normalizeSchedule, ScheduleItem } from './scheduleLogic';

export type FirstDayOfWeek = 'monday' | 'sunday';

export interface ScheduleManagerProps {
    firstDayOfWeek: FirstDayOfWeek;
    /** Display window of the day axis, whole hours (defaults 0..24). */
    dayStartHour: number;
    dayEndHour: number;
    /** Whether the grid is a paint surface with Save/Discard (default true). */
    editable: boolean;
    /** Show the create-schedule flow (default true; requires editable). */
    allowCreate: boolean;
    /** Show the two-step Delete button (default true; requires editable). */
    allowDelete: boolean;
    /** Paint/resize snapping in minutes (default 30). */
    snapMinutes: number;
    locale: string;
    labels: ScheduleManagerLabels;
    schedules: ScheduleItem[];
    /** state.selectedSchedule (two-way) — the selected schedule's name. */
    selectedSchedule: string;
}

export function mapScheduleProps(tree: PropReader): ScheduleManagerProps {
    const locale = tree.readString('config.locale', '');
    const base = scheduleLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof ScheduleManagerLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    const [dayStartHour, dayEndHour] = clampHourWindow(
        tree.readNumber('config.dayStartHour', 0),
        tree.readNumber('config.dayEndHour', 24)
    );

    return {
        firstDayOfWeek: tree.readString('config.firstDayOfWeek', 'monday') === 'sunday' ? 'sunday' : 'monday',
        dayStartHour,
        dayEndHour,
        editable: tree.readBoolean('config.editable', true),
        allowCreate: tree.readBoolean('config.allowCreate', true),
        allowDelete: tree.readBoolean('config.allowDelete', true),
        snapMinutes: Math.max(5, Math.min(240, tree.readNumber('config.snapMinutes', 30))),
        locale,
        labels: labels as unknown as ScheduleManagerLabels,
        schedules: (tree.readArray('data.schedules', []) || []).map(normalizeSchedule),
        selectedSchedule: tree.readString('state.selectedSchedule', '')
    };
}
