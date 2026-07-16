// Built-in new/edit-bar editor (centered modal, portaled to document.body).
// Reuses the module's shared .mustry-cal-editor styles (top-level in calendar.scss) so
// both components' editors look identical.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { Category } from '../../shared/types';
import { intlFormat } from '../../shared/dateUtils';
import { TimelineLabels } from '../../shared/labelPacks';
import { UNCATEGORIZED_COLOR, categoryColor } from '../../shared/eventStyle';
import { TimelineResource } from './timelineLogic';
import { TlEditor, tlEditorProblem } from './timelineEditorLogic';

interface TimelineEditorProps {
    editor: TlEditor;
    resources: TimelineResource[];
    categories: Category[];
    timezone: string;   // display zone; shown as a hint since datetime-local is browser-local
    locale: string;     // for the weekly weekday initials
    labels: TimelineLabels;
    onUpdate: (patch: Partial<TlEditor>) => void;
    onCancel: () => void;
    onSave: () => void;
    onDelete: () => void;
}

export function TimelineEditor(props: TimelineEditorProps): React.ReactElement {
    const { editor: ed, resources, categories, timezone, locale, labels, onUpdate, onCancel, onSave, onDelete } = props;
    const isEdit = ed.id !== null;
    const problem = tlEditorProblem(ed, timezone);   // non-null blocks Save
    const selCat = (categories || []).find((c) => c.id === ed.category);
    const catColor = (selCat && selCat.color) || UNCATEGORIZED_COLOR;

    // Recurrence UI state (mirrors the calendar's editor). Editing one occurrence
    // shows the apply-to choice; the rule is only editable on the whole series.
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
        <div className="mustry-cal-editor-backdrop" onPointerDown={onCancel}>
            <div
                className="mustry-cal-editor"
                role="dialog"
                aria-modal="true"
                aria-label={isEdit ? labels.editEvent : labels.newEvent}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape') { onCancel(); } }}
            >
                <div className="mustry-cal-editor-head">{isEdit ? labels.editEvent : labels.newEvent}</div>
                {ed.seriesId !== null && (
                    <div className="mustry-cal-editor-scope">
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
                <label className="mustry-cal-editor-field">
                    <span>{labels.title}</span>
                    <input
                        type="text" autoFocus value={ed.title} placeholder={labels.eventTitle}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                    />
                </label>
                <label className="mustry-cal-editor-field">
                    <span>{labels.resource}</span>
                    <select
                        className="mustry-cal-editor-select"
                        value={ed.resourceId}
                        onChange={(e) => onUpdate({ resourceId: e.target.value })}
                    >
                        {(resources || []).map((r) => (
                            <option key={r.id} value={r.id}>{r.group ? `${r.group} — ${r.label}` : r.label}</option>
                        ))}
                    </select>
                </label>
                <div className="mustry-cal-editor-row">
                    <label className="mustry-cal-editor-field">
                        <span>{labels.start}</span>
                        <input type="datetime-local" value={ed.start} onChange={(e) => onUpdate({ start: e.target.value })} />
                    </label>
                    <label className="mustry-cal-editor-field">
                        <span>{labels.end}</span>
                        <input type="datetime-local" value={ed.end} onChange={(e) => onUpdate({ end: e.target.value })} />
                    </label>
                </div>
                {timezone && (
                    <div className="mustry-cal-editor-tz">{labels.timesIn.replace('{tz}', timezone)}</div>
                )}
                {problem === 'range' && (
                    <div className="mustry-cal-editor-problem">{labels.invalidRange}</div>
                )}
                {showRepeat && (
                    <label className="mustry-cal-editor-field">
                        <span>{labels.repeat}</span>
                        <select
                            className="mustry-cal-editor-select"
                            value={ed.repeatFreq}
                            onChange={(e) => onUpdate({ repeatFreq: e.target.value as TlEditor['repeatFreq'] })}
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
                    <div className="mustry-cal-editor-repeat">
                        <div className="mustry-cal-editor-repeat-line">
                            <span>{labels.every}</span>
                            <input
                                type="number" min={1} className="mustry-cal-editor-num"
                                value={ed.repeatInterval}
                                onChange={(e) => onUpdate({ repeatInterval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            />
                            <span>{unitLabel[ed.repeatFreq]}</span>
                        </div>
                        {ed.repeatFreq === 'weekly' && (
                            <div className="mustry-cal-editor-weekdays">
                                {WD.map((lbl, i) => (
                                    <button
                                        type="button" key={i}
                                        className={'mustry-cal-wd' + (ed.repeatByweekday.indexOf(i) >= 0 ? ' mustry-cal-wd--on' : '')}
                                        onClick={() => toggleWd(i)}
                                    >{lbl}</button>
                                ))}
                            </div>
                        )}
                        <div className="mustry-cal-editor-ends">
                            <span className="mustry-cal-editor-ends-label">{labels.ends}</span>
                            <label>
                                <input type="radio" checked={ed.repeatEndMode === 'never'} onChange={() => onUpdate({ repeatEndMode: 'never' })} />
                                <span>{labels.never}</span>
                            </label>
                            <label>
                                <input type="radio" checked={ed.repeatEndMode === 'until'} onChange={() => onUpdate({ repeatEndMode: 'until' })} />
                                <span>{labels.on}</span>
                                <input
                                    type="date" className="mustry-cal-editor-ends-input" value={ed.repeatUntil}
                                    onChange={(e) => onUpdate({ repeatUntil: e.target.value, repeatEndMode: 'until' })}
                                />
                            </label>
                            <label>
                                <input type="radio" checked={ed.repeatEndMode === 'count'} onChange={() => onUpdate({ repeatEndMode: 'count' })} />
                                <span>{labels.after}</span>
                                <input
                                    type="number" min={1} className="mustry-cal-editor-num"
                                    value={ed.repeatCount}
                                    onChange={(e) => onUpdate({ repeatCount: Math.max(1, parseInt(e.target.value, 10) || 1), repeatEndMode: 'count' })}
                                />
                                <span>{labels.times}</span>
                            </label>
                        </div>
                    </div>
                )}
                {(categories || []).length > 0 && (
                    <label className="mustry-cal-editor-field">
                        <span>{labels.category}</span>
                        <div className="mustry-cal-editor-catrow">
                            {selCat && selCat.icon ? (
                                <span className="mustry-cal-editor-cat-icon">
                                    <IconRenderer path={selCat.icon} color={categoryColor(categories, ed.category) || catColor} />
                                </span>
                            ) : (
                                <span className="mustry-cal-editor-cat-dot" style={{ background: catColor }} />
                            )}
                            <select
                                className="mustry-cal-editor-select"
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
                <label className="mustry-cal-editor-field">
                    <span>{labels.notes}</span>
                    <textarea rows={2} value={ed.description} onChange={(e) => onUpdate({ description: e.target.value })} />
                </label>
                <div className="mustry-cal-editor-actions">
                    {isEdit && (
                        <button type="button" className="mustry-cal-editor-btn mustry-cal-editor-btn--danger" onClick={onDelete}>{labels.delete}</button>
                    )}
                    <span className="mustry-cal-editor-actions-spacer" />
                    <button type="button" className="mustry-cal-editor-btn" onClick={onCancel}>{labels.cancel}</button>
                    <button
                        type="button" className="mustry-cal-editor-btn mustry-cal-editor-btn--primary"
                        disabled={problem !== null} onClick={onSave}
                    >{isEdit ? labels.save : labels.create}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
