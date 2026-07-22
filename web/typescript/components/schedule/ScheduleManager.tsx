import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { weekdayHeaders } from '../../shared/dateUtils';
import { dayRanges, isActiveAt, orderedDays, ScheduleItem } from './scheduleLogic';
import { ScheduleManagerProps, mapScheduleProps } from './scheduleProps';
import { ScheduleList } from './ScheduleList';
import { WeekGrid, WeekGridDay } from './WeekGrid';

// Must match ScheduleManager.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.ingots.admin.schedulemanager';

/**
 * Schedule Manager — first of the admin family. Renders the gateway's user
 * schedules (bound as data.schedules, a flat mirror of Ignition's
 * BasicScheduleModel beans) as a master-detail: schedule list + a week grid of
 * painted availability. This milestone is read-only; selection is two-way via
 * state.selectedSchedule. Editing (drag-to-paint + onScheduleSave) is M1 —
 * see docs/admin-components-plan.md.
 */
export class ScheduleManager extends Component<ComponentProps<ScheduleManagerProps>, {}> {

    componentDidMount(): void {
        this.writeOutputs();
        this.ensureSelection();
    }

    componentDidUpdate(): void {
        this.writeOutputs();
        this.ensureSelection();
    }

    private writeOutputs(): void {
        this.props.store.props.write('output.count', this.props.props.schedules.length);
    }

    /** Auto-select the first schedule when the bound selection names nothing. */
    private ensureSelection(): void {
        const p = this.props.props;
        if (p.schedules.length === 0) {
            return;
        }
        if (!p.schedules.some((s) => s.name === p.selectedSchedule)) {
            this.props.store.props.write('state.selectedSchedule', p.schedules[0].name);
        }
    }

    private onSelect = (name: string): void => {
        this.props.store.props.write('state.selectedSchedule', name);
    };

    private selected(): ScheduleItem | undefined {
        const p = this.props.props;
        return p.schedules.find((s) => s.name === p.selectedSchedule);
    }

    /** Active-at-render-time flags for the list dots (snapshot, no timer). */
    private activeFlags(): boolean[] {
        const now = new Date();
        const dayIndex = (now.getDay() + 6) % 7; // JS 0=Sunday → 0=Monday
        const minute = now.getHours() * 60 + now.getMinutes();
        return this.props.props.schedules.map((s) => isActiveAt(s, dayIndex, minute));
    }

    private gridDays(item: ScheduleItem): WeekGridDay[] {
        const p = this.props.props;
        const headers = weekdayHeaders(p.firstDayOfWeek === 'monday', p.locale);
        return orderedDays(p.firstDayOfWeek).map((key, i) => ({
            key,
            label: headers[i],
            ranges: dayRanges(item, key)
        }));
    }

    private renderDetail(): React.ReactNode {
        const p = this.props.props;
        const item = this.selected();
        if (!item) {
            return (
                <div className="mustry-sched-detail mustry-sched-detail--empty">
                    {p.schedules.length === 0 ? p.labels.noSchedules : p.labels.noSelection}
                </div>
            );
        }
        const badges: string[] = [];
        if (item.allDays) {
            badges.push(p.labels.allDays);
        }
        if (item.repeatAlternating) {
            badges.push(p.labels.alternating);
        }
        if (item.observeHolidays) {
            badges.push(p.labels.observesHolidays);
        }
        return (
            <div className="mustry-sched-detail">
                <div className="mustry-sched-detail-head">
                    <span className="mustry-sched-detail-name">{item.name}</span>
                    {item.description !== '' && (
                        <span className="mustry-sched-detail-desc">{item.description}</span>
                    )}
                    {badges.map((b) => (
                        <span key={b} className="mustry-sched-badge">{b}</span>
                    ))}
                </div>
                <WeekGrid days={this.gridDays(item)} startHour={p.dayStartHour} endHour={p.dayEndHour} />
            </div>
        );
    }

    render() {
        const p = this.props.props;
        return (
            <div {...this.props.emit({ classes: ['mustry-schedmgr'] })}>
                <ScheduleList
                    items={p.schedules}
                    selectedName={p.selectedSchedule}
                    activeFlags={this.activeFlags()}
                    labels={p.labels}
                    onSelect={this.onSelect}
                />
                {this.renderDetail()}
            </div>
        );
    }
}

export class ScheduleManagerMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return ScheduleManager as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 720, height: 420 };
    }

    getPropsReducer(tree: PropertyTree): ScheduleManagerProps {
        return mapScheduleProps(tree);
    }
}
