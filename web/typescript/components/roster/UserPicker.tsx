import * as React from 'react';
import { AdminUser, displayName, filterUsers } from '../../shared/adminUsers';
import { RosterManagerLabels } from '../../shared/labels/roster';

interface UserPickerProps {
    /** The directory to pick from (already normalized). */
    users: AdminUser[];
    /** Usernames to hide (already on the roster). */
    exclude: string[];
    labels: RosterManagerLabels;
    onPick: (username: string) => void;
    onClose: () => void;
}

interface UserPickerState {
    query: string;
}

/**
 * The directory picker: a small anchored panel with typeahead over the bound
 * user directory. Deliberately NOT portalled — it lives inside the component
 * root, so outside-click handling stays local and theme vars apply directly.
 */
export class UserPicker extends React.Component<UserPickerProps, UserPickerState> {

    private panelEl: HTMLDivElement | null = null;

    constructor(props: UserPickerProps) {
        super(props);
        this.state = { query: '' };
    }

    componentDidMount(): void {
        window.addEventListener('mousedown', this.onOutsidePointer, true);
        window.addEventListener('keydown', this.onKeyDown, true);
    }

    componentWillUnmount(): void {
        window.removeEventListener('mousedown', this.onOutsidePointer, true);
        window.removeEventListener('keydown', this.onKeyDown, true);
    }

    private setPanelEl = (el: HTMLDivElement | null): void => { this.panelEl = el; };

    private onOutsidePointer = (e: MouseEvent): void => {
        if (this.panelEl && !this.panelEl.contains(e.target as Node)) {
            this.props.onClose();
        }
    };

    private onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            this.props.onClose();
        }
    };

    render(): JSX.Element {
        const matches = filterUsers(this.props.users, this.state.query, this.props.exclude);
        return (
            <div className="mustry-roster-picker" ref={this.setPanelEl}>
                <input
                    className="mustry-roster-picker-search"
                    type="text"
                    autoFocus={true}
                    value={this.state.query}
                    placeholder={this.props.labels.searchUsers}
                    aria-label={this.props.labels.searchUsers}
                    onChange={(e) => this.setState({ query: e.target.value })}
                />
                <div className="mustry-roster-picker-list">
                    {matches.length === 0 && (
                        <div className="mustry-roster-picker-none">{this.props.labels.noMatches}</div>
                    )}
                    {matches.map((u) => (
                        <div
                            key={u.username}
                            className="mustry-roster-picker-item"
                            role="button"
                            tabIndex={0}
                            onClick={() => this.props.onPick(u.username)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { this.props.onPick(u.username); } }}
                        >
                            <span className="mustry-roster-picker-name">{displayName(u)}</span>
                            <span className="mustry-roster-picker-sub">{u.username}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}
