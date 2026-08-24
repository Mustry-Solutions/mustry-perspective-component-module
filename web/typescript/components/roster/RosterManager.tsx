import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { reorder, uniqueCopyName, validateName } from '../../shared/adminCommon';
import { AdminUser } from '../../shared/adminUsers';
import {
    RosterDraft, RosterItem, addUserToDraft, removeUserFromDraft,
    rosterDraftEquals, rosterDraftFromItem
} from './rosterLogic';
import { ReorderGesture, ReorderPreview, RosterReorderController } from './rosterGestureController';
import { RosterManagerProps, mapRosterProps } from './rosterProps';
import { RowMenu } from '../../shared/RowMenu';
import { RosterUsers } from './RosterUsers';
import { UserPicker } from './UserPicker';
import { AdminFooter } from '../../shared/AdminFooter';

// Must match RosterManager.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.admin.rostermanager';

/** How long the Delete button stays in its confirm step before reverting. */
const CONFIRM_DELETE_MS = 4000;

interface RosterManagerState {
    draft: RosterDraft | null;
    /** Which roster name the draft belongs to (selection-change detection). */
    draftFor: string;
    /** Create flow: naming a brand-new roster not yet on the gateway. */
    creating: boolean;
    nameDraft: string;
    pickerOpen: boolean;
    preview: ReorderPreview | null;
    confirmingDelete: boolean;
}

/**
 * Roster Manager — second of the admin family. Master-detail over the
 * gateway's alarm rosters (data.rosters + a data.availableUsers directory,
 * bound via system.roster.getRosters() / system.user.getUsers()): the user
 * list is ORDERED (it's the escalation sequence — rows carry "Contact N"),
 * reordered by dragging a row's grip, extended through a typeahead directory
 * picker, and rows warn when a user has no contact info. Edits stay
 * draft-only until Save fires onRosterSave {name, users, isNew} — the
 * author's script reconciles via system.roster (removeUsers + addUsers;
 * the API is append-only, so ordering is re-written wholesale). Controlled
 * throughout; selection is two-way via state.selectedRoster.
 */
export class RosterManager extends Component<ComponentProps<RosterManagerProps>, RosterManagerState> {

    private gestures: RosterReorderController;
    private confirmTimer: number | null = null;

    constructor(props: ComponentProps<RosterManagerProps>) {
        super(props);
        this.state = {
            draft: null, draftFor: '', creating: false, nameDraft: '',
            pickerOpen: false, preview: null, confirmingDelete: false
        };
        this.gestures = new RosterReorderController({
            setPreview: (p) => this.setState({ preview: p }),
            commit: this.onReorderCommit
        });
    }

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
        this.gestures.dispose();
        this.clearConfirmTimer();
    }

    // --- draft lifecycle ----------------------------------------------------

    private syncDraft(): void {
        if (this.state.creating) {
            return;
        }
        const item = this.selected();
        if (!item) {
            if (this.state.draft !== null) {
                this.setState({ draft: null, draftFor: '', nameDraft: '', confirmingDelete: false, pickerOpen: false });
            }
            return;
        }
        const selectionChanged = item.name !== this.state.draftFor;
        if (selectionChanged || (this.state.draft && !this.isDirty() && !rosterDraftEquals(this.state.draft, rosterDraftFromItem(item)))) {
            this.setState({
                draft: rosterDraftFromItem(item), draftFor: item.name, nameDraft: item.name,
                confirmingDelete: false, pickerOpen: false
            });
        } else if (this.state.draft === null) {
            this.setState({ draft: rosterDraftFromItem(item), draftFor: item.name, nameDraft: item.name });
        }
    }

    private isDirty(): boolean {
        if (this.state.creating) {
            return true;
        }
        const item = this.selected();
        if (!item || !this.state.draft || item.name !== this.state.draftFor) {
            return false;
        }
        return !rosterDraftEquals(this.state.draft, rosterDraftFromItem(item));
    }

    private nameError(): 'empty' | 'duplicate' | null {
        if (!this.state.creating) {
            return null; // existing rosters don't rename (no gateway API)
        }
        return validateName(this.state.nameDraft, this.props.props.rosters.map((r) => r.name), '');
    }

    // --- outputs / selection ------------------------------------------------

    private writeOutputs(): void {
        const w = this.props.store.props;
        const err = this.nameError();
        w.write('output.count', this.props.props.rosters.length);
        w.write('output.isDirty', this.isDirty());
        w.write('output.validationErrors', err === null ? [] : [err === 'empty' ? 'nameRequired' : 'nameTaken']);
    }

    /** Auto-select the first roster only when the selection is EMPTY (a
     *  just-created roster racing the refetch must not be deselected). */
    private ensureSelection(): void {
        const p = this.props.props;
        if (p.rosters.length === 0 || this.state.creating || p.selectedRoster !== '') {
            return;
        }
        this.props.store.props.write('state.selectedRoster', p.rosters[0].name);
    }

    private onSelect = (name: string): void => {
        if (this.state.creating) {
            this.setState({ creating: false, draft: null, draftFor: '', nameDraft: '' });
        }
        this.props.store.props.write('state.selectedRoster', name);
    };

    private selected(): RosterItem | undefined {
        const p = this.props.props;
        return p.rosters.find((r) => r.name === p.selectedRoster);
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    private directory(): { [username: string]: AdminUser } {
        const out: { [username: string]: AdminUser } = {};
        for (const u of this.props.props.availableUsers) {
            out[u.username] = u;
        }
        return out;
    }

    // --- editing actions ----------------------------------------------------

    private onDuplicate = (name: string): void => {
        const source = this.props.props.rosters.find((r) => r.name === name);
        if (!source) {
            return;
        }
        this.clearConfirmTimer();
        this.setState({
            creating: true, draft: { users: [...source.users] }, draftFor: '',
            nameDraft: uniqueCopyName(name, this.props.props.rosters.map((r) => r.name)),
            confirmingDelete: false, pickerOpen: false, preview: null
        });
    };

    private onMenuDelete = (name: string): void => {
        this.fireEvent('onRosterDelete', { name });
        if (name === this.props.props.selectedRoster) {
            this.props.store.props.write('state.selectedRoster', '');
        }
    };

    private onCreate = (): void => {
        this.clearConfirmTimer();
        this.setState({
            creating: true, draft: { users: [] }, draftFor: '', nameDraft: '',
            confirmingDelete: false, pickerOpen: false, preview: null
        });
    };

    private onReorderCommit = (_kind: 'reorder', _g: ReorderGesture, preview: ReorderPreview | null): void => {
        const draft = this.state.draft;
        if (!draft || !preview) {
            return;
        }
        this.setState({ draft: { users: reorder(draft.users, preview.fromIndex, preview.toIndex) } });
    };

    private onRemoveUser = (index: number): void => {
        if (this.state.draft) {
            this.setState({ draft: removeUserFromDraft(this.state.draft, index) });
        }
    };

    private onPickUser = (username: string): void => {
        if (this.state.draft) {
            this.setState({ draft: addUserToDraft(this.state.draft, username), pickerOpen: false });
        }
    };

    private onSave = (): void => {
        const draft = this.state.draft;
        if (!draft || this.nameError() !== null || !this.isDirty()) {
            return;
        }
        if (this.state.creating) {
            const name = this.state.nameDraft.trim();
            this.fireEvent('onRosterSave', { name, users: draft.users, isNew: true });
            this.setState({ creating: false, draft: null, draftFor: '', nameDraft: '' });
            this.props.store.props.write('state.selectedRoster', name);
            return;
        }
        const item = this.selected();
        if (item) {
            this.fireEvent('onRosterSave', { name: item.name, users: draft.users, isNew: false });
        }
    };

    private onDiscard = (): void => {
        if (this.state.creating) {
            this.setState({ creating: false, draft: null, draftFor: '', nameDraft: '', pickerOpen: false });
            return;
        }
        const item = this.selected();
        if (item) {
            this.setState({
                draft: rosterDraftFromItem(item), draftFor: item.name, nameDraft: item.name,
                confirmingDelete: false, pickerOpen: false
            });
        }
    };

    private onDelete = (): void => {
        const item = this.selected();
        if (!item || this.state.creating) {
            return;
        }
        if (!this.state.confirmingDelete) {
            this.setState({ confirmingDelete: true });
            this.clearConfirmTimer();
            this.confirmTimer = window.setTimeout(() => this.setState({ confirmingDelete: false }), CONFIRM_DELETE_MS);
            return;
        }
        this.clearConfirmTimer();
        this.setState({ confirmingDelete: false });
        this.fireEvent('onRosterDelete', { name: item.name });
    };

    private clearConfirmTimer(): void {
        if (this.confirmTimer !== null) {
            window.clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
        }
    }

    // --- render -------------------------------------------------------------

    private renderDetail(): React.ReactNode {
        const p = this.props.props;
        const creating = this.state.creating;
        const item = this.selected() || null;
        if (!item && !creating) {
            return (
                <div className="mustry-roster-detail mustry-roster-detail--empty">
                    {p.rosters.length === 0 ? p.labels.noRosters : p.labels.noSelection}
                </div>
            );
        }
        const draft = p.editable ? this.state.draft : null;
        const usernames = draft ? draft.users : (item ? item.users : []);
        const nameError = this.nameError();
        return (
            <div className="mustry-roster-detail">
                <div className="mustry-roster-detail-head">
                    {creating ? (
                        <span className="mustry-sched-name-wrap">
                            <input
                                className={'mustry-sched-name-input' + (nameError ? ' mustry-sched-name-input--invalid' : '')}
                                type="text"
                                value={this.state.nameDraft}
                                placeholder={p.labels.name}
                                aria-label={p.labels.name}
                                onChange={(e) => this.setState({ nameDraft: e.target.value })}
                            />
                            {nameError && (
                                <span className="mustry-sched-name-error">
                                    {nameError === 'empty' ? p.labels.nameRequired : p.labels.nameTaken}
                                </span>
                            )}
                        </span>
                    ) : (
                        <span className="mustry-roster-detail-name">{item ? item.name : ''}</span>
                    )}
                    {draft && (
                        <span className="mustry-roster-add-wrap">
                            <button
                                type="button"
                                className="mustry-roster-add"
                                onClick={() => this.setState({ pickerOpen: !this.state.pickerOpen })}
                            >
                                + {p.labels.addUser}
                            </button>
                            {this.state.pickerOpen && (
                                <UserPicker
                                    users={p.availableUsers}
                                    exclude={usernames}
                                    labels={p.labels}
                                    onPick={this.onPickUser}
                                    onClose={() => this.setState({ pickerOpen: false })}
                                />
                            )}
                        </span>
                    )}
                </div>
                <RosterUsers
                    usernames={usernames}
                    directory={this.directory()}
                    editable={!!draft}
                    gestures={draft ? this.gestures : null}
                    preview={this.state.preview}
                    labels={p.labels}
                    onRemove={this.onRemoveUser}
                />
                {draft && (
                    <AdminFooter
                        labels={p.labels}
                        enabled={nameError === null}
                        dirty={this.isDirty()}
                        onSave={this.onSave}
                        onDiscard={this.onDiscard}
                        showDelete={!creating && p.allowDelete}
                        deleteLabel={p.labels.delete}
                        confirmDeleteLabel={p.labels.confirmDelete}
                        confirmingDelete={this.state.confirmingDelete}
                        onDelete={this.onDelete}
                    />
                )}
            </div>
        );
    }

    render() {
        const p = this.props.props;
        return (
            <div {...this.props.emit({ classes: ['mustry-rostermgr'] })}>
                <div className="mustry-sched-list" role="listbox" aria-label={p.labels.listHeader}>
                    <div className="mustry-sched-list-header">
                        {p.labels.listHeader}
                        {p.editable && p.allowCreate && (
                            <button
                                type="button"
                                className={'mustry-sched-new' + (this.state.creating ? ' mustry-sched-new--active' : '')}
                                title={p.labels.newRoster}
                                onClick={this.onCreate}
                            >
                                + {p.labels.newRoster}
                            </button>
                        )}
                    </div>
                    {p.rosters.length === 0 && <div className="mustry-sched-empty">{p.labels.noRosters}</div>}
                    {p.rosters.map((r) => (
                        <div
                            key={r.name}
                            className={'mustry-sched-item' + (!this.state.creating && r.name === p.selectedRoster ? ' mustry-sched-item--selected' : '')}
                            role="option"
                            aria-selected={!this.state.creating && r.name === p.selectedRoster}
                            tabIndex={0}
                            onClick={() => this.onSelect(r.name)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onSelect(r.name); } }}
                        >
                            <span className="mustry-sched-item-text">
                                <span className="mustry-sched-item-name">{r.name}</span>
                                <span className="mustry-sched-item-desc">{r.users.length} · {r.users.slice(0, 3).join(', ')}{r.users.length > 3 ? '…' : ''}</span>
                            </span>
                            {p.editable && (p.allowCreate || p.allowDelete) && (
                                <RowMenu
                                    moreActionsLabel={`${p.labels.moreActions} r.name`}
                                    duplicateLabel={p.labels.duplicate}
                                    deleteLabel={p.labels.delete}
                                    confirmDeleteLabel={p.labels.confirmDelete}
                                    showDuplicate={p.allowCreate}
                                    showDelete={p.allowDelete}
                                    onDuplicate={() => this.onDuplicate(r.name)}
                                    onDelete={() => this.onMenuDelete(r.name)}
                                />
                            )}
                        </div>
                    ))}
                </div>
                {this.renderDetail()}
            </div>
        );
    }
}

export class RosterManagerMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return RosterManager as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 640, height: 400 };
    }

    getPropsReducer(tree: PropertyTree): RosterManagerProps {
        return mapRosterProps(tree);
    }
}
