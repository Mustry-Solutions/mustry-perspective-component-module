// Built-in new/edit-event editor (centered modal, portaled to document.body).
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Category, Editor } from './types';
import { categoryColor, UNCATEGORIZED_COLOR } from './eventStyle';

interface EventEditorProps {
    editor: Editor;
    categories: Category[];
    timezone: string;   // display zone; shown as a hint since datetime-local is browser-local
    onUpdate: (patch: Partial<Editor>) => void;
    onToggleAllDay: (allDay: boolean) => void;
    onCancel: () => void;
    onSave: () => void;
    onDelete: () => void;
}

export function EventEditor(props: EventEditorProps): React.ReactElement {
    const { editor: ed, categories, timezone, onUpdate, onToggleAllDay, onCancel, onSave, onDelete } = props;
    const dtType = ed.allDay ? 'date' : 'datetime-local';
    const isEdit = ed.id !== null;
    return ReactDOM.createPortal(
        <div className="cal-editor-backdrop" onMouseDown={onCancel}>
            <div
                className="cal-editor"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape') { onCancel(); } }}
            >
                <div className="cal-editor-head">{isEdit ? 'Edit event' : 'New event'}</div>
                <label className="cal-editor-field">
                    <span>Title</span>
                    <input
                        type="text" autoFocus value={ed.title} placeholder="Event title"
                        onChange={(e) => onUpdate({ title: e.target.value })}
                    />
                </label>
                <label className="cal-editor-check">
                    <input type="checkbox" checked={ed.allDay} onChange={(e) => onToggleAllDay(e.target.checked)} />
                    <span>All day</span>
                </label>
                <div className="cal-editor-row">
                    <label className="cal-editor-field">
                        <span>Start</span>
                        <input type={dtType} value={ed.start} onChange={(e) => onUpdate({ start: e.target.value })} />
                    </label>
                    <label className="cal-editor-field">
                        <span>End</span>
                        <input type={dtType} value={ed.end} onChange={(e) => onUpdate({ end: e.target.value })} />
                    </label>
                </div>
                {!ed.allDay && timezone && (
                    <div className="cal-editor-tz">Times in {timezone}</div>
                )}
                {(categories || []).length > 0 && (
                    <label className="cal-editor-field">
                        <span>Category</span>
                        <div className="cal-editor-catrow">
                            <span className="cal-editor-cat-dot" style={{ background: categoryColor(categories, ed.category) || UNCATEGORIZED_COLOR }} />
                            <select
                                className="cal-editor-select"
                                value={ed.category}
                                onChange={(e) => onUpdate({ category: e.target.value })}
                            >
                                <option value="">None</option>
                                {(categories || []).map((c) => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                            </select>
                        </div>
                    </label>
                )}
                <label className="cal-editor-field">
                    <span>Notes</span>
                    <textarea rows={2} value={ed.description} onChange={(e) => onUpdate({ description: e.target.value })} />
                </label>
                <div className="cal-editor-actions">
                    {isEdit && (
                        <button type="button" className="cal-editor-btn cal-editor-btn--danger" onClick={onDelete}>Delete</button>
                    )}
                    <span className="cal-editor-actions-spacer" />
                    <button type="button" className="cal-editor-btn" onClick={onCancel}>Cancel</button>
                    <button type="button" className="cal-editor-btn cal-editor-btn--primary" onClick={onSave}>{isEdit ? 'Save' : 'Create'}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
