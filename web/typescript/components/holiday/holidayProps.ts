// Pure mapping from the component's PropertyTree to typed HolidayManagerProps.
import { PropReader } from '../../shared/propReader';
import { HolidayManagerLabels, holidayLabelBase } from '../../shared/labels/holiday';
import { HolidayItem, normalizeHoliday } from './holidayLogic';

export interface HolidayManagerProps {
    editable: boolean;
    allowCreate: boolean;
    allowDelete: boolean;
    locale: string;
    labels: HolidayManagerLabels;
    holidays: HolidayItem[];
    /** state.selectedHoliday (two-way) — the selected holiday's name. */
    selectedHoliday: string;
}

export function mapHolidayProps(tree: PropReader): HolidayManagerProps {
    const locale = tree.readString('config.locale', '');
    const base = holidayLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof HolidayManagerLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    return {
        editable: tree.readBoolean('config.editable', true),
        allowCreate: tree.readBoolean('config.allowCreate', true),
        allowDelete: tree.readBoolean('config.allowDelete', true),
        locale,
        labels: labels as unknown as HolidayManagerLabels,
        holidays: (tree.readArray('data.holidays', []) || []).map(normalizeHoliday),
        selectedHoliday: tree.readString('state.selectedHoliday', '')
    };
}
