import * as React from 'react';
import { ScheduleManagerLabels } from '../../shared/labels/schedule';
import { formatMinutes, ScheduleItem, Transition, isActiveAt, nextTransition } from './scheduleLogic';

interface SchedulePreviewStripProps {
    item: ScheduleItem;
    /** 0 = Monday .. 6 = Sunday, of "now". */
    dayIndex: number;
    /** Minute of "now" (0..1439). */
    minute: number;
    /** Localized short weekday names, Monday-first (index by Transition.dayIndex). */
    weekdayNames: string[];
    labels: ScheduleManagerLabels;
}

function fill(template: string, day: string, time: string): string {
    return template.replace('{day}', day).replace('{time}', time);
}

/**
 * The strip Vision's component never had: is this schedule active right now,
 * and when does that change? Pure evaluation (isActiveAt/nextTransition);
 * the shell's minute ticker keeps it honest.
 */
export function SchedulePreviewStrip(props: SchedulePreviewStripProps): JSX.Element {
    const { item, dayIndex, minute, weekdayNames, labels } = props;
    const active = isActiveAt(item, dayIndex, minute);
    const t: Transition | null = nextTransition(item, dayIndex, minute);

    let text: string;
    if (t) {
        const day = weekdayNames[t.dayIndex] || '';
        const time = formatMinutes(t.minute);
        text = active ? fill(labels.activeUntil, day, time) : fill(labels.inactiveUntil, day, time);
    } else {
        text = active ? labels.activeNow : labels.inactive;
    }

    return (
        <div className={'mustry-sched-strip' + (active ? ' mustry-sched-strip--active' : '')}>
            <span className="mustry-sched-strip-dot" />
            <span className="mustry-sched-strip-text">{text}</span>
        </div>
    );
}
