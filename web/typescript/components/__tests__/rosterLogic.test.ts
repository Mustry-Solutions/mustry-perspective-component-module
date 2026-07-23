import {
    addUserToDraft, normalizeRoster, removeUserFromDraft, rosterDraftEquals, rosterDraftFromItem
} from '../roster/rosterLogic';
import { reorder, reorderTarget, uniqueCopyName, validateName } from '../../shared/adminCommon';
import { displayName, filterUsers, hasContact, normalizeAdminUser } from '../../shared/adminUsers';

describe('normalizeRoster', () => {
    it('maps name and ordered users', () => {
        expect(normalizeRoster({ name: 'OnCall', users: ['a', 'b'] }))
            .toEqual({ name: 'OnCall', users: ['a', 'b'] });
    });
    it('defaults everything on bad input', () => {
        expect(normalizeRoster(null)).toEqual({ name: '', users: [] });
        expect(normalizeRoster({ users: 'nope' })).toEqual({ name: '', users: [] });
    });
});

describe('roster draft', () => {
    const item = normalizeRoster({ name: 'OnCall', users: ['a', 'b'] });
    it('copies (not aliases) the user list', () => {
        const d = rosterDraftFromItem(item);
        d.users.push('c');
        expect(item.users).toEqual(['a', 'b']);
    });
    it('equality is order-sensitive', () => {
        expect(rosterDraftEquals({ users: ['a', 'b'] }, { users: ['a', 'b'] })).toBe(true);
        expect(rosterDraftEquals({ users: ['a', 'b'] }, { users: ['b', 'a'] })).toBe(false);
    });
    it('addUserToDraft appends, refuses duplicates and blanks', () => {
        const d = rosterDraftFromItem(item);
        expect(addUserToDraft(d, 'c').users).toEqual(['a', 'b', 'c']);
        expect(addUserToDraft(d, 'a')).toBe(d);
        expect(addUserToDraft(d, '  ')).toBe(d);
    });
    it('removeUserFromDraft removes by index', () => {
        expect(removeUserFromDraft({ users: ['a', 'b', 'c'] }, 1).users).toEqual(['a', 'c']);
    });
});

describe('shared reorder helpers', () => {
    it('reorder moves an element and returns a new array', () => {
        const src = ['a', 'b', 'c', 'd'];
        expect(reorder(src, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
        expect(reorder(src, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
        expect(src).toEqual(['a', 'b', 'c', 'd']);
    });
    it('reorder is a no-op on same or invalid indices', () => {
        const src = ['a', 'b'];
        expect(reorder(src, 1, 1)).toBe(src);
        expect(reorder(src, 5, 0)).toBe(src);
    });
    it('reorderTarget maps drag distance to a clamped index', () => {
        expect(reorderTarget(1, 75, 40, 4)).toBe(3);
        expect(reorderTarget(1, -75, 40, 4)).toBe(0);
        expect(reorderTarget(1, 10, 40, 4)).toBe(1);
        expect(reorderTarget(0, -500, 40, 4)).toBe(0);
        expect(reorderTarget(3, 500, 40, 4)).toBe(3);
    });
});

describe('shared user directory helpers', () => {
    const users = [
        normalizeAdminUser({ username: 'jdoe', firstName: 'Jane', lastName: 'Doe', contactInfo: [{ contactType: 'email', value: 'j@x.com' }] }),
        normalizeAdminUser({ username: 'admin' }),
        normalizeAdminUser({ username: 'bob', firstName: 'Bob', contactInfo: [{ contactType: 'sms', value: '' }] })
    ];
    it('normalizes defensively', () => {
        expect(normalizeAdminUser(null).username).toBe('');
        expect(normalizeAdminUser({ roles: ['op', 7] }).roles).toEqual(['op', '7']);
    });
    it('displayName prefers the full name, falls back to username', () => {
        expect(displayName(users[0])).toBe('Jane Doe');
        expect(displayName(users[1])).toBe('admin');
    });
    it('hasContact requires a non-blank value', () => {
        expect(hasContact(users[0])).toBe(true);
        expect(hasContact(users[1])).toBe(false);
        expect(hasContact(users[2])).toBe(false); // blank sms value
    });
    it('filterUsers matches username or names, minus exclusions', () => {
        expect(filterUsers(users, 'jane', []).map((u) => u.username)).toEqual(['jdoe']);
        expect(filterUsers(users, '', ['admin']).map((u) => u.username)).toEqual(['jdoe', 'bob']);
        expect(filterUsers(users, 'DOE', []).map((u) => u.username)).toEqual(['jdoe']);
        expect(filterUsers(users, 'zzz', [])).toEqual([]);
    });
    it('validateName still guards create flows (shared move)', () => {
        expect(validateName('', ['a'], '')).toBe('empty');
        expect(validateName('a', ['a'], '')).toBe('duplicate');
        expect(validateName('a', ['a'], 'a')).toBeNull();
    });
});


describe('uniqueCopyName', () => {
    it('paren style appends (copy), then counts up', () => {
        expect(uniqueCopyName('Day Shift', [])).toBe('Day Shift (copy)');
        expect(uniqueCopyName('Day Shift', ['Day Shift (copy)'])).toBe('Day Shift (copy 2)');
        expect(uniqueCopyName('Day Shift', ['Day Shift (copy)', 'Day Shift (copy 2)'])).toBe('Day Shift (copy 3)');
    });
    it('dash style suits identifier-ish names (usernames)', () => {
        expect(uniqueCopyName('jdoe', [], 'dash')).toBe('jdoe-copy');
        expect(uniqueCopyName('jdoe', ['jdoe-copy'], 'dash')).toBe('jdoe-copy-2');
    });
});
