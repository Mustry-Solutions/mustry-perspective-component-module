// Pure roster logic for the Roster Manager — no DOM, node-tested.
//
// A roster is an ORDERED list of usernames: alarm notification pipelines walk
// it top-to-bottom, so order IS the escalation sequence. The gateway API
// (system.roster) is append-only — there is no reorder primitive — so the
// component reports the full desired ordered list on Save and the author's
// script reconciles (removeUsers + addUsers), see the RosterDemo reference
// script.

export interface RosterItem {
    name: string;
    /** Ordered usernames — index 0 is the first contact. */
    users: string[];
}

export function normalizeRoster(raw: any): RosterItem {
    const src = raw || {};
    return {
        name: src.name == null ? '' : String(src.name),
        users: Array.isArray(src.users) ? src.users.filter((u: any) => u != null).map((u: any) => String(u)) : []
    };
}

/** The roster draft is just its ordered user list. */
export interface RosterDraft {
    users: string[];
}

export function rosterDraftFromItem(item: RosterItem): RosterDraft {
    return { users: [...item.users] };
}

export function rosterDraftEquals(a: RosterDraft, b: RosterDraft): boolean {
    return a.users.length === b.users.length && a.users.every((u, i) => u === b.users[i]);
}

/** Append a user (the picker's contract: no duplicates, always at the end). */
export function addUserToDraft(draft: RosterDraft, username: string): RosterDraft {
    if (username.trim() === '' || draft.users.indexOf(username) >= 0) {
        return draft;
    }
    return { users: [...draft.users, username] };
}

export function removeUserFromDraft(draft: RosterDraft, index: number): RosterDraft {
    return { users: draft.users.filter((_, i) => i !== index) };
}
