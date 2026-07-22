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
import { dayRanges, isActiveAt, orderedDays, DayKey, MINUTES_PER_DAY, ScheduleItem } from './scheduleLogic';
import {
    applyPaint, applyResize, draftEquals, draftFromItem, draftToFlat, removeRange, ScheduleDraft
} from './scheduleEditLogic';
import {
    ScheduleGesture, ScheduleGestureController, ScheduleGestureKind, ScheduleGesturePreview
} from './scheduleGestureController';
import { ScheduleManagerProps, mapScheduleProps } from './scheduleProps';
import { ScheduleList } from './ScheduleList';
import { ScheduleDetailBar } from './ScheduleDetailBar';
import { WeekGrid, WeekGridDay } from './WeekGrid';

// Must match ScheduleManager.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.ingots.admin.schedulemanager';

/** How long the Delete button stays in its confirm step before reverting. */
const CONFIRM_DELETE_MS = 4000;

interface ScheduleManagerState {
    /** The editable draft of the selected schedule (null = nothing selected). */
    draft: ScheduleDraft | null;
    /** Which schedule name the draft belongs to (selection-change detection). */
    draftFor: string;
    preview: ScheduleGesturePreview | null;
    confirmingDelete: boolean;
}

/**
 * Schedule Manager — first of the admin family. Master-detail over the
 * gateway's user schedules (data.schedules, a flat mirror of Ignition's
 * BasicScheduleModel beans): schedule list + week grid of painted
 * availability. M1: the grid is a paint surface — drag empty space to add
 * availability, drag block edges to resize, click a block to remove; edits
 * are draft-only until Save fires onScheduleSave (the author's script
 * persists via system.user.editSchedule and refreshes the binding).
 * Controlled throughout; selection is two-way via state.selectedSchedule.
 */
export class ScheduleManager extends Component<ComponentProps<ScheduleManagerProps>, ScheduleManagerState> {

    private gestures: ScheduleGestureController;
    private confirmTimer: number | null = null;

    constructor(props: ComponentProps<ScheduleManagerProps>) {
        super(props);
        this.state = { draft: null, draftFor: '', preview: null, confirmingDelete: false };
        this.gestures = new ScheduleGestureController(
            {
                setPreview: (p) => this.setState({ preview: p }),
                commit: this.onGestureCommit
            },
            () => ({
                startHour: this.props.props.dayStartHour,
                endHour: this.props.props.dayEndHour,
                snapMinutes: this.props.props.snapMinutes
            })
        );
    }

    componentDidMount(): void {
        this.syncDraft();
        this.writeOutputs();
        this.ensureSelection();
    }

    componentDidUpdate(): void {
        this.syncDraft();
        this.writeOutputs();
        this.ensureSelection();
    }

    componentWillUnmount(): void {
        this.gestures.dispose();
        this.clearConfirmTimer();
    }

    // --- draft lifecycle ----------------------------------------------------

    /**
     * Keep the draft in step with props: a selection change always resets it;
     * a bound-data change only refreshes it while it is NOT dirty (an author's
     * polling binding must never clobber an operator's in-progress edit).
     */
    private syncDraft(): void {
        const item = this.selected();
        if (!item) {
            if (this.state.draft !== null) {
                this.setState({ draft: null, draftFor: '', confirmingDelete: false });
            }
            return;
        }
        const selectionChanged = item.name !== this.state.draftFor;
        if (selectionChanged || (this.state.draft && !this.isDirty() && !draftEquals(this.state.draft, draftFromItem(item)))) {
            this.setState({ draft: draftFromItem(item), draftFor: item.name, confirmingDelete: false });
        } else if (this.state.draft === null) {
            this.setState({ draft: draftFromItem(item), draftFor: item.name });
        }
    }

    private isDirty(): boolean {
        const item = this.selected();
        return !!(item && this.state.draft && item.name === this.state.draftFor
            && !draftEquals(this.state.draft, draftFromItem(item)));
    }

    private patchDraft = (patch: Partial<ScheduleDraft>): void => {
        if (this.state.draft) {
            this.setState({ draft: { ...this.state.draft, ...patch } });
        }
    };

    private patchDay(day: DayKey, ranges: ScheduleDraft['ranges'][DayKey]): void {
        const draft = this.state.draft;
        if (draft) {
            this.setState({ draft: { ...draft, ranges: { ...draft.ranges, [day]: ranges } } });
        }
    }

    // --- outputs / selection ------------------------------------------------

    private writeOutputs(): void {
        const w = this.props.store.props;
        w.write('output.count', this.props.props.schedules.length);
        w.write('output.isDirty', this.isDirty());
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

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    // --- editing actions ----------------------------------------------------

    private onGestureCommit = (kind: ScheduleGestureKind, g: ScheduleGesture, preview: ScheduleGesturePreview | null): void => {
        const draft = this.state.draft;
        if (!draft || !preview) {
            return;
        }
        const day = preview.day;
        if (kind === 'paint') {
            this.patchDay(day, applyPaint(draft.ranges[day], preview.range));
        } else {
            this.patchDay(day, applyResize(draft.ranges[day], preview.rangeIndex, preview.range));
        }
    };

    private onRemoveRange = (day: DayKey, index: number): void => {
        const draft = this.state.draft;
        if (draft) {
            this.patchDay(day, removeRange(draft.ranges[day], index));
        }
    };

    private onSave = (): void => {
        const item = this.selected();
        const draft = this.state.draft;
        if (!item || !draft || !this.isDirty()) {
            return;
        }
        this.fireEvent('onScheduleSave', { schedule: draftToFlat(item, draft), isNew: false });
    };

    private onDiscard = (): void => {
        const item = this.selected();
        if (item) {
            this.setState({ draft: draftFromItem(item), draftFor: item.name, confirmingDelete: false });
        }
    };

    private onDelete = (): void => {
        const item = this.selected();
        if (!item) {
            return;
        }
        if (!this.state.confirmingDelete) {
            this.setState({ confirmingDelete: true });
            this.clearConfirmTimer();
            this.confirmTimer = window.setTimeout(() => this.setState({ confirmingDelete: false }), CONFIRM_DELETE_MS);
            return;
        }
        this.clearConfirmTimer();
        this.setState({ confirmingDelete: false });
        this.fireEvent('onScheduleDelete', { name: item.name });
    };

    private clearConfirmTimer(): void {
        if (this.confirmTimer !== null) {
            window.clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
        }
    }

    // --- render -------------------------------------------------------------

    /** Active-at-render-time flags for the list dots (snapshot, no timer). */
    private activeFlags(): boolean[] {
        const now = new Date();
        const dayIndex = (now.getDay() + 6) % 7; // JS 0=Sunday → 0=Monday
        const minute = now.getHours() * 60 + now.getMinutes();
        return this.props.props.schedules.map((s) => isActiveAt(s, dayIndex, minute));
    }

    private gridDays(item: ScheduleItem, draft: ScheduleDraft | null): WeekGridDay[] {
        const p = this.props.props;
        const headers = weekdayHeaders(p.firstDayOfWeek === 'monday', p.locale);
        return orderedDays(p.firstDayOfWeek).map((key, i) => ({
            key,
            label: headers[i],
            ranges: draft
                ? (draft.allDays ? [{ start: 0, end: MINUTES_PER_DAY }] : draft.ranges[key])
                : dayRanges(item, key)
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
        const draft = p.editable ? this.state.draft : null;
        // The grid paints from the draft while editable; painting is suspended
        // while allDays overrides the per-day availability.
        const gridEditable = !!(draft && !draft.allDays);
        return (
            <div className="mustry-sched-detail">
                <ScheduleDetailBar
                    item={item}
                    draft={draft}
                    editable={p.editable}
                    dirty={this.isDirty()}
                    confirmingDelete={this.state.confirmingDelete}
                    labels={p.labels}
                    onDraftChange={this.patchDraft}
                    onSave={this.onSave}
                    onDiscard={this.onDiscard}
                    onDelete={this.onDelete}
                />
                <WeekGrid
                    days={this.gridDays(item, draft)}
                    startHour={p.dayStartHour}
                    endHour={p.dayEndHour}
                    editable={gridEditable}
                    gestures={gridEditable ? this.gestures : null}
                    preview={this.state.preview}
                    clickToRemoveLabel={p.labels.clickToRemove}
                    onRemoveRange={this.onRemoveRange}
                />
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
