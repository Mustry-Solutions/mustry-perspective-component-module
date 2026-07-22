import * as React from 'react';
import { validateName } from '../../shared/adminCommon';
import { UserManagerLabels } from '../../shared/labels/users';
import { UserDraft, toggleRole } from './userLogic';

/** How long a per-role delete stays in its confirm step before reverting. */
const CONFIRM_DELETE_MS = 4000;

interface RolesEditorProps {
    draft: UserDraft;
    availableRoles: string[];
    /** config.allowRoleManagement && editable — shows the manage-mode toggle. */
    manageEnabled: boolean;
    labels: UserManagerLabels;
    onDraftChange: (draft: UserDraft) => void;
    /** Catalog-level events (fire immediately; the author's script persists). */
    onRoleSave: (name: string, oldName?: string) => void;
    onRoleDelete: (name: string) => void;
}

interface RolesEditorState {
    managing: boolean;
    addValue: string;
    /** The role currently being renamed (null = none). */
    renaming: string | null;
    renameValue: string;
    /** The role whose delete button is in its confirm step (null = none). */
    confirming: string | null;
}

/**
 * The Roles section: assignment chips always; behind config.allowRoleManagement
 * a manage mode that edits the CATALOG itself — add, inline-rename, two-step
 * delete. Catalog edits are not part of the user draft: they fire
 * onRoleSave/onRoleDelete immediately and land when the binding refetches
 * data.availableRoles. Renames keep user assignments (the source stores role
 * ids), but security policies reference roles BY NAME — hence the warning.
 */
export class RolesEditor extends React.Component<RolesEditorProps, RolesEditorState> {

    private confirmTimer: number | null = null;

    constructor(props: RolesEditorProps) {
        super(props);
        this.state = { managing: false, addValue: '', renaming: null, renameValue: '', confirming: null };
    }

    componentWillUnmount(): void {
        this.clearConfirmTimer();
    }

    private clearConfirmTimer(): void {
        if (this.confirmTimer !== null) {
            window.clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
        }
    }

    private addError(): 'empty' | 'duplicate' | null {
        return validateName(this.state.addValue, this.props.availableRoles, '');
    }

    private renameError(): 'empty' | 'duplicate' | null {
        return this.state.renaming === null
            ? null
            : validateName(this.state.renameValue, this.props.availableRoles, this.state.renaming);
    }

    private commitAdd = (): void => {
        if (this.addError() !== null) {
            return;
        }
        this.props.onRoleSave(this.state.addValue.trim());
        this.setState({ addValue: '' });
    };

    private commitRename = (): void => {
        const oldName = this.state.renaming;
        if (oldName === null || this.renameError() !== null) {
            return;
        }
        const newName = this.state.renameValue.trim();
        if (newName !== oldName) {
            this.props.onRoleSave(newName, oldName);
        }
        this.setState({ renaming: null, renameValue: '' });
    };

    private onDelete(role: string): void {
        if (this.state.confirming !== role) {
            this.clearConfirmTimer();
            this.setState({ confirming: role });
            this.confirmTimer = window.setTimeout(() => this.setState({ confirming: null }), CONFIRM_DELETE_MS);
            return;
        }
        this.clearConfirmTimer();
        this.setState({ confirming: null });
        this.props.onRoleDelete(role);
    }

    private renderManageRow(role: string): JSX.Element {
        const { labels } = this.props;
        if (this.state.renaming === role) {
            const error = this.renameError();
            return (
                <div key={role} className="mustry-users-role-row">
                    <input
                        className={'mustry-users-input mustry-users-role-input' + (error ? ' mustry-sched-name-input--invalid' : '')}
                        type="text"
                        autoFocus={true}
                        value={this.state.renameValue}
                        aria-label={labels.roleName}
                        onChange={(e) => this.setState({ renameValue: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { this.commitRename(); }
                            if (e.key === 'Escape') { this.setState({ renaming: null, renameValue: '' }); }
                        }}
                    />
                    {error && (
                        <span className="mustry-sched-name-error">
                            {error === 'empty' ? labels.roleRequired : labels.roleTaken}
                        </span>
                    )}
                    <button type="button" className="mustry-users-role-btn" disabled={error !== null} onClick={this.commitRename}>✓</button>
                    <button type="button" className="mustry-users-role-btn" onClick={() => this.setState({ renaming: null, renameValue: '' })}>✕</button>
                </div>
            );
        }
        const confirming = this.state.confirming === role;
        return (
            <div key={role} className="mustry-users-role-row">
                <span className="mustry-users-role-name">{role}</span>
                <button
                    type="button"
                    className="mustry-users-role-btn"
                    title={labels.renameRole}
                    aria-label={`${labels.renameRole} ${role}`}
                    onClick={() => this.setState({ renaming: role, renameValue: role, confirming: null })}
                >
                    ✎
                </button>
                <button
                    type="button"
                    className={'mustry-users-role-btn' + (confirming ? ' mustry-users-role-btn--danger' : '')}
                    title={confirming ? labels.confirmDelete : labels.deleteRole}
                    // aria-label wins over text for the accessible name — it must
                    // track the confirm step or the button stays "Delete role …"
                    // to assistive tech (and tests) after the first click.
                    aria-label={confirming ? labels.confirmDelete : `${labels.deleteRole} ${role}`}
                    onClick={() => this.onDelete(role)}
                >
                    {confirming ? labels.confirmDelete : '✕'}
                </button>
            </div>
        );
    }

    render(): JSX.Element {
        const { draft, availableRoles, labels } = this.props;
        const managing = this.state.managing && this.props.manageEnabled;
        const addError = this.addError();
        return (
            <React.Fragment>
                <div className="mustry-users-section mustry-users-roles-head">
                    {labels.roles}
                    {this.props.manageEnabled && (
                        <button
                            type="button"
                            className={'mustry-users-manage-btn' + (managing ? ' mustry-users-manage-btn--active' : '')}
                            onClick={() => this.setState({ managing: !this.state.managing, renaming: null, confirming: null })}
                        >
                            {managing ? labels.doneManaging : labels.manageRoles}
                        </button>
                    )}
                </div>
                {managing ? (
                    <div className="mustry-users-roles-manage">
                        <span className="mustry-users-hint mustry-users-role-warning">⚠ {labels.roleWarning}</span>
                        {availableRoles.map((role) => this.renderManageRow(role))}
                        <div className="mustry-users-role-row">
                            <input
                                className={'mustry-users-input mustry-users-role-input' + (this.state.addValue !== '' && addError ? ' mustry-sched-name-input--invalid' : '')}
                                type="text"
                                value={this.state.addValue}
                                placeholder={labels.roleName}
                                aria-label={labels.roleName}
                                onChange={(e) => this.setState({ addValue: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') { this.commitAdd(); } }}
                            />
                            {this.state.addValue !== '' && addError === 'duplicate' && (
                                <span className="mustry-sched-name-error">{labels.roleTaken}</span>
                            )}
                            <button
                                type="button"
                                className="mustry-users-add-contact"
                                disabled={addError !== null}
                                onClick={this.commitAdd}
                            >
                                + {labels.addRole}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="mustry-users-roles">
                        {availableRoles.length === 0 && <span className="mustry-users-hint">{labels.noRoles}</span>}
                        {availableRoles.map((role) => (
                            <label key={role} className="mustry-sched-toggle">
                                <input
                                    type="checkbox"
                                    checked={draft.roles.indexOf(role) >= 0}
                                    onChange={() => this.props.onDraftChange(toggleRole(draft, role))}
                                />
                                {role}
                            </label>
                        ))}
                    </div>
                )}
            </React.Fragment>
        );
    }
}
