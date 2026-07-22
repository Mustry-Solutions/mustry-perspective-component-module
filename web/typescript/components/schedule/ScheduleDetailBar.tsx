import * as React from 'react';
import { ScheduleManagerLabels } from '../../shared/labels/schedule';
import { ScheduleDraft } from './scheduleEditLogic';
import { ScheduleItem } from './scheduleLogic';

interface ScheduleDetailBarProps {
    /** The bound schedule (null in the create flow — there is no item yet). */
    item: ScheduleItem | null;
    /** The live draft while editable (null in read-only mode). */
    draft: ScheduleDraft | null;
    editable: boolean;
    /** The name being edited (rename / create); '' hides the name input. */
    nameDraft: string;
    /** Validation state of nameDraft (null = fine). */
    nameError: 'empty' | 'duplicate' | null;
    labels: ScheduleManagerLabels;
    onNameChange: (name: string) => void;
    onDraftChange: (patch: Partial<ScheduleDraft>) => void;
}

/**
 * The detail pane's IDENTITY header: schedule name (an input while editable —
 * rename for existing schedules, initial name in the create flow, with
 * floating validation), description input, the allDays/observeHolidays
 * toggles and the read-only alternating badge. Actions (Save/Discard/Delete)
 * live in the shared AdminFooter, not here.
 */
export function ScheduleDetailBar(props: ScheduleDetailBarProps): JSX.Element {
    const { item, draft, editable, nameError, labels } = props;
    const editing = editable && draft !== null;
    const d = draft as ScheduleDraft;

    return (
        <div className="mustry-sched-detail-head">
            {editing ? (
                <span className="mustry-sched-name-wrap">
                    <input
                        className={'mustry-sched-name-input' + (nameError ? ' mustry-sched-name-input--invalid' : '')}
                        type="text"
                        value={props.nameDraft}
                        placeholder={labels.name}
                        aria-label={labels.name}
                        onChange={(e) => props.onNameChange(e.target.value)}
                    />
                    {nameError && (
                        <span className="mustry-sched-name-error">
                            {nameError === 'empty' ? labels.nameRequired : labels.nameTaken}
                        </span>
                    )}
                </span>
            ) : (
                <span className="mustry-sched-detail-name">{item ? item.name : ''}</span>
            )}
            {editing ? (
                <input
                    className="mustry-sched-desc-input"
                    type="text"
                    value={d.description}
                    placeholder={labels.description}
                    aria-label={labels.description}
                    onChange={(e) => props.onDraftChange({ description: e.target.value })}
                />
            ) : (
                item && item.description !== '' && (
                    <span className="mustry-sched-detail-desc">{item.description}</span>
                )
            )}
            {editing ? (
                <React.Fragment>
                    <label className="mustry-sched-toggle">
                        <input
                            type="checkbox"
                            checked={d.allDays}
                            onChange={(e) => props.onDraftChange({ allDays: e.target.checked })}
                        />
                        {labels.allDays}
                    </label>
                    <label className="mustry-sched-toggle">
                        <input
                            type="checkbox"
                            checked={d.observeHolidays}
                            onChange={(e) => props.onDraftChange({ observeHolidays: e.target.checked })}
                        />
                        {labels.observesHolidays}
                    </label>
                </React.Fragment>
            ) : (
                item && (
                    <React.Fragment>
                        {item.allDays && <span className="mustry-sched-badge">{labels.allDays}</span>}
                        {item.observeHolidays && <span className="mustry-sched-badge">{labels.observesHolidays}</span>}
                    </React.Fragment>
                )
            )}
            {item && item.repeatAlternating && <span className="mustry-sched-badge">{labels.alternating}</span>}
        </div>
    );
}
