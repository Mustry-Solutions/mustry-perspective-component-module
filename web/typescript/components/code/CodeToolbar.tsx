// The code editor's slim toolbar: undo/redo, Format JSON, validity badge, and
// the module-standard dirty badge + Save/Discard. Pure presentation.
import * as React from 'react';
import { CodeLabels } from '../../shared/labels/code';

interface CodeToolbarProps {
    labels: CodeLabels;
    enabled: boolean;
    dirty: boolean;
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
            <button type="button" className="mustry-code-btn" title="Undo" aria-label="Undo"
                    disabled={!enabled} onMouseDown={(e) => e.preventDefault()} onClick={p.onUndo}>↶</button>
            <button type="button" className="mustry-code-btn" title="Redo" aria-label="Redo"
                    disabled={!enabled} onMouseDown={(e) => e.preventDefault()} onClick={p.onRedo}>↷</button>
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
            {p.dirty && <span className="mustry-code-dirty-badge">{labels.unsaved}</span>}
            {p.dirty && (
                <button type="button" className="mustry-code-save-btn" disabled={!enabled} onClick={p.onSave}>
                    {labels.save}
                </button>
            )}
            {p.dirty && (
                <button type="button" className="mustry-code-btn mustry-code-discard-btn" title={labels.discard}
                        aria-label={labels.discard} disabled={!enabled} onClick={p.onDiscard}>✕</button>
            )}
        </div>
    );
}
