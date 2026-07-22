// Pure mapping from the component's PropertyTree to typed UserManagerProps.
import { PropReader } from '../../shared/propReader';
import { AdminUser, normalizeAdminUser } from '../../shared/adminUsers';
import { UserManagerLabels, userLabelBase } from '../../shared/labels/users';

export interface UserManagerProps {
    editable: boolean;
    allowCreate: boolean;
    allowDelete: boolean;
    /** Show the set-password field (payload-only; default OFF on purpose). */
    allowPasswordChange: boolean;
    /** Role-catalog CRUD in the Roles section (default OFF: renames/deletes
     *  ripple into security policies that reference roles by name). */
    allowRoleManagement: boolean;
    locale: string;
    labels: UserManagerLabels;
    users: AdminUser[];
    availableRoles: string[];
    availableSchedules: string[];
    /** state.selectedUser (two-way) — the selected user's username. */
    selectedUser: string;
}

export function mapUserProps(tree: PropReader): UserManagerProps {
    const locale = tree.readString('config.locale', '');
    const base = userLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof UserManagerLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    return {
        editable: tree.readBoolean('config.editable', true),
        allowCreate: tree.readBoolean('config.allowCreate', true),
        allowDelete: tree.readBoolean('config.allowDelete', true),
        allowPasswordChange: tree.readBoolean('config.allowPasswordChange', false),
        allowRoleManagement: tree.readBoolean('config.allowRoleManagement', false),
        locale,
        labels: labels as unknown as UserManagerLabels,
        users: (tree.readArray('data.users', []) || []).map(normalizeAdminUser),
        availableRoles: (tree.readArray('data.availableRoles', []) || []).map((r: any) => String(r)),
        availableSchedules: (tree.readArray('data.availableSchedules', []) || []).map((s: any) => String(s)),
        selectedUser: tree.readString('state.selectedUser', '')
    };
}
