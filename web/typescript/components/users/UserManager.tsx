import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { validateName } from '../../shared/adminCommon';
import { AdminUser, displayName, filterUsers } from '../../shared/adminUsers';
import { CommitControls } from '../../shared/CommitControls';
import {
    UserDraft, emptyUserDraft, userDraftEquals, userDraftFromItem, userDraftToFlat
} from './userLogic';
import { UserManagerProps, mapUserProps } from './userProps';
import { UserDetailForm } from './UserDetailForm';

// Must match UserManager.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.ingots.admin.usermanager';

/** How long the Delete button stays in its confirm step before reverting. */
const CONFIRM_DELETE_MS = 4000;

interface UserManagerState {
    draft: UserDraft | null;
    /** Which username the draft belongs to (selection-change detection). */
    draftFor: string;
    creating: boolean;
    usernameDraft: string;
    /** The rail's filter query (client-side, never persisted). */
    filter: string;
    confirmingDelete: boolean;
}

/**
 * User Manager — third of the admin family. Master-detail over a gateway
 * user source (data.users, the flat PyUser mirror bound via
 * system.user.getUsers(), plus data.availableRoles / availableSchedules):
 * a filterable user rail and a detail form editing names, schedule,
 * language, notes, role chips and contact rows. Passwords are OPT-IN
 * (config.allowPasswordChange): a staged password travels ONLY in the
 * onUserSave payload — never into props, state or output.*. Edits stay
 * draft-only until Save fires onUserSave {user, isNew, password?}; the
 * author's script persists via system.user.addUser/editUser. AD/LDAP
 * sources are read-only — set config.editable false to degrade to a
 * directory viewer. Controlled; selection is two-way via state.selectedUser.
 */
export class UserManager extends Component<ComponentProps<UserManagerProps>, UserManagerState> {

    private confirmTimer: number | null = null;

    constructor(props: ComponentProps<UserManagerProps>) {
        super(props);
        this.state = {
            draft: null, draftFor: '', creating: false, usernameDraft: '', filter: '', confirmingDelete: false
        };
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
                this.setState({ draft: null, draftFor: '', usernameDraft: '', confirmingDelete: false });
            }
            return;
        }
        const selectionChanged = item.username !== this.state.draftFor;
        if (selectionChanged || (this.state.draft && !this.isDirty() && !userDraftEquals(this.state.draft, userDraftFromItem(item)))) {
            this.setState({
                draft: userDraftFromItem(item), draftFor: item.username, usernameDraft: item.username, confirmingDelete: false
            });
        } else if (this.state.draft === null) {
            this.setState({ draft: userDraftFromItem(item), draftFor: item.username, usernameDraft: item.username });
        }
    }

    private isDirty(): boolean {
        if (this.state.creating) {
            return true;
        }
        const item = this.selected();
        if (!item || !this.state.draft || item.username !== this.state.draftFor) {
            return false;
        }
        return !userDraftEquals(this.state.draft, userDraftFromItem(item));
    }

    private usernameError(): 'empty' | 'duplicate' | null {
        if (!this.state.creating) {
            return null; // usernames don't rename in v1 (moving history/auth is a gateway decision)
        }
        return validateName(this.state.usernameDraft, this.props.props.users.map((u) => u.username), '');
    }

    // --- outputs / selection ------------------------------------------------

    private writeOutputs(): void {
        const w = this.props.store.props;
        const err = this.usernameError();
        w.write('output.count', this.props.props.users.length);
        w.write('output.isDirty', this.isDirty());
        w.write('output.validationErrors', err === null ? [] : [err === 'empty' ? 'usernameRequired' : 'usernameTaken']);
    }

    private ensureSelection(): void {
        const p = this.props.props;
        if (p.users.length === 0 || this.state.creating || p.selectedUser !== '') {
            return;
        }
        this.props.store.props.write('state.selectedUser', p.users[0].username);
    }

    private onSelect = (username: string): void => {
        if (this.state.creating) {
            this.setState({ creating: false, draft: null, draftFor: '', usernameDraft: '' });
        }
        this.props.store.props.write('state.selectedUser', username);
    };

    private selected(): AdminUser | undefined {
        const p = this.props.props;
        return p.users.find((u) => u.username === p.selectedUser);
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    // --- editing actions ----------------------------------------------------

    private onCreate = (): void => {
        this.clearConfirmTimer();
        this.setState({
            creating: true, draft: emptyUserDraft(), draftFor: '', usernameDraft: '', confirmingDelete: false
        });
    };

    private onDraftChange = (draft: UserDraft): void => {
        this.setState({ draft });
    };

    private onSave = (): void => {
        const draft = this.state.draft;
        if (!draft || this.usernameError() !== null || !this.isDirty()) {
            return;
        }
        const creating = this.state.creating;
        const username = creating ? this.state.usernameDraft.trim() : (this.selected() as AdminUser).username;
        const payload: { [key: string]: any } = {
            user: userDraftToFlat(username, draft),
            isNew: creating
        };
        if (this.props.props.allowPasswordChange && draft.password !== '') {
            // Payload-only: the password never lands in props/state/output.
            payload.password = draft.password;
        }
        this.fireEvent('onUserSave', payload);
        if (creating) {
            this.setState({ creating: false, draft: null, draftFor: '', usernameDraft: '' });
            this.props.store.props.write('state.selectedUser', username);
        } else {
            // Clear the staged password; everything else re-syncs on refetch.
            this.setState({ draft: { ...draft, password: '' } });
        }
    };

    private onDiscard = (): void => {
        if (this.state.creating) {
            this.setState({ creating: false, draft: null, draftFor: '', usernameDraft: '' });
            return;
        }
        const item = this.selected();
        if (item) {
            this.setState({
                draft: userDraftFromItem(item), draftFor: item.username, usernameDraft: item.username, confirmingDelete: false
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
        this.fireEvent('onUserDelete', { username: item.username });
    };

    private clearConfirmTimer(): void {
        if (this.confirmTimer !== null) {
            window.clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
        }
    }

    // --- render -------------------------------------------------------------

    private renderRail(): React.ReactNode {
        const p = this.props.props;
        const visible = filterUsers(p.users, this.state.filter, []);
        return (
            <div className="mustry-sched-list" role="listbox" aria-label={p.labels.listHeader}>
                <div className="mustry-sched-list-header">
                    {p.labels.listHeader}
                    {p.editable && p.allowCreate && (
                        <button
                            type="button"
                            className={'mustry-sched-new' + (this.state.creating ? ' mustry-sched-new--active' : '')}
                            title={p.labels.newUser}
                            onClick={this.onCreate}
                        >
                            + {p.labels.newUser}
                        </button>
                    )}
                </div>
                <input
                    className="mustry-users-filter"
                    type="text"
                    value={this.state.filter}
                    placeholder={p.labels.filterPlaceholder}
                    aria-label={p.labels.filterPlaceholder}
                    onChange={(e) => this.setState({ filter: e.target.value })}
                />
                {visible.length === 0 && <div className="mustry-sched-empty">{p.labels.noUsers}</div>}
                {visible.map((u) => (
                    <div
                        key={u.username}
                        className={'mustry-sched-item' + (!this.state.creating && u.username === p.selectedUser ? ' mustry-sched-item--selected' : '')}
                        role="option"
                        aria-selected={!this.state.creating && u.username === p.selectedUser}
                        tabIndex={0}
                        onClick={() => this.onSelect(u.username)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onSelect(u.username); } }}
                    >
                        <span className="mustry-sched-item-text">
                            <span className="mustry-sched-item-name">{displayName(u)}</span>
                            <span className="mustry-sched-item-desc">
                                {u.username}{u.roles.length > 0 ? ` · ${u.roles.join(', ')}` : ''}
                            </span>
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    private renderDetail(): React.ReactNode {
        const p = this.props.props;
        const creating = this.state.creating;
        const item = this.selected() || null;
        if (!item && !creating) {
            return (
                <div className="mustry-roster-detail mustry-roster-detail--empty">
                    {p.users.length === 0 ? p.labels.noUsers : p.labels.noSelection}
                </div>
            );
        }
        const draft = p.editable ? this.state.draft : null;
        const usernameError = this.usernameError();
        return (
            <div className="mustry-roster-detail">
                <div className="mustry-roster-detail-head">
                    {creating ? (
                        <span className="mustry-sched-name-wrap">
                            <input
                                className={'mustry-sched-name-input' + (usernameError ? ' mustry-sched-name-input--invalid' : '')}
                                type="text"
                                value={this.state.usernameDraft}
                                placeholder={p.labels.username}
                                aria-label={p.labels.username}
                                onChange={(e) => this.setState({ usernameDraft: e.target.value })}
                            />
                            {usernameError && (
                                <span className="mustry-sched-name-error">
                                    {usernameError === 'empty' ? p.labels.usernameRequired : p.labels.usernameTaken}
                                </span>
                            )}
                        </span>
                    ) : (
                        <span className="mustry-roster-detail-name">{item ? displayName(item) : ''}</span>
                    )}
                    {!creating && item && <span className="mustry-sched-detail-desc">{item.username}</span>}
                    <span className="mustry-sched-head-spacer" />
                    {draft && (
                        <React.Fragment>
                            <CommitControls
                                labels={p.labels}
                                enabled={usernameError === null}
                                dirty={this.isDirty()}
                                onSave={this.onSave}
                                onDiscard={this.onDiscard}
                            />
                            {!creating && p.allowDelete && (
                                <button
                                    type="button"
                                    className={'mustry-sched-delete' + (this.state.confirmingDelete ? ' mustry-sched-delete--confirm' : '')}
                                    onClick={this.onDelete}
                                >
                                    {this.state.confirmingDelete ? p.labels.confirmDelete : p.labels.delete}
                                </button>
                            )}
                        </React.Fragment>
                    )}
                </div>
                {draft ? (
                    <UserDetailForm
                        draft={draft}
                        availableRoles={p.availableRoles}
                        availableSchedules={p.availableSchedules}
                        showPassword={p.allowPasswordChange}
                        labels={p.labels}
                        onChange={this.onDraftChange}
                    />
                ) : (
                    item && (
                        <div className="mustry-users-form">
                            <div className="mustry-users-view-row">{item.roles.join(', ')}</div>
                            {item.contactInfo.map((c) => (
                                <div key={`${c.contactType}-${c.value}`} className="mustry-users-view-row">
                                    {c.contactType}: {c.value}
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        );
    }

    render() {
        return (
            <div {...this.props.emit({ classes: ['mustry-usermgr'] })}>
                {this.renderRail()}
                {this.renderDetail()}
            </div>
        );
    }
}

export class UserManagerMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return UserManager as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 720, height: 460 };
    }

    getPropsReducer(tree: PropertyTree): UserManagerProps {
        return mapUserProps(tree);
    }
}
