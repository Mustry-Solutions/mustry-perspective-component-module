// The code editor's slim toolbar: undo/redo, Format JSON, validity badge, and
// the module-standard dirty badge + Save/Discard. Pure presentation.
import * as React from 'react';
import { CodeLabels } from '../../shared/labels/code';
import { CommitControls } from '../../shared/CommitControls';

interface CodeToolbarProps {
    labels: CodeLabels;
    enabled: boolean;
    dirty: boolean;
    canUndo: boolean;
    canRedo: boolean;
    isJson: boolean;
    jsonValid: boolean;
    canFormat: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onFormat: () => void;
    onSave: () => void;
    onDiscard: () => void;
}

export function CodeToolbar(p: CodeToolbarProps): React.ReactElement {
    const { labels, enabled } = p;
    return (
        <div className="mustry-code-toolbar">
            <button type="button" className="mustry-code-btn" title={labels.undo} aria-label={labels.undo}
                    disabled={!enabled || !p.canUndo} onMouseDown={(e) => e.preventDefault()} onClick={p.onUndo}>↶</button>
            <button type="button" className="mustry-code-btn" title={labels.redo} aria-label={labels.redo}
                    disabled={!enabled || !p.canRedo} onMouseDown={(e) => e.preventDefault()} onClick={p.onRedo}>↷</button>
            {p.isJson && (
                <>
                    <span className="mustry-code-sep" />
                    <button type="button" className="mustry-code-btn" title={labels.format} aria-label={labels.format}
                            disabled={!enabled || !p.canFormat} onMouseDown={(e) => e.preventDefault()} onClick={p.onFormat}>
                        {'{ }'}
                    </button>
                </>
            )}

            <span className="mustry-code-spring" />
            {p.isJson && !p.jsonValid && (
                <span className="mustry-code-invalid-badge">{labels.invalid}</span>
            )}
            <CommitControls labels={labels} enabled={enabled} dirty={p.dirty} onSave={p.onSave} onDiscard={p.onDiscard} />
        </div>
    );
}
