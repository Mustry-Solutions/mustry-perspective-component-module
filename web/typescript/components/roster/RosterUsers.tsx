import * as React from 'react';
import { AdminUser, displayName, hasContact } from '../../shared/adminUsers';
import { reorder } from '../../shared/adminCommon';
import { RosterManagerLabels } from '../../shared/labels/roster';
import { ReorderPreview, RosterReorderController } from './rosterGestureController';

interface RosterUsersProps {
    /** Ordered usernames (the draft while editing, the bound list otherwise). */
    usernames: string[];
    /** Directory lookup for names/contact info (username → user). */
    directory: { [username: string]: AdminUser };
    editable: boolean;
    gestures: RosterReorderController | null;
    preview: ReorderPreview | null;
    labels: RosterManagerLabels;
    onRemove: (index: number) => void;
}

function ordinal(template: string, n: number): string {
    return template.replace('{n}', String(n));
}

/**
 * The ordered user rows — order IS the alarm escalation sequence, so each row
 * carries its "Contact N" ordinal. While a reorder drag is live the rows
 * render in the previewed order with the moved row highlighted.
 */
export function RosterUsers(props: RosterUsersProps): JSX.Element {
    const { usernames, directory, editable, gestures, preview, labels } = props;

    // Render in previewed order during a drag; remember which row moved.
    const order = preview ? reorder(usernames.map((_, i) => i), preview.fromIndex, preview.toIndex) : usernames.map((_, i) => i);

    if (usernames.length === 0) {
        return <div className="mustry-roster-empty">{labels.emptyRoster}</div>;
    }

    return (
        <div className="mustry-roster-users" role="list">
            {order.map((sourceIndex, displayIndex) => {
                const username = usernames[sourceIndex];
                const user = directory[username];
                const moving = preview !== null && sourceIndex === preview.fromIndex;
                return (
                    <div
                        key={`${username}-${sourceIndex}`}
                        className={'mustry-roster-row' + (moving ? ' mustry-roster-row--moving' : '')}
                        role="listitem"
                    >
                        {editable && gestures && (
                            <span
                                className="mustry-roster-grip"
                                title={labels.dragToReorder}
                                onPointerDown={(e) => gestures.onHandleDown(sourceIndex, usernames.length, e)}
                            >
                                ⠿
                            </span>
                        )}
                        <span className="mustry-roster-ordinal">{ordinal(labels.contactN, displayIndex + 1)}</span>
                        <span className="mustry-roster-user">
                            <span className="mustry-roster-user-name">{user ? displayName(user) : username}</span>
                            <span className="mustry-roster-user-sub">
                                {user ? username : labels.unknownUser}
                                {user && user.contactInfo.filter((c) => c.value.trim() !== '').map((c) => (
                                    <span key={`${c.contactType}-${c.value}`} className="mustry-roster-contact">
                                        {c.contactType}: {c.value}
                                    </span>
                                ))}
                            </span>
                        </span>
                        {user && !hasContact(user) && (
                            <span className="mustry-roster-warn" title={labels.noContact}>⚠ {labels.noContact}</span>
                        )}
                        {editable && (
                            <button
                                type="button"
                                className="mustry-roster-remove"
                                title={labels.removeUser}
                                aria-label={`${labels.removeUser} ${username}`}
                                onClick={() => props.onRemove(sourceIndex)}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
