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
    /**
     * Keep the tail's space reserved while clean (rendered invisible and
     * inert) so going dirty doesn't reflow the surrounding header — the admin
     * family opts in; toolbars keep the historical pop-in (null when clean).
     */
    reserveSpace?: boolean;
    onSave: () => void;
    onDiscard: () => void;
}

export function CommitControls(p: CommitControlsProps): React.ReactElement | null {
    if (!p.dirty && !p.reserveSpace) {
        return null;
    }
    const hidden = !p.dirty;
    const style: React.CSSProperties | undefined = hidden ? { visibility: 'hidden' } : undefined;
    return (
        <>
            <span className="mustry-commit-badge" style={style} aria-hidden={hidden}>{p.labels.unsaved}</span>
            <button
                type="button"
                className="mustry-commit-save"
                style={style}
                disabled={!p.enabled || hidden}
                tabIndex={hidden ? -1 : undefined}
                aria-hidden={hidden}
                onClick={p.onSave}
            >
                {p.labels.save}
            </button>
            <button
                type="button"
                className="mustry-commit-discard"
                style={style}
                title={p.labels.discard}
                aria-label={p.labels.discard}
                disabled={!p.enabled || hidden}
                tabIndex={hidden ? -1 : undefined}
                aria-hidden={hidden}
                onClick={p.onDiscard}
            >
                ✕
            </button>
        </>
    );
}
