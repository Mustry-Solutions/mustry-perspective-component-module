import {
    AdminItemAdapter, isDraftDirty, managerNameError, shouldAutoSelect, syncDraftAction
} from '../../shared/adminManagerLogic';

// A minimal item/draft pair standing in for schedules/rosters/users/holidays.
interface Item { name: string; value: number; }
interface Draft { value: number; }

const adapter: AdminItemAdapter<Item, Draft> = {
    keyOf: (i) => i.name,
    draftFromItem: (i) => ({ value: i.value }),
    emptyDraft: () => ({ value: 0 }),
    draftEquals: (a, b) => a.value === b.value
};

const shifts: Item = { name: 'Shifts', value: 1 };

describe('syncDraftAction', () => {
    it('never touches the draft during the create flow', () => {
        expect(syncDraftAction(adapter, { draft: { value: 5 }, draftFor: '', creating: true }, shifts, true))
            .toEqual({ kind: 'none' });
        expect(syncDraftAction(adapter, { draft: null, draftFor: '', creating: true }, null, true))
            .toEqual({ kind: 'none' });
    });

    it('clears the draft when nothing is selected — but only once', () => {
        expect(syncDraftAction(adapter, { draft: { value: 1 }, draftFor: 'Shifts', creating: false }, null, false))
            .toEqual({ kind: 'clear' });
        // Already cleared: no action, or componentDidUpdate would loop on setState.
        expect(syncDraftAction(adapter, { draft: null, draftFor: '', creating: false }, null, false))
            .toEqual({ kind: 'none' });
    });

    it('resets the draft on a selection change, dirty or not', () => {
        const state = { draft: { value: 99 }, draftFor: 'Nights', creating: false };
        expect(syncDraftAction(adapter, state, shifts, true))
            .toEqual({ kind: 'reset', draft: { value: 1 }, key: 'Shifts' });
    });

    it('refreshes a CLEAN draft when the bound data changes (polling binding)', () => {
        const state = { draft: { value: 0 }, draftFor: 'Shifts', creating: false };
        expect(syncDraftAction(adapter, state, shifts, false))
            .toEqual({ kind: 'reset', draft: { value: 1 }, key: 'Shifts' });
    });

    it('never clobbers a DIRTY draft with a bound-data change', () => {
        const state = { draft: { value: 7 }, draftFor: 'Shifts', creating: false };
        expect(syncDraftAction(adapter, state, shifts, true)).toEqual({ kind: 'none' });
    });

    it('treats a first selection as a reset (draftFor is still empty)', () => {
        expect(syncDraftAction(adapter, { draft: null, draftFor: '', creating: false }, shifts, false))
            .toEqual({ kind: 'reset', draft: { value: 1 }, key: 'Shifts' });
    });

    it('re-inits a dropped draft without disturbing the rest of the state', () => {
        expect(syncDraftAction(adapter, { draft: null, draftFor: 'Shifts', creating: false }, shifts, false))
            .toEqual({ kind: 'init', draft: { value: 1 }, key: 'Shifts' });
    });

    it('is quiet in the steady state', () => {
        const state = { draft: { value: 1 }, draftFor: 'Shifts', creating: false };
        expect(syncDraftAction(adapter, state, shifts, false)).toEqual({ kind: 'none' });
    });
});

describe('isDraftDirty', () => {
    const clean = { draft: { value: 1 }, draftFor: 'Shifts', creating: false, nameDraft: 'Shifts' };

    it('creating is always dirty', () => {
        expect(isDraftDirty(adapter, { ...clean, creating: true, draft: null }, null, false)).toBe(true);
    });

    it('no item / no draft / stale draftFor are never dirty', () => {
        expect(isDraftDirty(adapter, clean, null, true)).toBe(false);
        expect(isDraftDirty(adapter, { ...clean, draft: null }, shifts, true)).toBe(false);
        expect(isDraftDirty(adapter, { ...clean, draftFor: 'Nights' }, shifts, true)).toBe(false);
    });

    it('compares the draft against the bound item', () => {
        expect(isDraftDirty(adapter, clean, shifts, false)).toBe(false);
        expect(isDraftDirty(adapter, { ...clean, draft: { value: 2 } }, shifts, false)).toBe(true);
    });

    it('folds the name draft in only where renames exist', () => {
        const renamed = { ...clean, nameDraft: 'Day shift' };
        expect(isDraftDirty(adapter, renamed, shifts, true)).toBe(true);
        expect(isDraftDirty(adapter, renamed, shifts, false)).toBe(false);
    });
});

describe('managerNameError', () => {
    const keys = ['Shifts', 'Nights'];

    it('is vacuously valid outside create for fixed-key managers', () => {
        expect(managerNameError({ creating: false, nameDraft: '', draftFor: 'Shifts' }, false, keys)).toBeNull();
    });

    it('validates the create flow', () => {
        expect(managerNameError({ creating: true, nameDraft: '  ', draftFor: '' }, false, keys)).toBe('empty');
        expect(managerNameError({ creating: true, nameDraft: 'Shifts', draftFor: '' }, false, keys)).toBe('duplicate');
        expect(managerNameError({ creating: true, nameDraft: 'Weekend', draftFor: '' }, false, keys)).toBeNull();
    });

    it('validates renames without clashing on the item\'s own name', () => {
        expect(managerNameError({ creating: false, nameDraft: 'Shifts', draftFor: 'Shifts' }, true, keys)).toBeNull();
        expect(managerNameError({ creating: false, nameDraft: 'Nights', draftFor: 'Shifts' }, true, keys)).toBe('duplicate');
        expect(managerNameError({ creating: false, nameDraft: '', draftFor: 'Shifts' }, true, keys)).toBe('empty');
    });
});

describe('shouldAutoSelect', () => {
    it('selects the first item only when the selection is empty', () => {
        expect(shouldAutoSelect(2, false, '')).toBe(true);
        expect(shouldAutoSelect(0, false, '')).toBe(false);
        expect(shouldAutoSelect(2, true, '')).toBe(false);
        // A key missing from the list may be a create/rename racing the
        // refetch — the machine leaves it alone rather than deselecting.
        expect(shouldAutoSelect(2, false, 'JustSaved')).toBe(false);
    });
});
