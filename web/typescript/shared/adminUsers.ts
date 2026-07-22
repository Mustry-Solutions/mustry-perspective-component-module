// The admin family's shared view of a gateway user (Roster and User Managers
// both render user directories). Mirrors the PyUser properties the reference
// bindings map from system.user.getUsers(); item schemas stay open, so this
// normalizer is the single defensive entry point. Pure, node-tested.

export interface ContactInfo {
    /** Ignition contact types: 'email' | 'sms' | 'phone' (open set). */
    contactType: string;
    value: string;
}

/** A per-user schedule override (vacation, extra on-call cover, …).
 *  Instants serialize as 'YYYY-MM-DD HH:mm' on the wire. */
export interface ScheduleAdjustment {
    start: string;
    end: string;
    /** true = extra availability; false = time off (the common case). */
    available: boolean;
    note: string;
}

export interface AdminUser {
    username: string;
    firstName: string;
    lastName: string;
    schedule: string;
    language: string;
    notes: string;
    roles: string[];
    contactInfo: ContactInfo[];
    scheduleAdjustments: ScheduleAdjustment[];
}

export function normalizeAdminUser(raw: any): AdminUser {
    const src = raw || {};
    return {
        username: src.username == null ? '' : String(src.username),
        firstName: src.firstName == null ? '' : String(src.firstName),
        lastName: src.lastName == null ? '' : String(src.lastName),
        schedule: src.schedule == null ? '' : String(src.schedule),
        language: src.language == null ? '' : String(src.language),
        notes: src.notes == null ? '' : String(src.notes),
        roles: Array.isArray(src.roles) ? src.roles.map((r: any) => String(r)) : [],
        contactInfo: Array.isArray(src.contactInfo)
            ? src.contactInfo
                .filter((c: any) => c != null)
                .map((c: any) => ({
                    contactType: c.contactType == null ? '' : String(c.contactType),
                    value: c.value == null ? '' : String(c.value)
                }))
            : [],
        scheduleAdjustments: Array.isArray(src.scheduleAdjustments)
            ? src.scheduleAdjustments
                .filter((a: any) => a != null)
                .map((a: any) => ({
                    start: a.start == null ? '' : String(a.start),
                    end: a.end == null ? '' : String(a.end),
                    available: !!a.available,
                    note: a.note == null ? '' : String(a.note)
                }))
            : []
    };
}

/** "First Last", falling back to the username when no name is set. */
export function displayName(user: AdminUser): string {
    const full = `${user.firstName} ${user.lastName}`.trim();
    return full !== '' ? full : user.username;
}

/** Whether ANY notification pipeline could reach this user. */
export function hasContact(user: AdminUser): boolean {
    return user.contactInfo.some((c) => c.value.trim() !== '');
}

/**
 * Directory filter for pickers/lists: case-insensitive match on username or
 * name, minus an exclusion set (e.g. users already on the roster).
 */
export function filterUsers(users: AdminUser[], query: string, exclude: string[]): AdminUser[] {
    const q = query.trim().toLowerCase();
    const excluded = new Set(exclude);
    return users.filter((u) => {
        if (excluded.has(u.username)) {
            return false;
        }
        if (q === '') {
            return true;
        }
        return u.username.toLowerCase().includes(q)
            || u.firstName.toLowerCase().includes(q)
            || u.lastName.toLowerCase().includes(q);
    });
}
