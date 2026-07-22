import * as React from 'react';
import { UserManagerLabels } from '../../shared/labels/users';
import {
    UserDraft, addAdjustment, addContact, inputToInstant, instantToInput, invalidAdjustments,
    removeAdjustment, removeContact, updateAdjustment, updateContact
} from './userLogic';
import { RolesEditor } from './RolesEditor';

/** The contact types the UI offers (the data model keeps the set open). */
const CONTACT_TYPES = ['email', 'sms', 'phone'];

interface UserDetailFormProps {
    draft: UserDraft;
    availableRoles: string[];
    availableSchedules: string[];
    showPassword: boolean;
    /** config.allowRoleManagement && editable — role-catalog CRUD in the Roles section. */
    allowRoleManagement: boolean;
    labels: UserManagerLabels;
    onChange: (draft: UserDraft) => void;
    onRoleSave: (name: string, oldName?: string) => void;
    onRoleDelete: (name: string) => void;
}

/**
 * The editable detail form: names, schedule, language, notes, role chips,
 * contact rows, and (behind config.allowPasswordChange) the staged password.
 * Purely presentational — every edit routes through onChange with a new draft.
 */
export function UserDetailForm(props: UserDetailFormProps): JSX.Element {
    const { draft, labels } = props;
    const field = (label: string, value: string, onChange: (v: string) => void, type = 'text'): JSX.Element => (
        <label className="mustry-users-field">
            <span className="mustry-users-field-label">{label}</span>
            <input
                className="mustry-users-input"
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </label>
    );

    return (
        <div className="mustry-users-form">
            <div className="mustry-users-form-row">
                {field(labels.firstName, draft.firstName, (v) => props.onChange({ ...draft, firstName: v }))}
                {field(labels.lastName, draft.lastName, (v) => props.onChange({ ...draft, lastName: v }))}
            </div>
            <div className="mustry-users-form-row">
                <label className="mustry-users-field">
                    <span className="mustry-users-field-label">{labels.schedule}</span>
                    <select
                        className="mustry-users-input"
                        value={draft.schedule}
                        onChange={(e) => props.onChange({ ...draft, schedule: e.target.value })}
                    >
                        {/* keep a bound-but-unknown schedule selectable rather than silently rewriting it */}
                        {draft.schedule !== '' && props.availableSchedules.indexOf(draft.schedule) < 0 && (
                            <option value={draft.schedule}>{draft.schedule}</option>
                        )}
                        <option value="" />
                        {props.availableSchedules.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
                {field(labels.language, draft.language, (v) => props.onChange({ ...draft, language: v }))}
            </div>
            {field(labels.notes, draft.notes, (v) => props.onChange({ ...draft, notes: v }))}

            <RolesEditor
                draft={draft}
                availableRoles={props.availableRoles}
                manageEnabled={props.allowRoleManagement}
                labels={labels}
                onDraftChange={props.onChange}
                onRoleSave={props.onRoleSave}
                onRoleDelete={props.onRoleDelete}
            />

            <div className="mustry-users-section">{labels.contact}</div>
            {draft.contactInfo.map((c, i) => (
                <div key={i} className="mustry-users-contact-row">
                    <select
                        className="mustry-users-input mustry-users-contact-type"
                        value={c.contactType}
                        onChange={(e) => props.onChange(updateContact(draft, i, { contactType: e.target.value }))}
                    >
                        {CONTACT_TYPES.indexOf(c.contactType) < 0 && <option value={c.contactType}>{c.contactType}</option>}
                        {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                        className="mustry-users-input mustry-users-contact-value"
                        type="text"
                        value={c.value}
                        onChange={(e) => props.onChange(updateContact(draft, i, { value: e.target.value }))}
                    />
                    <button
                        type="button"
                        className="mustry-roster-remove"
                        title={labels.removeContact}
                        aria-label={`${labels.removeContact} ${c.contactType}`}
                        onClick={() => props.onChange(removeContact(draft, i))}
                    >
                        ✕
                    </button>
                </div>
            ))}
            <button
                type="button"
                className="mustry-users-add-contact"
                onClick={() => props.onChange(addContact(draft, 'email'))}
            >
                + {labels.addContact}
            </button>

            <div className="mustry-users-section">{labels.adjustments}</div>
            <span className="mustry-users-hint">{labels.adjHint}</span>
            {draft.scheduleAdjustments.map((a, i) => {
                const invalid = invalidAdjustments(draft).indexOf(i) >= 0;
                return (
                    <div key={i} className="mustry-users-adj-row">
                        <label className="mustry-users-field mustry-users-adj-instant">
                            <span className="mustry-users-field-label">{labels.adjStart}</span>
                            <input
                                className={'mustry-users-input' + (invalid ? ' mustry-sched-name-input--invalid' : '')}
                                type="datetime-local"
                                value={instantToInput(a.start)}
                                onChange={(e) => props.onChange(updateAdjustment(draft, i, { start: inputToInstant(e.target.value) }))}
                            />
                        </label>
                        <label className="mustry-users-field mustry-users-adj-instant">
                            <span className="mustry-users-field-label">{labels.adjEnd}</span>
                            <input
                                className={'mustry-users-input' + (invalid ? ' mustry-sched-name-input--invalid' : '')}
                                type="datetime-local"
                                value={instantToInput(a.end)}
                                onChange={(e) => props.onChange(updateAdjustment(draft, i, { end: inputToInstant(e.target.value) }))}
                            />
                        </label>
                        <label className="mustry-sched-toggle mustry-users-adj-avail">
                            <input
                                type="checkbox"
                                checked={a.available}
                                onChange={(e) => props.onChange(updateAdjustment(draft, i, { available: e.target.checked }))}
                            />
                            {labels.adjAvailable}
                        </label>
                        <input
                            className="mustry-users-input mustry-users-adj-note"
                            type="text"
                            value={a.note}
                            placeholder={labels.adjNote}
                            aria-label={labels.adjNote}
                            onChange={(e) => props.onChange(updateAdjustment(draft, i, { note: e.target.value }))}
                        />
                        <button
                            type="button"
                            className="mustry-roster-remove"
                            title={labels.removeContact}
                            aria-label={`${labels.removeContact} ${labels.adjustments} ${i + 1}`}
                            onClick={() => props.onChange(removeAdjustment(draft, i))}
                        >
                            ✕
                        </button>
                        {invalid && <span className="mustry-sched-name-error">{labels.adjInvalid}</span>}
                    </div>
                );
            })}
            <button
                type="button"
                className="mustry-users-add-contact mustry-users-add-adj"
                onClick={() => props.onChange(addAdjustment(draft))}
            >
                + {labels.addAdjustment}
            </button>

            {props.showPassword && (
                <React.Fragment>
                    <div className="mustry-users-section">{labels.password}</div>
                    <div className="mustry-users-form-row">
                        <input
                            className="mustry-users-input mustry-users-password"
                            type="password"
                            autoComplete="new-password"
                            value={draft.password}
                            placeholder={labels.password}
                            aria-label={labels.password}
                            onChange={(e) => props.onChange({ ...draft, password: e.target.value })}
                        />
                        {draft.password !== '' && (
                            <span className="mustry-users-hint">{labels.passwordPending}</span>
                        )}
                    </div>
                </React.Fragment>
            )}
        </div>
    );
}
