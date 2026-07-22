import { normalizeAdminUser } from '../../shared/adminUsers';
import {
    addAdjustment, addContact, emptyUserDraft, inputToInstant, instantToInput, invalidAdjustments,
    removeAdjustment, removeContact, toggleRole, updateAdjustment, updateContact, userDraftEquals,
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


describe('schedule adjustments', () => {
    it('normalizes from the bound user and round-trips through the draft', () => {
        const u = normalizeAdminUser({
            username: 'x',
            scheduleAdjustments: [{ start: '2026-08-01 08:00', end: '2026-08-05 17:00', available: false, note: 'vacation' }]
        });
        const d = userDraftFromItem(u);
        expect(d.scheduleAdjustments).toEqual(u.scheduleAdjustments);
        expect(userDraftToFlat('x', d).scheduleAdjustments).toEqual(u.scheduleAdjustments);
    });
    it('an adjustment edit makes the draft dirty', () => {
        const u = normalizeAdminUser({ username: 'x' });
        const a = userDraftFromItem(u);
        const b = addAdjustment(userDraftFromItem(u));
        expect(userDraftEquals(a, b)).toBe(false);
    });
    it('add/update/remove are positional and immutable', () => {
        let d = addAdjustment(emptyUserDraft());
        d = updateAdjustment(d, 0, { start: '2026-08-01 08:00', end: '2026-08-02 08:00', note: 'cover' });
        expect(d.scheduleAdjustments[0].note).toBe('cover');
        expect(removeAdjustment(d, 0).scheduleAdjustments).toEqual([]);
    });
    it('all-blank rows are dropped on save, not saved empty', () => {
        const d = addAdjustment(emptyUserDraft());
        expect(userDraftToFlat('x', d).scheduleAdjustments).toEqual([]);
        expect(invalidAdjustments(d)).toEqual([]);
    });
    it('partially filled or inverted rows block save', () => {
        let d = addAdjustment(emptyUserDraft());
        d = updateAdjustment(d, 0, { note: 'oops' });
        expect(invalidAdjustments(d)).toEqual([0]);
        d = updateAdjustment(d, 0, { start: '2026-08-05 17:00', end: '2026-08-01 08:00' });
        expect(invalidAdjustments(d)).toEqual([0]); // inverted
        d = updateAdjustment(d, 0, { start: '2026-08-01 08:00', end: '2026-08-05 17:00' });
        expect(invalidAdjustments(d)).toEqual([]);
    });
    it('instant <-> datetime-local conversion round-trips', () => {
        expect(instantToInput('2026-08-01 08:00')).toBe('2026-08-01T08:00');
        expect(inputToInstant('2026-08-01T08:00')).toBe('2026-08-01 08:00');
        expect(inputToInstant('')).toBe('');
    });
});
