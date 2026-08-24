import * as React from 'react';
import {
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { AdminManagerBase, AdminManagerDescriptor } from '../../shared/adminManagerBase';
import { AdminDraftState } from '../../shared/adminManagerLogic';
import { weekdayHeaders } from '../../shared/dateUtils';
import { dayRanges, isActiveAt, orderedDays, DAY_KEYS, DayKey, MINUTES_PER_DAY, ScheduleItem } from './scheduleLogic';
import {
    applyPaint, applyResize, draftEquals, draftFromItem, draftToFlat, emptyDraft, newScheduleToFlat,
    removeRange, ScheduleDraft
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
export const COMPONENT_TYPE = 'mustrysolutions.perspective.admin.schedulemanager';

/** The preview strip / now-line / active dots re-evaluate on this cadence. */
const NOW_TICK_MS = 30_000;

interface ScheduleManagerState extends AdminDraftState<ScheduleDraft> {
    preview: ScheduleGesturePreview | null;
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
 * selection is two-way via state.selectedSchedule. The draft/select/save/
 * delete machine lives in the AdminManagerBase; this class owns the paint
 * surface and the now-tracking.
 */
export class ScheduleManager
    extends AdminManagerBase<ScheduleItem, ScheduleDraft, ScheduleManagerProps, ScheduleManagerState> {

    protected readonly descriptor: AdminManagerDescriptor<ScheduleItem, ScheduleDraft> = {
        keyOf: (s) => s.name,
        draftFromItem,
        emptyDraft,
        draftEquals,
        selectionPath: 'state.selectedSchedule',
        deleteEvent: 'onScheduleDelete',
        deleteKeyField: 'name',
        renameEnabled: true,
        copyNameStyle: 'paren',
        nameErrorCodes: { empty: 'nameRequired', duplicate: 'nameTaken' }
    };

    private gestures: ScheduleGestureController;
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
        super.componentDidMount();
        // Keep "now" honest: dots, the now-line and the preview strip drift
        // with the clock even when nothing else re-renders.
        this.nowTimer = window.setInterval(() => this.forceUpdate(() => this.writeOutputs()), NOW_TICK_MS);
    }

    componentWillUnmount(): void {
        this.gestures.dispose();
        super.componentWillUnmount();
        if (this.nowTimer !== null) {
            window.clearInterval(this.nowTimer);
        }
    }

    // --- machine wiring -----------------------------------------------------

    protected items(): ScheduleItem[] {
        return this.props.props.schedules;
    }

    protected selectedKey(): string {
        return this.props.props.selectedSchedule;
    }

    protected resetExtras(): Partial<ScheduleManagerState> {
        return { preview: null };
    }

    protected writeExtraOutputs(): void {
        const item = this.selected();
        const { dayIndex, minute } = this.now();
        this.props.store.props.write(
            'output.isActiveNow', !this.state.creating && !!item && isActiveAt(item, dayIndex, minute)
        );
    }

    // --- schedule-specific editing ------------------------------------------

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

    private now(): { dayIndex: number; minute: number } {
        const d = new Date();
        return { dayIndex: (d.getDay() + 6) % 7, minute: d.getHours() * 60 + d.getMinutes() };
    }

    private onGestureCommit = (kind: ScheduleGestureKind, _g: ScheduleGesture, preview: ScheduleGesturePreview | null): void => {
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
        const draft = this.saveableDraft();
        if (!draft) {
            return;
        }
        if (this.state.creating) {
            const name = this.state.nameDraft.trim();
            this.fireEvent('onScheduleSave', { schedule: newScheduleToFlat(name, draft), isNew: true });
            this.finishCreate(name);
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
            this.writeSelection(newName);
        }
        this.fireEvent('onScheduleSave', payload);
    };

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
