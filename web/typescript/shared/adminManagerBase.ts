// The master-detail state machine shared by the admin family (Schedule /
// Roster / User / Holiday Managers): each of the four implemented the same
// draft/select/save/delete lifecycle by hand, differing only in collection,
// key field, draft factory and event names. Same call as
// shared/controlledDraftHost made for the editors — the base owns the machine,
// subclasses supply the wiring (a descriptor + two prop accessors) plus their
// genuinely component-specific edits (paint gestures, user picker, role
// editor, …). The machine's decisions are pure functions in
// shared/adminManagerLogic.ts (node-tested); this class is the thin
// props/DOM shell over them.

import { Component, ComponentProps, PlainObject } from '@inductiveautomation/perspective-client';
import { uniqueCopyName } from './adminCommon';
import {
    AdminDraftState, AdminItemAdapter, isDraftDirty, managerNameError, shouldAutoSelect, syncDraftAction
} from './adminManagerLogic';

/** How long the Delete button stays in its confirm step before reverting. */
export const CONFIRM_DELETE_MS = 4000;

/** Static wiring a subclass supplies once. */
export interface AdminManagerDescriptor<I, D> extends AdminItemAdapter<I, D> {
    /** The two-way selection path, e.g. 'state.selectedSchedule'. */
    selectionPath: string;
    /** Delete event (footer + row menu), e.g. 'onScheduleDelete'. */
    deleteEvent: string;
    /** Payload field naming the item in the delete event ('name'/'username'). */
    deleteKeyField: string;
    /** Existing items rename via the name draft (schedules/holidays; roster
     *  names and usernames are fixed once created — no gateway rename API). */
    renameEnabled: boolean;
    /** Copy-name style for Duplicate ('dash' for identifier-ish usernames). */
    copyNameStyle: 'paren' | 'dash';
    /** output.validationErrors codes for the two name failures. */
    nameErrorCodes: { empty: string; duplicate: string };
}

export abstract class AdminManagerBase<I, D, P extends PlainObject, S extends AdminDraftState<D>>
    extends Component<ComponentProps<P>, S> {

    private confirmTimer: number | null = null;

    // --- subclass contract --------------------------------------------------
    protected abstract readonly descriptor: AdminManagerDescriptor<I, D>;
    /** The bound collection (e.g. `props.schedules`). */
    protected abstract items(): I[];
    /** The current two-way selection value (e.g. `props.selectedSchedule`). */
    protected abstract selectedKey(): string;
    /** Extra state cleared whenever the machine resets the draft (open
     *  pickers, gesture previews, …). */
    protected resetExtras(): Partial<S> {
        return {};
    }
    /** Key auto-selected when nothing is (holiday's rail is sorted). */
    protected firstSelectableKey(): string {
        return this.descriptor.keyOf(this.items()[0]);
    }
    /** Codes for output.validationErrors — subclasses append their own. */
    protected validationErrors(): string[] {
        const err = this.nameError();
        const codes = this.descriptor.nameErrorCodes;
        return err === null ? [] : [err === 'empty' ? codes.empty : codes.duplicate];
    }
    /** Whether Save is blocked — subclasses fold in their extra validity. */
    protected saveBlocked(): boolean {
        return this.nameError() !== null;
    }
    /** Extra output.* writes on every sync (e.g. schedule's isActiveNow). */
    protected writeExtraOutputs(): void { /* default none */ }

    // --- lifecycle (overriders with timers/gestures must call super) --------

    componentDidMount(): void {
        this.syncDraft();
        this.writeOutputs();
        this.ensureSelection();
    }

    componentDidUpdate(): void {
        this.syncDraft();
        this.writeOutputs();
        this.ensureSelection();
    }

    componentWillUnmount(): void {
        this.clearConfirmTimer();
    }

    // --- shared machinery ---------------------------------------------------

    /** setState for the machine's slice plus the subclass's reset extras
     *  (React merges partial state; the cast is the generic-setState hatch). */
    private patch(machine: Partial<AdminDraftState<D>>, extras?: Partial<S>): void {
        this.setState({ ...machine, ...extras } as unknown as S);
    }

    protected selected(): I | undefined {
        const key = this.selectedKey();
        return this.items().find((i) => this.descriptor.keyOf(i) === key);
    }

    protected isDirty(): boolean {
        return isDraftDirty(this.descriptor, this.state, this.selected() || null, this.descriptor.renameEnabled);
    }

    protected nameError(): 'empty' | 'duplicate' | null {
        return managerNameError(
            this.state, this.descriptor.renameEnabled, this.items().map((i) => this.descriptor.keyOf(i))
        );
    }

    /** Fire a component event for authors' event scripts (suppressed at design time). */
    protected fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    protected writeSelection(key: string): void {
        this.props.store.props.write(this.descriptor.selectionPath, key);
    }

    /** Keep the draft in step with props (decision logic in adminManagerLogic). */
    protected syncDraft(): void {
        const action = syncDraftAction(this.descriptor, this.state, this.selected() || null, this.isDirty());
        switch (action.kind) {
            case 'none':
                return;
            case 'clear':
                this.patch({ draft: null, draftFor: '', nameDraft: '', confirmingDelete: false }, this.resetExtras());
                return;
            case 'reset':
                this.patch(
                    { draft: action.draft, draftFor: action.key, nameDraft: action.key, confirmingDelete: false },
                    this.resetExtras()
                );
                return;
            case 'init':
                this.patch({ draft: action.draft, draftFor: action.key, nameDraft: action.key });
        }
    }

    protected writeOutputs(): void {
        const w = this.props.store.props;
        w.write('output.count', this.items().length);
        w.write('output.isDirty', this.isDirty());
        w.write('output.validationErrors', this.validationErrors());
        this.writeExtraOutputs();
    }

    protected ensureSelection(): void {
        if (shouldAutoSelect(this.items().length, this.state.creating, this.selectedKey())) {
            this.writeSelection(this.firstSelectableKey());
        }
    }

    // --- editing actions ----------------------------------------------------

    protected onSelect = (key: string): void => {
        if (this.state.creating) {
            this.patch({ creating: false, draft: null, draftFor: '', nameDraft: '' });
        }
        this.writeSelection(key);
    };

    /** Duplicate = the create flow prefilled from the source; Save fires the
     *  save event with isNew: true. */
    protected onDuplicate = (key: string): void => {
        const source = this.items().find((i) => this.descriptor.keyOf(i) === key);
        if (!source) {
            return;
        }
        this.clearConfirmTimer();
        this.patch({
            creating: true, draft: this.descriptor.draftFromItem(source), draftFor: '',
            nameDraft: uniqueCopyName(
                key, this.items().map((i) => this.descriptor.keyOf(i)), this.descriptor.copyNameStyle
            ),
            confirmingDelete: false
        }, this.resetExtras());
    };

    protected onMenuDelete = (key: string): void => {
        this.fireEvent(this.descriptor.deleteEvent, { [this.descriptor.deleteKeyField]: key });
        if (key === this.selectedKey()) {
            this.writeSelection('');
        }
    };

    protected onCreate = (): void => {
        this.clearConfirmTimer();
        this.patch({
            creating: true, draft: this.descriptor.emptyDraft(), draftFor: '', nameDraft: '',
            confirmingDelete: false
        }, this.resetExtras());
    };

    protected onDiscard = (): void => {
        if (this.state.creating) {
            this.patch({ creating: false, draft: null, draftFor: '', nameDraft: '', confirmingDelete: false }, this.resetExtras());
            return;
        }
        const item = this.selected();
        if (item) {
            const key = this.descriptor.keyOf(item);
            this.patch(
                { draft: this.descriptor.draftFromItem(item), draftFor: key, nameDraft: key, confirmingDelete: false },
                this.resetExtras()
            );
        }
    };

    /** Two-step Delete: first press arms the confirm step (reverting after
     *  CONFIRM_DELETE_MS), the second fires the delete event. */
    protected onDelete = (): void => {
        const item = this.selected();
        if (!item || this.state.creating) {
            return;
        }
        if (!this.state.confirmingDelete) {
            this.patch({ confirmingDelete: true });
            this.clearConfirmTimer();
            this.confirmTimer = window.setTimeout(() => this.patch({ confirmingDelete: false }), CONFIRM_DELETE_MS);
            return;
        }
        this.clearConfirmTimer();
        this.patch({ confirmingDelete: false });
        this.fireEvent(this.descriptor.deleteEvent, { [this.descriptor.deleteKeyField]: this.descriptor.keyOf(item) });
    };

    private clearConfirmTimer(): void {
        if (this.confirmTimer !== null) {
            window.clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
        }
    }

    // --- save helpers (onSave payloads stay per-subclass) -------------------

    /** The common Save gate: the draft when saving is allowed, else null. */
    protected saveableDraft(): D | null {
        const draft = this.state.draft;
        if (draft === null || this.saveBlocked() || !this.isDirty()) {
            return null;
        }
        return draft;
    }

    /** Create-flow Save epilogue: leave the flow and follow the new item —
     *  the refreshed binding will contain it and the draft re-syncs from there. */
    protected finishCreate(key: string): void {
        this.patch({ creating: false, draft: null, draftFor: '', nameDraft: '' });
        this.writeSelection(key);
    }
}
