import * as React from 'react';
import { UserManagerLabels } from '../../shared/labels/users';
import { UserDraft, addContact, removeContact, toggleRole, updateContact } from './userLogic';

/** The contact types the UI offers (the data model keeps the set open). */
const CONTACT_TYPES = ['email', 'sms', 'phone'];

interface UserDetailFormProps {
    draft: UserDraft;
    availableRoles: string[];
    availableSchedules: string[];
    showPassword: boolean;
    labels: UserManagerLabels;
    onChange: (draft: UserDraft) => void;
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

            <div className="mustry-users-section">{labels.roles}</div>
            <div className="mustry-users-roles">
                {props.availableRoles.length === 0 && <span className="mustry-users-hint">{labels.noRoles}</span>}
                {props.availableRoles.map((role) => (
                    <label key={role} className="mustry-sched-toggle">
                        <input
                            type="checkbox"
                            checked={draft.roles.indexOf(role) >= 0}
                            onChange={() => props.onChange(toggleRole(draft, role))}
                        />
                        {role}
                    </label>
                ))}
            </div>

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
