// Pure mapping from the component's PropertyTree to typed RosterManagerProps.
import { PropReader } from '../../shared/propReader';
import { AdminUser, normalizeAdminUser } from '../../shared/adminUsers';
import { RosterManagerLabels, rosterLabelBase } from '../../shared/labels/roster';
import { RosterItem, normalizeRoster } from './rosterLogic';

export interface RosterManagerProps {
    editable: boolean;
    allowCreate: boolean;
    allowDelete: boolean;
    locale: string;
    labels: RosterManagerLabels;
    rosters: RosterItem[];
    /** The gateway user directory the picker draws from (data.availableUsers). */
    availableUsers: AdminUser[];
    /** state.selectedRoster (two-way) — the selected roster's name. */
    selectedRoster: string;
}

export function mapRosterProps(tree: PropReader): RosterManagerProps {
    const locale = tree.readString('config.locale', '');
    const base = rosterLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof RosterManagerLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    return {
        editable: tree.readBoolean('config.editable', true),
        allowCreate: tree.readBoolean('config.allowCreate', true),
        allowDelete: tree.readBoolean('config.allowDelete', true),
        locale,
        labels: labels as unknown as RosterManagerLabels,
        rosters: (tree.readArray('data.rosters', []) || []).map(normalizeRoster),
        availableUsers: (tree.readArray('data.availableUsers', []) || []).map(normalizeAdminUser),
        selectedRoster: tree.readString('state.selectedRoster', '')
    };
}
