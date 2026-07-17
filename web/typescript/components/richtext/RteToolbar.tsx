// The editor's toolbar: formatting buttons per the feature allowlist, the link
// popover row, and the grid-style dirty badge + Save/Discard on the right.
// Pure presentation — command routing and editor state live in the class.
import * as React from 'react';
import { RteLabels } from '../../shared/labels/richtext';
import { RteFeatures, fillLabel } from './richTextLogic';

interface RteToolbarProps {
    labels: RteLabels;
    features: RteFeatures;
    enabled: boolean;
    dirty: boolean;
    isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
    onCommand: (cmd: string, arg?: number) => void;
    linkOpen: boolean;
    linkValue: string;
    onLinkToggle: () => void;
    onLinkChange: (v: string) => void;
    onLinkApply: () => void;
    onLinkRemove: () => void;
    imageOpen: boolean;
    imageValue: string;
    onImageToggle: () => void;
    onImageChange: (v: string) => void;
    onImageApply: () => void;
    onSave: () => void;
    onDiscard: () => void;
}

function Btn(p: {
    label: string; active: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode;
}): React.ReactElement {
    return (
        <button
            type="button"
            className={`mustry-rte-btn${p.active ? ' mustry-rte-btn--active' : ''}`}
            title={p.label}
            aria-label={p.label}
            aria-pressed={p.active}
            disabled={p.disabled}
            // preventDefault so the button never steals the editor's selection
            onMouseDown={(e) => e.preventDefault()}
            onClick={p.onClick}
        >
            {p.children}
        </button>
    );
}

export function RteToolbar(p: RteToolbarProps): React.ReactElement {
    const { labels, features, enabled } = p;
    const cmd = (name: string, arg?: number) => () => p.onCommand(name, arg);
    return (
        <div className="mustry-rte-toolbar">
            {features.bold && (
                <Btn label={labels.bold} active={p.isActive('bold')} disabled={!enabled} onClick={cmd('bold')}>
                    <strong>B</strong>
                </Btn>
            )}
            {features.italic && (
                <Btn label={labels.italic} active={p.isActive('italic')} disabled={!enabled} onClick={cmd('italic')}>
                    <em>I</em>
                </Btn>
            )}
            {features.underline && (
                <Btn label={labels.underline} active={p.isActive('underline')} disabled={!enabled} onClick={cmd('underline')}>
                    <span style={{ textDecoration: 'underline' }}>U</span>
                </Btn>
            )}
            {features.strike && (
                <Btn label={labels.strike} active={p.isActive('strike')} disabled={!enabled} onClick={cmd('strike')}>
                    <span style={{ textDecoration: 'line-through' }}>S</span>
                </Btn>
            )}
            {features.headings && (
                <>
                    <span className="mustry-rte-sep" />
                    <Btn label={labels.paragraph} active={p.isActive('paragraph')} disabled={!enabled} onClick={cmd('paragraph')}>
                        P
                    </Btn>
                    {[1, 2, 3].map((n) => (
                        <Btn
                            key={n}
                            label={fillLabel(labels.heading, { n })}
                            active={p.isActive('heading', { level: n })}
                            disabled={!enabled}
                            onClick={cmd('heading', n)}
                        >
                            {`H${n}`}
                        </Btn>
                    ))}
                </>
            )}
            {(features.bulletList || features.orderedList) && <span className="mustry-rte-sep" />}
            {features.bulletList && (
                <Btn label={labels.bulletList} active={p.isActive('bulletList')} disabled={!enabled} onClick={cmd('bulletList')}>
                    ••
                </Btn>
            )}
            {features.orderedList && (
                <Btn label={labels.orderedList} active={p.isActive('orderedList')} disabled={!enabled} onClick={cmd('orderedList')}>
                    1.
                </Btn>
            )}
            {features.checklist && (
                <Btn label={labels.checklist} active={p.isActive('taskList')} disabled={!enabled} onClick={cmd('checklist')}>
                    ☑
                </Btn>
            )}
            {features.link && (
                <>
                    <span className="mustry-rte-sep" />
                    <Btn label={labels.link} active={p.isActive('link') || p.linkOpen} disabled={!enabled} onClick={p.onLinkToggle}>
                        🔗
                    </Btn>
                </>
            )}
            {features.table && (
                <>
                    <span className="mustry-rte-sep" />
                    <Btn label={labels.table} active={p.isActive('table')} disabled={!enabled} onClick={cmd('insertTable')}>
                        ⊞
                    </Btn>
                    {p.isActive('table') && (
                        <>
                            <Btn label={labels.addRow} active={false} disabled={!enabled} onClick={cmd('addRow')}>+↓</Btn>
                            <Btn label={labels.addColumn} active={false} disabled={!enabled} onClick={cmd('addColumn')}>+→</Btn>
                            <Btn label={labels.deleteTable} active={false} disabled={!enabled} onClick={cmd('deleteTable')}>⊟</Btn>
                        </>
                    )}
                </>
            )}
            {features.image && (
                <Btn label={labels.image} active={p.imageOpen} disabled={!enabled} onClick={p.onImageToggle}>
                    🖼
                </Btn>
            )}

            <span className="mustry-rte-spring" />
            {p.dirty && <span className="mustry-rte-dirty-badge">{labels.unsaved}</span>}
            {p.dirty && (
                <button type="button" className="mustry-rte-save-btn" disabled={!enabled} onClick={p.onSave}>
                    {labels.save}
                </button>
            )}
            {p.dirty && (
                <button
                    type="button"
                    className="mustry-rte-btn mustry-rte-discard-btn"
                    title={labels.discard}
                    aria-label={labels.discard}
                    disabled={!enabled}
                    onClick={p.onDiscard}
                >
                    ✕
                </button>
            )}

            {p.linkOpen && (
                <div className="mustry-rte-linkrow">
                    <input
                        type="text"
                        className="mustry-rte-linkinput"
                        placeholder={labels.linkPlaceholder}
                        value={p.linkValue}
                        onChange={(e) => p.onLinkChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); p.onLinkApply(); }
                            if (e.key === 'Escape') { e.preventDefault(); p.onLinkToggle(); }
                        }}
                    />
                    <button type="button" className="mustry-rte-save-btn" onClick={p.onLinkApply}>{labels.apply}</button>
                    <button type="button" className="mustry-rte-btn" onClick={p.onLinkRemove}>{labels.removeLink}</button>
                </div>
            )}
            {p.imageOpen && (
                <div className="mustry-rte-linkrow">
                    <input
                        type="text"
                        className="mustry-rte-linkinput mustry-rte-imageinput"
                        placeholder={labels.imagePlaceholder}
                        value={p.imageValue}
                        onChange={(e) => p.onImageChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); p.onImageApply(); }
                            if (e.key === 'Escape') { e.preventDefault(); p.onImageToggle(); }
                        }}
                    />
                    <button type="button" className="mustry-rte-save-btn" onClick={p.onImageApply}>{labels.apply}</button>
                </div>
            )}
        </div>
    );
}
