// Pure decision logic for the admin managers' shared draft/select/save/delete
// state machine — no DOM, node-tested (__tests__/adminManagerLogic.test.ts).
// The props/DOM half lives in shared/adminManagerBase.ts, which stays a thin
// shell over these decisions the way the gesture controllers stay thin over
// their geometry helpers.

import { validateName } from './adminCommon';

/** The state slice the machine owns (each manager's state extends it). */
export interface AdminDraftState<D> {
    /** The editable draft of the selected item (null = nothing selected). */
    draft: D | null;
    /** Which item key the draft belongs to (selection-change detection). */
    draftFor: string;
    /** Create flow: editing a brand-new item not yet on the gateway. */
    creating: boolean;
    /** The name under edit (rename for existing, initial name when creating). */
    nameDraft: string;
    /** Two-step Delete: the button is in its confirm step. */
    confirmingDelete: boolean;
}

/** How the machine reads a manager's item and draft types. */
export interface AdminItemAdapter<I, D> {
    /** The item's unique key (schedule/roster/holiday name, username). */
    keyOf(item: I): string;
    draftFromItem(item: I): D;
    emptyDraft(): D;
    draftEquals(a: D, b: D): boolean;
}

export type SyncDraftAction<D> =
    | { kind: 'none' }
    /** Nothing selected → drop the draft (and any armed delete). */
    | { kind: 'clear' }
    /** Selection changed, or bound data changed under a CLEAN draft →
     *  rebuild the draft (and disarm delete). */
    | { kind: 'reset'; draft: D; key: string }
    /** First draft for the current selection (leaves the rest alone). */
    | { kind: 'init'; draft: D; key: string };

/**
 * Keep the draft in step with props: a selection change always resets it; a
 * bound-data change only refreshes it while it is NOT dirty (an author's
 * polling binding must never clobber an operator's in-progress edit). The
 * create flow owns its draft entirely — props never touch it.
 */
export function syncDraftAction<I, D>(
    adapter: AdminItemAdapter<I, D>,
    state: Pick<AdminDraftState<D>, 'draft' | 'draftFor' | 'creating'>,
    item: I | null,
    dirty: boolean
): SyncDraftAction<D> {
    if (state.creating) {
        return { kind: 'none' };
    }
    if (!item) {
        return state.draft !== null ? { kind: 'clear' } : { kind: 'none' };
    }
    const key = adapter.keyOf(item);
    const fresh = adapter.draftFromItem(item);
    if (key !== state.draftFor || (state.draft !== null && !dirty && !adapter.draftEquals(state.draft, fresh))) {
        return { kind: 'reset', draft: fresh, key };
    }
    if (state.draft === null) {
        return { kind: 'init', draft: fresh, key };
    }
    return { kind: 'none' };
}

/**
 * Whether the draft differs from the bound item. Creating is always dirty;
 * `renameEnabled` folds the name draft in for the managers whose items
 * rename (schedules/holidays — roster names and usernames are fixed once
 * created).
 */
export function isDraftDirty<I, D>(
    adapter: AdminItemAdapter<I, D>,
    state: Pick<AdminDraftState<D>, 'draft' | 'draftFor' | 'creating' | 'nameDraft'>,
    item: I | null,
    renameEnabled: boolean
): boolean {
    if (state.creating) {
        return true;
    }
    if (!item || state.draft === null || adapter.keyOf(item) !== state.draftFor) {
        return false;
    }
    if (renameEnabled && state.nameDraft !== adapter.keyOf(item)) {
        return true;
    }
    return !adapter.draftEquals(state.draft, adapter.draftFromItem(item));
}

/**
 * Name validation for the machine: only the create flow (and renames, where
 * enabled) can introduce a name, so everything else is vacuously valid — a
 * fixed key always mirrors its own item.
 */
export function managerNameError(
    state: Pick<AdminDraftState<unknown>, 'creating' | 'nameDraft' | 'draftFor'>,
    renameEnabled: boolean,
    existingKeys: string[]
): 'empty' | 'duplicate' | null {
    if (!state.creating && !renameEnabled) {
        return null;
    }
    return validateName(state.nameDraft, existingKeys, state.creating ? '' : state.draftFor);
}

/**
 * Auto-select the first item only when the selection is EMPTY. A non-empty
 * key missing from the list is left alone — it may be a create or rename
 * racing the binding refetch, and stomping it would deselect the item the
 * user just saved.
 */
export function shouldAutoSelect(itemCount: number, creating: boolean, selectedKey: string): boolean {
    return itemCount > 0 && !creating && selectedKey === '';
}
