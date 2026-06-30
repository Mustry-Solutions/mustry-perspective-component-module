// Built-in new/edit-event editor (centered modal, portaled to document.body).
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { Category, Editor } from './types';
import { UNCATEGORIZED_COLOR } from './eventStyle';

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
    const selCat = (categories || []).find((c) => c.id === ed.category);
    const catColor = (selCat && selCat.color) || UNCATEGORIZED_COLOR;

    // Recurrence UI state. Editing one occurrence of a series shows an apply-to choice;
    // the repeat rule is only editable when acting on the whole series (or a non-series event).
    const editingOccurrence = ed.seriesId !== null;
    const showRepeat = !editingOccurrence || ed.scope === 'series';
    const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const unitLabel: { [k: string]: string } = { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' };
    const toggleWd = (i: number): void => {
        const set = ed.repeatByweekday.slice();
        const at = set.indexOf(i);
        if (at >= 0) { set.splice(at, 1); } else { set.push(i); }
        onUpdate({ repeatByweekday: set });
    };
    return ReactDOM.createPortal(
        <div className="cal-editor-backdrop" onMouseDown={onCancel}>
            <div
                className="cal-editor"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape') { onCancel(); } }}
            >
                <div className="cal-editor-head">{isEdit ? 'Edit event' : 'New event'}</div>
                {editingOccurrence && (
                    <div className="cal-editor-scope">
                        <label>
                            <input type="radio" checked={ed.scope === 'occurrence'} onChange={() => onUpdate({ scope: 'occurrence' })} />
                            <span>This event</span>
                        </label>
                        <label>
                            <input type="radio" checked={ed.scope === 'series'} onChange={() => onUpdate({ scope: 'series' })} />
                            <span>All events</span>
                        </label>
                    </div>
                )}
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
                {showRepeat && (
                    <label className="cal-editor-field">
                        <span>Repeat</span>
                        <select
                            className="cal-editor-select"
                            value={ed.repeatFreq}
                            onChange={(e) => onUpdate({ repeatFreq: e.target.value as Editor['repeatFreq'] })}
                        >
                            <option value="">Does not repeat</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                        </select>
                    </label>
                )}
                {showRepeat && ed.repeatFreq && (
                    <div className="cal-editor-repeat">
                        <div className="cal-editor-repeat-line">
                            <span>Every</span>
                            <input
                                type="number" min={1} className="cal-editor-num"
                                value={ed.repeatInterval}
                                onChange={(e) => onUpdate({ repeatInterval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            />
                            <span>{unitLabel[ed.repeatFreq]}</span>
                        </div>
                        {ed.repeatFreq === 'weekly' && (
                            <div className="cal-editor-weekdays">
                                {WD.map((lbl, i) => (
                                    <button
                                        type="button" key={i}
                                        className={'cal-wd' + (ed.repeatByweekday.indexOf(i) >= 0 ? ' cal-wd--on' : '')}
                                        onClick={() => toggleWd(i)}
                                    >{lbl}</button>
                                ))}
                            </div>
                        )}
                        <div className="cal-editor-ends">
                            <span className="cal-editor-ends-label">Ends</span>
                            <label>
                                <input type="radio" checked={ed.repeatEndMode === 'never'} onChange={() => onUpdate({ repeatEndMode: 'never' })} />
                                <span>Never</span>
                            </label>
                            <label>
                                <input type="radio" checked={ed.repeatEndMode === 'until'} onChange={() => onUpdate({ repeatEndMode: 'until' })} />
                                <span>On</span>
                                <input
                                    type="date" className="cal-editor-ends-input" value={ed.repeatUntil}
                                    onChange={(e) => onUpdate({ repeatUntil: e.target.value, repeatEndMode: 'until' })}
                                />
                            </label>
                            <label>
                                <input type="radio" checked={ed.repeatEndMode === 'count'} onChange={() => onUpdate({ repeatEndMode: 'count' })} />
                                <span>After</span>
                                <input
                                    type="number" min={1} className="cal-editor-num"
                                    value={ed.repeatCount}
                                    onChange={(e) => onUpdate({ repeatCount: Math.max(1, parseInt(e.target.value, 10) || 1), repeatEndMode: 'count' })}
                                />
                                <span>times</span>
                            </label>
                        </div>
                    </div>
                )}
                {(categories || []).length > 0 && (
                    <label className="cal-editor-field">
                        <span>Category</span>
                        <div className="cal-editor-catrow">
                            {selCat && selCat.icon ? (
                                <span className="cal-editor-cat-icon">
                                    <IconRenderer path={selCat.icon} color={catColor} />
                                </span>
                            ) : (
                                <span className="cal-editor-cat-dot" style={{ background: catColor }} />
                            )}
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
