// Built-in new/edit-bar editor (centered modal, portaled to document.body).
// Reuses the module's shared .cal-editor styles (top-level in calendar.scss) so
// both components' editors look identical.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { Category } from '../../shared/types';
import { TimelineLabels } from '../../shared/labelPacks';
import { UNCATEGORIZED_COLOR, categoryColor } from '../../shared/eventStyle';
import { TimelineResource } from './timelineLogic';
import { TlEditor, tlEditorProblem } from './timelineEditorLogic';

interface TimelineEditorProps {
    editor: TlEditor;
    resources: TimelineResource[];
    categories: Category[];
    timezone: string;   // display zone; shown as a hint since datetime-local is browser-local
    labels: TimelineLabels;
    onUpdate: (patch: Partial<TlEditor>) => void;
    onCancel: () => void;
    onSave: () => void;
    onDelete: () => void;
}

export function TimelineEditor(props: TimelineEditorProps): React.ReactElement {
    const { editor: ed, resources, categories, timezone, labels, onUpdate, onCancel, onSave, onDelete } = props;
    const isEdit = ed.id !== null;
    const problem = tlEditorProblem(ed, timezone);   // non-null blocks Save
    const selCat = (categories || []).find((c) => c.id === ed.category);
    const catColor = (selCat && selCat.color) || UNCATEGORIZED_COLOR;
    return ReactDOM.createPortal(
        <div className="cal-editor-backdrop" onPointerDown={onCancel}>
            <div
                className="cal-editor"
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape') { onCancel(); } }}
            >
                <div className="cal-editor-head">{isEdit ? labels.editEvent : labels.newEvent}</div>
                <label className="cal-editor-field">
                    <span>{labels.title}</span>
                    <input
                        type="text" autoFocus value={ed.title} placeholder={labels.eventTitle}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                    />
                </label>
                <label className="cal-editor-field">
                    <span>{labels.resource}</span>
                    <select
                        className="cal-editor-select"
                        value={ed.resourceId}
                        onChange={(e) => onUpdate({ resourceId: e.target.value })}
                    >
                        {(resources || []).map((r) => (
                            <option key={r.id} value={r.id}>{r.group ? `${r.group} — ${r.label}` : r.label}</option>
                        ))}
                    </select>
                </label>
                <div className="cal-editor-row">
                    <label className="cal-editor-field">
                        <span>{labels.start}</span>
                        <input type="datetime-local" value={ed.start} onChange={(e) => onUpdate({ start: e.target.value })} />
                    </label>
                    <label className="cal-editor-field">
                        <span>{labels.end}</span>
                        <input type="datetime-local" value={ed.end} onChange={(e) => onUpdate({ end: e.target.value })} />
                    </label>
                </div>
                {timezone && (
                    <div className="cal-editor-tz">{labels.timesIn.replace('{tz}', timezone)}</div>
                )}
                {problem === 'range' && (
                    <div className="cal-editor-problem">{labels.invalidRange}</div>
                )}
                {(categories || []).length > 0 && (
                    <label className="cal-editor-field">
                        <span>{labels.category}</span>
                        <div className="cal-editor-catrow">
                            {selCat && selCat.icon ? (
                                <span className="cal-editor-cat-icon">
                                    <IconRenderer path={selCat.icon} color={categoryColor(categories, ed.category) || catColor} />
                                </span>
                            ) : (
                                <span className="cal-editor-cat-dot" style={{ background: catColor }} />
                            )}
                            <select
                                className="cal-editor-select"
                                value={ed.category}
                                onChange={(e) => onUpdate({ category: e.target.value })}
                            >
                                <option value="">{labels.none}</option>
                                {(categories || []).map((c) => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                            </select>
                        </div>
                    </label>
                )}
                <label className="cal-editor-field">
                    <span>{labels.notes}</span>
                    <textarea rows={2} value={ed.description} onChange={(e) => onUpdate({ description: e.target.value })} />
                </label>
                <div className="cal-editor-actions">
                    {isEdit && (
                        <button type="button" className="cal-editor-btn cal-editor-btn--danger" onClick={onDelete}>{labels.delete}</button>
                    )}
                    <span className="cal-editor-actions-spacer" />
                    <button type="button" className="cal-editor-btn" onClick={onCancel}>{labels.cancel}</button>
                    <button
                        type="button" className="cal-editor-btn cal-editor-btn--primary"
                        disabled={problem !== null} onClick={onSave}
                    >{isEdit ? labels.save : labels.create}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
