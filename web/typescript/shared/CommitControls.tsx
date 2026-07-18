// The shared "commit tail" every editor toolbar ends with: the unsaved-changes
// badge, the Save button, and the Discard button. One presentational component
// + one SCSS block (scss/commit.scss, classes mustry-commit-*) so the three
// editor toolbars (rich text, code, and the grid's batch bar next) can't drift.
import * as React from 'react';
import { CommitLabels } from './labels/commit';

interface CommitControlsProps {
    labels: CommitLabels;
    enabled: boolean;
    dirty: boolean;
    onSave: () => void;
    onDiscard: () => void;
}

export function CommitControls(p: CommitControlsProps): React.ReactElement | null {
    if (!p.dirty) {
        return null;
    }
    return (
        <>
            <span className="mustry-commit-badge">{p.labels.unsaved}</span>
            <button
                type="button"
                className="mustry-commit-save"
                disabled={!p.enabled}
                onClick={p.onSave}
            >
                {p.labels.save}
            </button>
            <button
                type="button"
                className="mustry-commit-discard"
                title={p.labels.discard}
                aria-label={p.labels.discard}
                disabled={!p.enabled}
                onClick={p.onDiscard}
            >
                ✕
            </button>
        </>
    );
}
