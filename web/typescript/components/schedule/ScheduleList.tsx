import * as React from 'react';
import { ScheduleManagerLabels } from '../../shared/labels/schedule';
import { ScheduleItem } from './scheduleLogic';

interface ScheduleListProps {
    items: ScheduleItem[];
    selectedName: string;
    /** Per-item "active at render time" flags, index-aligned with items. */
    activeFlags: boolean[];
    /** Highlight the create button instead of any item (create flow active). */
    creating: boolean;
    /** null hides the create button (config.editable/allowCreate off). */
    onCreate: (() => void) | null;
    labels: ScheduleManagerLabels;
    onSelect: (name: string) => void;
}

/** The left rail: one button per schedule, active-now dot, selection highlight. */
export function ScheduleList(props: ScheduleListProps): JSX.Element {
    const { items, selectedName, activeFlags, creating, labels, onSelect } = props;
    return (
        <div className="mustry-sched-list" role="listbox" aria-label={labels.listHeader}>
            <div className="mustry-sched-list-header">
                {labels.listHeader}
                {props.onCreate && (
                    <button
                        type="button"
                        className={'mustry-sched-new' + (creating ? ' mustry-sched-new--active' : '')}
                        title={labels.newSchedule}
                        onClick={props.onCreate}
                    >
                        + {labels.newSchedule}
                    </button>
                )}
            </div>
            {items.length === 0 && <div className="mustry-sched-empty">{labels.noSchedules}</div>}
            {items.map((s, i) => (
                <div
                    key={`${s.name}-${i}`}
                    className={'mustry-sched-item' + (!creating && s.name === selectedName ? ' mustry-sched-item--selected' : '')}
                    role="option"
                    aria-selected={!creating && s.name === selectedName}
                    tabIndex={0}
                    onClick={() => onSelect(s.name)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.name); } }}
                >
                    <span
                        className={'mustry-sched-dot' + (activeFlags[i] ? ' mustry-sched-dot--active' : '')}
                        title={activeFlags[i] ? labels.activeNow : undefined}
                    />
                    <span className="mustry-sched-item-text">
                        <span className="mustry-sched-item-name">{s.name}</span>
                        {s.description !== '' && <span className="mustry-sched-item-desc">{s.description}</span>}
                    </span>
                </div>
            ))}
        </div>
    );
}
