import * as React from 'react';
import { CommitControls } from '../../shared/CommitControls';
import { ScheduleManagerLabels } from '../../shared/labels/schedule';
import { ScheduleDraft } from './scheduleEditLogic';
import { ScheduleItem } from './scheduleLogic';

interface ScheduleDetailBarProps {
    item: ScheduleItem;
    /** The live draft while editable (null in read-only mode). */
    draft: ScheduleDraft | null;
    editable: boolean;
    dirty: boolean;
    confirmingDelete: boolean;
    labels: ScheduleManagerLabels;
    onDraftChange: (patch: Partial<ScheduleDraft>) => void;
    onSave: () => void;
    onDiscard: () => void;
    onDelete: () => void;
}

/**
 * The detail pane's header row: schedule name, description (input while
 * editable), the allDays/observeHolidays toggles, the read-only alternating
 * badge, the shared Save/Discard commit tail, and the two-step Delete button.
 */
export function ScheduleDetailBar(props: ScheduleDetailBarProps): JSX.Element {
    const { item, draft, editable, dirty, confirmingDelete, labels } = props;
    const editing = editable && draft !== null;
    const d = draft as ScheduleDraft;

    return (
        <div className="mustry-sched-detail-head">
            <span className="mustry-sched-detail-name">{item.name}</span>
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
                item.description !== '' && (
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
                <React.Fragment>
                    {item.allDays && <span className="mustry-sched-badge">{labels.allDays}</span>}
                    {item.observeHolidays && <span className="mustry-sched-badge">{labels.observesHolidays}</span>}
                </React.Fragment>
            )}
            {item.repeatAlternating && <span className="mustry-sched-badge">{labels.alternating}</span>}
            <span className="mustry-sched-head-spacer" />
            {editing && (
                <React.Fragment>
                    <CommitControls
                        labels={labels}
                        enabled={true}
                        dirty={dirty}
                        onSave={props.onSave}
                        onDiscard={props.onDiscard}
                    />
                    <button
                        type="button"
                        className={'mustry-sched-delete' + (confirmingDelete ? ' mustry-sched-delete--confirm' : '')}
                        onClick={props.onDelete}
                    >
                        {confirmingDelete ? labels.confirmDelete : labels.delete}
                    </button>
                </React.Fragment>
            )}
        </div>
    );
}
