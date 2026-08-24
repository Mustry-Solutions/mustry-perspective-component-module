import * as React from 'react';
import {
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { AdminManagerBase, AdminManagerDescriptor } from '../../shared/adminManagerBase';
import { AdminDraftState } from '../../shared/adminManagerLogic';
import { AdminUser, displayName, filterUsers } from '../../shared/adminUsers';
import { AdminFooter } from '../../shared/AdminFooter';
import {
    UserDraft, emptyUserDraft, invalidAdjustments, userDraftEquals, userDraftFromItem, userDraftToFlat
} from './userLogic';
import { UserManagerProps, mapUserProps } from './userProps';
import { RowMenu } from '../../shared/RowMenu';
import { UserDetailForm } from './UserDetailForm';

// Must match UserManager.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.admin.usermanager';

interface UserManagerState extends AdminDraftState<UserDraft> {
    /** The rail's filter query (client-side, never persisted). */
    filter: string;
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
 * The draft/select/save/delete machine lives in the AdminManagerBase; this
 * class owns the form, the role catalog and the password staging.
 */
export class UserManager extends AdminManagerBase<AdminUser, UserDraft, UserManagerProps, UserManagerState> {

    protected readonly descriptor: AdminManagerDescriptor<AdminUser, UserDraft> = {
        keyOf: (u) => u.username,
        draftFromItem: userDraftFromItem,
        emptyDraft: emptyUserDraft,
        draftEquals: userDraftEquals,
        selectionPath: 'state.selectedUser',
        deleteEvent: 'onUserDelete',
        deleteKeyField: 'username',
        // usernames don't rename in v1 (moving history/auth is a gateway decision)
        renameEnabled: false,
        copyNameStyle: 'dash',
        nameErrorCodes: { empty: 'usernameRequired', duplicate: 'usernameTaken' }
    };

    constructor(props: ComponentProps<UserManagerProps>) {
        super(props);
        this.state = {
            draft: null, draftFor: '', creating: false, nameDraft: '', filter: '', confirmingDelete: false
        };
    }

    // --- machine wiring -----------------------------------------------------

    protected items(): AdminUser[] {
        return this.props.props.users;
    }

    protected selectedKey(): string {
        return this.props.props.selectedUser;
    }

    protected saveBlocked(): boolean {
        return super.saveBlocked() || this.adjustmentsInvalid();
    }

    protected validationErrors(): string[] {
        const errors = super.validationErrors();
        if (this.adjustmentsInvalid()) {
            errors.push('adjustmentInvalid');
        }
        return errors;
    }

    // --- user-specific editing ----------------------------------------------

    private adjustmentsInvalid(): boolean {
        return !!this.state.draft && invalidAdjustments(this.state.draft).length > 0;
    }

    private onDraftChange = (draft: UserDraft): void => {
        this.setState({ draft });
    };

    // Catalog-level role CRUD (config.allowRoleManagement): these are NOT part
    // of the user draft — they fire immediately and the author's script
    // persists via system.user.addRole/editRole/removeRole, then refetches.
    private onRoleSave = (name: string, oldName?: string): void => {
        const payload: { [key: string]: any } = { name };
        if (oldName !== undefined) {
            payload.oldName = oldName;
        }
        this.fireEvent('onRoleSave', payload);
    };

    private onRoleDelete = (name: string): void => {
        this.fireEvent('onRoleDelete', { name });
    };

    private onSave = (): void => {
        const draft = this.saveableDraft();
        if (!draft) {
            return;
        }
        const creating = this.state.creating;
        const username = creating ? this.state.nameDraft.trim() : (this.selected() as AdminUser).username;
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
            this.finishCreate(username);
        } else {
            // Clear the staged password; everything else re-syncs on refetch.
            this.setState({ draft: { ...draft, password: '' } });
        }
    };

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
                        {p.editable && (p.allowCreate || p.allowDelete) && (
                            <RowMenu
                                moreActionsLabel={`${p.labels.moreActions} u.username`}
                                duplicateLabel={p.labels.duplicate}
                                deleteLabel={p.labels.delete}
                                confirmDeleteLabel={p.labels.confirmDelete}
                                showDuplicate={p.allowCreate}
                                showDelete={p.allowDelete}
                                onDuplicate={() => this.onDuplicate(u.username)}
                                onDelete={() => this.onMenuDelete(u.username)}
                            />
                        )}
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
        const usernameError = this.nameError();
        return (
            <div className="mustry-roster-detail">
                <div className="mustry-roster-detail-head">
                    {creating ? (
                        <span className="mustry-sched-name-wrap">
                            <input
                                className={'mustry-sched-name-input' + (usernameError ? ' mustry-sched-name-input--invalid' : '')}
                                type="text"
                                value={this.state.nameDraft}
                                placeholder={p.labels.username}
                                aria-label={p.labels.username}
                                onChange={(e) => this.setState({ nameDraft: e.target.value })}
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
                </div>
                {draft ? (
                    <UserDetailForm
                        draft={draft}
                        availableRoles={p.availableRoles}
                        availableSchedules={p.availableSchedules}
                        showPassword={p.allowPasswordChange}
                        allowRoleManagement={p.allowRoleManagement && !creating}
                        labels={p.labels}
                        onChange={this.onDraftChange}
                        onRoleSave={this.onRoleSave}
                        onRoleDelete={this.onRoleDelete}
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
                {draft && (
                    <AdminFooter
                        labels={p.labels}
                        enabled={usernameError === null && !this.adjustmentsInvalid()}
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
