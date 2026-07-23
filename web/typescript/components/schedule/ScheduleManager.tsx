import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { uniqueCopyName } from '../../shared/adminCommon';
import { weekdayHeaders } from '../../shared/dateUtils';
import { dayRanges, isActiveAt, orderedDays, DAY_KEYS, DayKey, MINUTES_PER_DAY, ScheduleItem } from './scheduleLogic';
import {
    applyPaint, applyResize, draftEquals, draftFromItem, draftToFlat, emptyDraft, newScheduleToFlat,
    removeRange, validateName, ScheduleDraft
} from './scheduleEditLogic';
import {
    ScheduleGesture, ScheduleGestureController, ScheduleGestureKind, ScheduleGesturePreview
} from './scheduleGestureController';
import { ScheduleManagerProps, mapScheduleProps } from './scheduleProps';
import { AdminFooter } from '../../shared/AdminFooter';
import { ScheduleList } from './ScheduleList';
import { ScheduleDetailBar } from './ScheduleDetailBar';
import { SchedulePreviewStrip } from './SchedulePreviewStrip';
import { WeekGrid, WeekGridDay } from './WeekGrid';

// Must match ScheduleManager.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.ingots.admin.schedulemanager';

/** How long the Delete button stays in its confirm step before reverting. */
const CONFIRM_DELETE_MS = 4000;

/** The preview strip / now-line / active dots re-evaluate on this cadence. */
const NOW_TICK_MS = 30_000;

interface ScheduleManagerState {
    /** The editable draft of the selected schedule (null = nothing selected). */
    draft: ScheduleDraft | null;
    /** Which schedule name the draft belongs to (selection-change detection). */
    draftFor: string;
    /** Create flow: editing a brand-new schedule not yet on the gateway. */
    creating: boolean;
    /** The name under edit (rename for existing, initial name when creating). */
    nameDraft: string;
    preview: ScheduleGesturePreview | null;
    confirmingDelete: boolean;
}

/**
 * Schedule Manager — first of the admin family. Master-detail over the
 * gateway's user schedules (data.schedules, a flat mirror of Ignition's
 * BasicScheduleModel beans): schedule list + week grid of painted
 * availability. The grid is a paint surface (drag to add, drag edges to
 * resize, click to remove); name/description/flags edit inline; a create
 * flow starts a blank schedule. Edits stay draft-only until Save fires
 * onScheduleSave ({schedule, isNew, oldName?}) — the author's script
 * persists via system.user and refreshes the binding. The preview strip
 * answers "active now? until when?" on a 30s tick. Controlled throughout;
 * selection is two-way via state.selectedSchedule.
 */
export class ScheduleManager extends Component<ComponentProps<ScheduleManagerProps>, ScheduleManagerState> {

    private gestures: ScheduleGestureController;
    private confirmTimer: number | null = null;
    private nowTimer: number | null = null;

    constructor(props: ComponentProps<ScheduleManagerProps>) {
        super(props);
        this.state = {
            draft: null, draftFor: '', creating: false, nameDraft: '',
            preview: null, confirmingDelete: false
        };
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
        // Keep "now" honest: dots, the now-line and the preview strip drift
        // with the clock even when nothing else re-renders.
        this.nowTimer = window.setInterval(() => this.forceUpdate(() => this.writeOutputs()), NOW_TICK_MS);
    }

    componentDidUpdate(): void {
        this.syncDraft();
        this.writeOutputs();
        this.ensureSelection();
    }

    componentWillUnmount(): void {
        this.gestures.dispose();
        this.clearConfirmTimer();
        if (this.nowTimer !== null) {
            window.clearInterval(this.nowTimer);
        }
    }

    // --- draft lifecycle ----------------------------------------------------

    /**
     * Keep the draft in step with props: a selection change always resets it;
     * a bound-data change only refreshes it while it is NOT dirty (an author's
     * polling binding must never clobber an operator's in-progress edit). The
     * create flow owns its draft entirely — props never touch it.
     */
    private syncDraft(): void {
        if (this.state.creating) {
            return;
        }
        const item = this.selected();
        if (!item) {
            if (this.state.draft !== null) {
                this.setState({ draft: null, draftFor: '', nameDraft: '', confirmingDelete: false });
            }
            return;
        }
        const selectionChanged = item.name !== this.state.draftFor;
        if (selectionChanged || (this.state.draft && !this.isDirty() && !draftEquals(this.state.draft, draftFromItem(item)))) {
            this.setState({
                draft: draftFromItem(item), draftFor: item.name, nameDraft: item.name, confirmingDelete: false
            });
        } else if (this.state.draft === null) {
            this.setState({ draft: draftFromItem(item), draftFor: item.name, nameDraft: item.name });
        }
    }

    private isDirty(): boolean {
        if (this.state.creating) {
            return true;
        }
        const item = this.selected();
        if (!item || !this.state.draft || item.name !== this.state.draftFor) {
            return false;
        }
        return this.state.nameDraft !== item.name || !draftEquals(this.state.draft, draftFromItem(item));
    }

    private nameError(): 'empty' | 'duplicate' | null {
        if (!this.props.props.editable) {
            return null;
        }
        const names = this.props.props.schedules.map((s) => s.name);
        const current = this.state.creating ? '' : this.state.draftFor;
        return validateName(this.state.nameDraft, names, current);
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

    private onNameChange = (name: string): void => {
        this.setState({ nameDraft: name });
    };

    // --- outputs / selection ------------------------------------------------

    private writeOutputs(): void {
        const w = this.props.store.props;
        const item = this.selected();
        const { dayIndex, minute } = this.now();
        const err = this.nameError();
        w.write('output.count', this.props.props.schedules.length);
        w.write('output.isDirty', this.isDirty());
        w.write('output.isActiveNow', !this.state.creating && !!item && isActiveAt(item, dayIndex, minute));
        w.write('output.validationErrors', err === null ? [] : [err === 'empty' ? 'nameRequired' : 'nameTaken']);
    }

    /**
     * Auto-select the first schedule when the selection is EMPTY. A non-empty
     * name that's missing from the list is left alone — it may be a create or
     * rename racing the binding refetch, and stomping it would deselect the
     * schedule the user just saved.
     */
    private ensureSelection(): void {
        const p = this.props.props;
        if (p.schedules.length === 0 || this.state.creating || p.selectedSchedule !== '') {
            return;
        }
        this.props.store.props.write('state.selectedSchedule', p.schedules[0].name);
    }

    private onSelect = (name: string): void => {
        if (this.state.creating) {
            this.setState({ creating: false, draft: null, draftFor: '', nameDraft: '' });
        }
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

    private now(): { dayIndex: number; minute: number } {
        const d = new Date();
        return { dayIndex: (d.getDay() + 6) % 7, minute: d.getHours() * 60 + d.getMinutes() };
    }

    // --- editing actions ----------------------------------------------------

    private onDuplicate = (name: string): void => {
        const source = this.props.props.schedules.find((sch) => sch.name === name);
        if (!source) {
            return;
        }
        // Duplicate = the create flow prefilled from the source (week A for
        // alternating schedules); Save fires onScheduleSave with isNew: true.
        this.clearConfirmTimer();
        this.setState({
            creating: true, draft: draftFromItem(source), draftFor: '',
            nameDraft: uniqueCopyName(name, this.props.props.schedules.map((sch) => sch.name)),
            confirmingDelete: false, preview: null
        });
    };

    private onMenuDelete = (name: string): void => {
        this.fireEvent('onScheduleDelete', { name });
        if (name === this.props.props.selectedSchedule) {
            this.props.store.props.write('state.selectedSchedule', '');
        }
    };

    private onCreate = (): void => {
        this.clearConfirmTimer();
        this.setState({
            creating: true, draft: emptyDraft(), draftFor: '', nameDraft: '',
            confirmingDelete: false, preview: null
        });
    };

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
        const draft = this.state.draft;
        if (!draft || this.nameError() !== null || !this.isDirty()) {
            return;
        }
        if (this.state.creating) {
            const name = this.state.nameDraft.trim();
            this.fireEvent('onScheduleSave', { schedule: newScheduleToFlat(name, draft), isNew: true });
            // Leave the create flow and follow the new schedule; the refreshed
            // binding will contain it and the draft re-syncs from there.
            this.setState({ creating: false, draft: null, draftFor: '', nameDraft: '' });
            this.props.store.props.write('state.selectedSchedule', name);
            return;
        }
        const item = this.selected();
        if (!item) {
            return;
        }
        const flat = draftToFlat(item, draft);
        const newName = this.state.nameDraft.trim();
        const payload: { [key: string]: any } = { schedule: { ...flat, name: newName }, isNew: false };
        if (newName !== item.name) {
            payload.oldName = item.name;
            // Follow the rename so the refreshed list keeps this schedule selected.
            this.props.store.props.write('state.selectedSchedule', newName);
        }
        this.fireEvent('onScheduleSave', payload);
    };

    private onDiscard = (): void => {
        if (this.state.creating) {
            this.setState({ creating: false, draft: null, draftFor: '', nameDraft: '', confirmingDelete: false });
            return;
        }
        const item = this.selected();
        if (item) {
            this.setState({
                draft: draftFromItem(item), draftFor: item.name, nameDraft: item.name, confirmingDelete: false
            });
        }
    };

    private onDelete = (): void => {
        const item = this.selected();
        if (!item || this.state.creating) {
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

    /** Active-at-render-time flags for the list dots (refreshed by the ticker). */
    private activeFlags(): boolean[] {
        const { dayIndex, minute } = this.now();
        return this.props.props.schedules.map((s) => isActiveAt(s, dayIndex, minute));
    }

    private gridDays(item: ScheduleItem | null, draft: ScheduleDraft | null): WeekGridDay[] {
        const p = this.props.props;
        const headers = weekdayHeaders(p.firstDayOfWeek === 'monday', p.locale);
        return orderedDays(p.firstDayOfWeek).map((key, i) => ({
            key,
            label: headers[i],
            ranges: draft
                ? (draft.allDays ? [{ start: 0, end: MINUTES_PER_DAY }] : draft.ranges[key])
                : (item ? dayRanges(item, key) : [])
        }));
    }

    /** Today's column + current-time fraction for the grid's now-line. */
    private nowMarker(): { colIndex: number; fraction: number } | null {
        const p = this.props.props;
        const { dayIndex, minute } = this.now();
        const colIndex = orderedDays(p.firstDayOfWeek).indexOf(DAY_KEYS[dayIndex]);
        const windowStart = p.dayStartHour * 60;
        const windowSpan = (p.dayEndHour - p.dayStartHour) * 60;
        if (minute < windowStart || minute >= windowStart + windowSpan) {
            return null;
        }
        return { colIndex, fraction: (minute - windowStart) / windowSpan };
    }

    private renderDetail(): React.ReactNode {
        const p = this.props.props;
        const creating = this.state.creating;
        const item = this.selected() || null;
        if (!item && !creating) {
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
        const { dayIndex, minute } = this.now();
        return (
            <div className="mustry-sched-detail">
                <ScheduleDetailBar
                    item={item}
                    draft={draft}
                    editable={p.editable}
                    nameDraft={this.state.nameDraft}
                    nameError={this.nameError()}
                    labels={p.labels}
                    onNameChange={this.onNameChange}
                    onDraftChange={this.patchDraft}
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
                    nowMarker={this.nowMarker()}
                />
                {item && !creating && (
                    <SchedulePreviewStrip
                        item={item}
                        dayIndex={dayIndex}
                        minute={minute}
                        weekdayNames={weekdayHeaders(true, p.locale)}
                        labels={p.labels}
                    />
                )}
                {draft && (
                    <AdminFooter
                        labels={p.labels}
                        enabled={this.nameError() === null}
                        dirty={this.isDirty()}
                        onSave={this.onSave}
                        onDiscard={this.onDiscard}
                        showDelete={!creating && p.allowDelete}
                        deleteLabel={p.labels.delete}
                        confirmDeleteLabel={p.labels.confirmDelete}
                        confirmingDelete={this.state.confirmingDelete}
                        onDelete={this.onDelete}
                    />
                )}
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
                    creating={this.state.creating}
                    onCreate={p.editable && p.allowCreate ? this.onCreate : null}
                    labels={p.labels}
                    onSelect={this.onSelect}
                    rowMenu={p.editable && (p.allowCreate || p.allowDelete) ? {
                        showDuplicate: p.allowCreate,
                        showDelete: p.allowDelete,
                        onDuplicate: this.onDuplicate,
                        onDelete: this.onMenuDelete
                    } : null}
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
