import * as React from 'react';
import { CommitControls } from './CommitControls';
import { CommitLabels } from './labels/commit';
import { ConfirmButton } from './ConfirmButton';

interface AdminFooterProps {
    labels: CommitLabels;
    enabled: boolean;
    dirty: boolean;
    onSave: () => void;
    onDiscard: () => void;
    /** Hide the delete affordance entirely (create flows, allowDelete off). */
    showDelete: boolean;
    deleteLabel: string;
    confirmDeleteLabel: string;
    confirmingDelete: boolean;
    onDelete: () => void;
}

/**
 * The admin family's action bar: a hairline-topped footer with the
 * destructive action on the LEFT and the Save cluster (reserved-space, so
 * dirtying never reflows) on the RIGHT. Headers stay identity-only —
 * actions never fight name fields for width again.
 */
export function AdminFooter(p: AdminFooterProps): JSX.Element {
    return (
        <div className="mustry-adm-footer">
            {p.showDelete ? (
                <ConfirmButton
                    label={p.deleteLabel}
                    confirmLabel={p.confirmDeleteLabel}
                    confirming={p.confirmingDelete}
                    className="mustry-sched-delete"
                    confirmingClassName="mustry-sched-delete--confirm"
                    onClick={p.onDelete}
                />
            ) : <span />}
            <span className="mustry-sched-head-spacer" />
            <CommitControls
                labels={p.labels}
                enabled={p.enabled}
                dirty={p.dirty}
                reserveSpace={true}
                onSave={p.onSave}
                onDiscard={p.onDiscard}
            />
        </div>
    );
}
