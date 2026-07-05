// Built-in new/edit-event editor (centered modal, portaled to document.body).
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { intlFormat } from '../../shared/dateUtils';
import { CalLabels, Category, Editor } from './types';
import { editorProblem } from './editorLogic';
import { UNCATEGORIZED_COLOR } from '../../shared/eventStyle';

interface EventEditorProps {
    editor: Editor;
    categories: Category[];
    timezone: string;   // display zone; shown as a hint since datetime-local is browser-local
    locale: string;     // for the weekly weekday initials
    labels: CalLabels;
    onUpdate: (patch: Partial<Editor>) => void;
    onToggleAllDay: (allDay: boolean) => void;
    onCancel: () => void;
    onSave: () => void;
    onDelete: () => void;
}

export function EventEditor(props: EventEditorProps): React.ReactElement {
    const { editor: ed, categories, timezone, locale, labels, onUpdate, onToggleAllDay, onCancel, onSave, onDelete } = props;
    const dtType = ed.allDay ? 'date' : 'datetime-local';
    const isEdit = ed.id !== null;
    const problem = editorProblem(ed);   // non-null blocks Save
    const selCat = (categories || []).find((c) => c.id === ed.category);
    const catColor = (selCat && selCat.color) || UNCATEGORIZED_COLOR;

    // Recurrence UI state. Editing one occurrence of a series shows an apply-to choice;
    // the repeat rule is only editable when acting on the whole series (or a non-series event).
    const editingOccurrence = ed.seriesId !== null;
    const showRepeat = !editingOccurrence || ed.scope === 'series';
    // Localized weekday initials, Sunday-first to match rrule.byweekday (0=Sun..6=Sat).
    const wdFmt = intlFormat(locale, { weekday: 'narrow' });
    const WD: string[] = [];
    for (let i = 0; i < 7; i++) {
        WD.push(wdFmt.format(new Date(2024, 0, 7 + i)));   // 2024-01-07 is a Sunday
    }
    const unitLabel: { [k: string]: string } = {
        daily: labels.unitDays, weekly: labels.unitWeeks, monthly: labels.unitMonths, yearly: labels.unitYears
    };
    const toggleWd = (i: number): void => {
        const set = ed.repeatByweekday.slice();
        const at = set.indexOf(i);
        if (at >= 0) { set.splice(at, 1); } else { set.push(i); }
        onUpdate({ repeatByweekday: set });
    };
    return ReactDOM.createPortal(
        <div className="cal-editor-backdrop" onPointerDown={onCancel}>
            <div
                className="cal-editor"
                role="dialog"
                aria-modal="true"
                aria-label={isEdit ? labels.editEvent : labels.newEvent}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape') { onCancel(); } }}
            >
                <div className="cal-editor-head">{isEdit ? labels.editEvent : labels.newEvent}</div>
                {editingOccurrence && (
                    <div className="cal-editor-scope">
                        <label>
                            <input type="radio" checked={ed.scope === 'occurrence'} onChange={() => onUpdate({ scope: 'occurrence' })} />
                            <span>{labels.thisEvent}</span>
                        </label>
                        <label>
                            <input type="radio" checked={ed.scope === 'series'} onChange={() => onUpdate({ scope: 'series' })} />
                            <span>{labels.allEvents}</span>
                        </label>
                    </div>
                )}
                <label className="cal-editor-field">
                    <span>{labels.title}</span>
                    <input
                        type="text" autoFocus value={ed.title} placeholder={labels.eventTitle}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                    />
                </label>
                <label className="cal-editor-check">
                    <input type="checkbox" checked={ed.allDay} onChange={(e) => onToggleAllDay(e.target.checked)} />
                    <span>{labels.allDay}</span>
                </label>
                <div className="cal-editor-row">
                    <label className="cal-editor-field">
                        <span>{labels.start}</span>
                        <input type={dtType} value={ed.start} onChange={(e) => onUpdate({ start: e.target.value })} />
                    </label>
                    <label className="cal-editor-field">
                        <span>{labels.end}</span>
                        <input type={dtType} value={ed.end} onChange={(e) => onUpdate({ end: e.target.value })} />
                    </label>
                </div>
                {!ed.allDay && timezone && (
                    <div className="cal-editor-tz">{labels.timesIn.replace('{tz}', timezone)}</div>
                )}
                {problem === 'range' && (
                    <div className="cal-editor-problem">{labels.invalidRange}</div>
                )}
                {showRepeat && (
                    <label className="cal-editor-field">
                        <span>{labels.repeat}</span>
                        <select
                            className="cal-editor-select"
                            value={ed.repeatFreq}
                            onChange={(e) => onUpdate({ repeatFreq: e.target.value as Editor['repeatFreq'] })}
                        >
                            <option value="">{labels.doesNotRepeat}</option>
                            <option value="daily">{labels.daily}</option>
                            <option value="weekly">{labels.weekly}</option>
                            <option value="monthly">{labels.monthly}</option>
                            <option value="yearly">{labels.yearly}</option>
                        </select>
                    </label>
                )}
                {showRepeat && ed.repeatFreq && (
                    <div className="cal-editor-repeat">
                        <div className="cal-editor-repeat-line">
                            <span>{labels.every}</span>
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
                            <span className="cal-editor-ends-label">{labels.ends}</span>
                            <label>
                                <input type="radio" checked={ed.repeatEndMode === 'never'} onChange={() => onUpdate({ repeatEndMode: 'never' })} />
                                <span>{labels.never}</span>
                            </label>
                            <label>
                                <input type="radio" checked={ed.repeatEndMode === 'until'} onChange={() => onUpdate({ repeatEndMode: 'until' })} />
                                <span>{labels.on}</span>
                                <input
                                    type="date" className="cal-editor-ends-input" value={ed.repeatUntil}
                                    onChange={(e) => onUpdate({ repeatUntil: e.target.value, repeatEndMode: 'until' })}
                                />
                            </label>
                            <label>
                                <input type="radio" checked={ed.repeatEndMode === 'count'} onChange={() => onUpdate({ repeatEndMode: 'count' })} />
                                <span>{labels.after}</span>
                                <input
                                    type="number" min={1} className="cal-editor-num"
                                    value={ed.repeatCount}
                                    onChange={(e) => onUpdate({ repeatCount: Math.max(1, parseInt(e.target.value, 10) || 1), repeatEndMode: 'count' })}
                                />
                                <span>{labels.times}</span>
                            </label>
                        </div>
                    </div>
                )}
                {(categories || []).length > 0 && (
                    <label className="cal-editor-field">
                        <span>{labels.category}</span>
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
