import { normalizeAdminUser } from '../../shared/adminUsers';
import {
    addContact, emptyUserDraft, removeContact, toggleRole, updateContact, userDraftEquals,
    userDraftFromItem, userDraftToFlat
} from '../users/userLogic';

const item = () => normalizeAdminUser({
    username: 'jdoe', firstName: 'Jane', lastName: 'Doe', schedule: 'Always',
    roles: ['Operator', 'Admin'],
    contactInfo: [{ contactType: 'email', value: 'j@x.com' }]
});

describe('user draft lifecycle', () => {
    it('copies the item without aliasing', () => {
        const d = userDraftFromItem(item());
        d.roles.push('X');
        d.contactInfo[0].value = 'changed';
        const fresh = userDraftFromItem(item());
        expect(fresh.roles).toEqual(['Operator', 'Admin']);
        expect(fresh.contactInfo[0].value).toBe('j@x.com');
    });
    it('equality ignores role order but not contact order', () => {
        const a = userDraftFromItem(item());
        const b = userDraftFromItem(item());
        b.roles = ['Admin', 'Operator'];
        expect(userDraftEquals(a, b)).toBe(true);
        b.contactInfo = [{ contactType: 'sms', value: '1' }];
        expect(userDraftEquals(a, b)).toBe(false);
    });
    it('a pending password makes the draft dirty', () => {
        const a = userDraftFromItem(item());
        const b = userDraftFromItem(item());
        b.password = 'NewPass-1!';
        expect(userDraftEquals(a, b)).toBe(false);
    });
});

describe('draft operations', () => {
    it('toggleRole adds and removes', () => {
        const d = userDraftFromItem(item());
        expect(toggleRole(d, 'Viewer').roles).toContain('Viewer');
        expect(toggleRole(d, 'Admin').roles).toEqual(['Operator']);
    });
    it('contact add/update/remove are positional and immutable', () => {
        let d = emptyUserDraft();
        d = addContact(d, 'email');
        d = addContact(d, 'sms');
        d = updateContact(d, 1, { value: '+316' });
        expect(d.contactInfo).toEqual([
            { contactType: 'email', value: '' }, { contactType: 'sms', value: '+316' }
        ]);
        expect(removeContact(d, 0).contactInfo).toEqual([{ contactType: 'sms', value: '+316' }]);
    });
});

describe('userDraftToFlat', () => {
    it('trims the username, keeps roles, drops blank contact rows', () => {
        let d = userDraftFromItem(item());
        d = addContact(d, 'sms'); // left blank on purpose
        const flat = userDraftToFlat('  jdoe ', d);
        expect(flat.username).toBe('jdoe');
        expect(flat.roles).toEqual(['Operator', 'Admin']);
        expect(flat.contactInfo).toEqual([{ contactType: 'email', value: 'j@x.com' }]);
    });
    it('never includes the password in the user object', () => {
        const d = userDraftFromItem(item());
        d.password = 'Secret-1!';
        expect('password' in userDraftToFlat('jdoe', d)).toBe(false);
    });
});
