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
import { AdminFooter } from '../../shared/AdminFooter';
import {
    HolidayDraft, HolidayItem, emptyHolidayDraft, holidayDraftEquals, holidayDraftFromItem,
    holidayDraftToFlat, nextOccurrence, parseIsoDate, sortHolidays
} from './holidayLogic';
import { RowMenu } from '../../shared/RowMenu';
import { HolidayManagerProps, mapHolidayProps } from './holidayProps';

// Must match HolidayManager.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.admin.holidaymanager';

type HolidayManagerState = AdminDraftState<HolidayDraft>;

/**
 * Holiday Manager — fourth of the admin family. Master-detail over the
 * gateway's holiday list (data.holidays, the flat HolidayModel mirror bound
 * via system.user.getHolidays()): a rail sorted by next occurrence (past
 * non-repeating holidays sink and dim) and a small detail form (name, date,
 * repeat-annually). Pairs with the Schedule Manager: schedules with
 * "Observes holidays" enabled are inactive on these dates. Edits stay
 * draft-only until Save fires onHolidaySave {holiday, isNew, oldName?};
 * Delete (two-step) fires onHolidayDelete {name}; the author's script
 * persists via system.user.addHoliday/editHoliday/removeHoliday.
 * Controlled; selection is two-way via state.selectedHoliday. The draft/
 * select/save/delete machine lives in the AdminManagerBase; this class owns
 * the date validation and the next-occurrence sorting.
 */
export class HolidayManager
    extends AdminManagerBase<HolidayItem, HolidayDraft, HolidayManagerProps, HolidayManagerState> {

    protected readonly descriptor: AdminManagerDescriptor<HolidayItem, HolidayDraft> = {
        keyOf: (h) => h.name,
        draftFromItem: holidayDraftFromItem,
        emptyDraft: emptyHolidayDraft,
        draftEquals: holidayDraftEquals,
        selectionPath: 'state.selectedHoliday',
        deleteEvent: 'onHolidayDelete',
        deleteKeyField: 'name',
        renameEnabled: true,
        copyNameStyle: 'paren',
        nameErrorCodes: { empty: 'nameRequired', duplicate: 'nameTaken' }
    };

    constructor(props: ComponentProps<HolidayManagerProps>) {
        super(props);
        this.state = { draft: null, draftFor: '', creating: false, nameDraft: '', confirmingDelete: false };
    }

    // --- machine wiring -----------------------------------------------------

    protected items(): HolidayItem[] {
        return this.props.props.holidays;
    }

    protected selectedKey(): string {
        return this.props.props.selectedHoliday;
    }

    /** The rail is sorted by next occurrence, so auto-select follows it. */
    protected firstSelectableKey(): string {
        return this.sorted()[0].name;
    }

    protected saveBlocked(): boolean {
        return super.saveBlocked() || this.dateError();
    }

    protected validationErrors(): string[] {
        const errors = super.validationErrors();
        if (this.state.draft && this.dateError() && (this.state.creating || this.isDirty())) {
            errors.push('dateInvalid');
        }
        return errors;
    }

    // --- holiday-specific editing -------------------------------------------

    private dateError(): boolean {
        const draft = this.state.draft;
        return !!draft && parseIsoDate(draft.date) === null;
    }

    private todayIso(): string {
        const d = new Date();
        const mm = d.getMonth() + 1;
        const dd = d.getDate();
        return `${d.getFullYear()}-${mm < 10 ? '0' : ''}${mm}-${dd < 10 ? '0' : ''}${dd}`;
    }

    private sorted(): HolidayItem[] {
        return sortHolidays(this.props.props.holidays, this.todayIso());
    }

    private onSave = (): void => {
        const draft = this.saveableDraft();
        if (!draft) {
            return;
        }
        if (this.state.creating) {
            const name = this.state.nameDraft.trim();
            this.fireEvent('onHolidaySave', { holiday: holidayDraftToFlat(name, draft), isNew: true });
            this.finishCreate(name);
            return;
        }
        const item = this.selected();
        if (!item) {
            return;
        }
        const newName = this.state.nameDraft.trim();
        const payload: { [key: string]: any } = { holiday: holidayDraftToFlat(newName, draft), isNew: false };
        if (newName !== item.name) {
            payload.oldName = item.name;
            // Follow the rename so the refreshed list keeps this holiday selected.
            this.writeSelection(newName);
        }
        this.fireEvent('onHolidaySave', payload);
    };

    // --- render -------------------------------------------------------------

    private renderDetail(): React.ReactNode {
        const p = this.props.props;
        const creating = this.state.creating;
        const item = this.selected() || null;
        if (!item && !creating) {
            return (
                <div className="mustry-roster-detail mustry-roster-detail--empty">
                    {p.holidays.length === 0 ? p.labels.noHolidays : p.labels.noSelection}
                </div>
            );
        }
        const draft = p.editable ? this.state.draft : null;
        const nameError = this.nameError();
        const next = item ? nextOccurrence(item, this.todayIso()) : null;
        return (
            <div className="mustry-roster-detail">
                <div className="mustry-roster-detail-head">
                    {draft ? (
                        <span className="mustry-sched-name-wrap">
                            <input
                                className={'mustry-sched-name-input' + (nameError ? ' mustry-sched-name-input--invalid' : '')}
                                type="text"
                                value={this.state.nameDraft}
                                placeholder={p.labels.name}
                                aria-label={p.labels.name}
                                onChange={(e) => this.setState({ nameDraft: e.target.value })}
                            />
                            {nameError && (
                                <span className="mustry-sched-name-error">
                                    {nameError === 'empty' ? p.labels.nameRequired : p.labels.nameTaken}
                                </span>
                            )}
                        </span>
                    ) : (
                        <span className="mustry-roster-detail-name">{item ? item.name : ''}</span>
                    )}
                </div>
                {draft ? (
                    <div className="mustry-holiday-form">
                        <label className="mustry-users-field mustry-holiday-date-field">
                            <span className="mustry-users-field-label">{p.labels.date}</span>
                            <input
                                className={'mustry-users-input' + (this.dateError() ? ' mustry-sched-name-input--invalid' : '')}
                                type="date"
                                value={draft.date}
                                onChange={(e) => this.setState({ draft: { ...draft, date: e.target.value } })}
                            />
                            {this.dateError() && <span className="mustry-sched-name-error">{p.labels.dateInvalid}</span>}
                        </label>
                        <label className="mustry-sched-toggle">
                            <input
                                type="checkbox"
                                checked={draft.repeatAnnually}
                                onChange={(e) => this.setState({ draft: { ...draft, repeatAnnually: e.target.checked } })}
                            />
                            {p.labels.repeatAnnually}
                        </label>
                        {!creating && (
                            <span className="mustry-users-hint">
                                {next !== null ? p.labels.nextOn.replace('{date}', next) : p.labels.neverAgain}
                            </span>
                        )}
                        <span className="mustry-users-hint">{p.labels.observedBy}</span>
                    </div>
                ) : (
                    item && (
                        <div className="mustry-holiday-form">
                            <span className="mustry-users-view-row">{item.date}</span>
                            <span className="mustry-users-hint">
                                {next !== null ? p.labels.nextOn.replace('{date}', next) : p.labels.neverAgain}
                            </span>
                        </div>
                    )
                )}
                {draft && (
                    <AdminFooter
                        labels={p.labels}
                        enabled={!this.saveBlocked()}
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
        const today = this.todayIso();
        return (
            <div {...this.props.emit({ classes: ['mustry-holidaymgr'] })}>
                <div className="mustry-sched-list" role="listbox" aria-label={p.labels.listHeader}>
                    <div className="mustry-sched-list-header">
                        {p.labels.listHeader}
                        {p.editable && p.allowCreate && (
                            <button
                                type="button"
                                className={'mustry-sched-new' + (this.state.creating ? ' mustry-sched-new--active' : '')}
                                title={p.labels.newHoliday}
                                onClick={this.onCreate}
                            >
                                + {p.labels.newHoliday}
                            </button>
                        )}
                    </div>
                    {p.holidays.length === 0 && <div className="mustry-sched-empty">{p.labels.noHolidays}</div>}
                    {this.sorted().map((h) => {
                        const next = nextOccurrence(h, today);
                        const past = next === null;
                        return (
                            <div
                                key={h.name}
                                className={'mustry-sched-item' + (past ? ' mustry-holiday-item--past' : '')
                                    + (!this.state.creating && h.name === p.selectedHoliday ? ' mustry-sched-item--selected' : '')}
                                role="option"
                                aria-selected={!this.state.creating && h.name === p.selectedHoliday}
                                tabIndex={0}
                                onClick={() => this.onSelect(h.name)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onSelect(h.name); } }}
                            >
                                <span className="mustry-sched-item-text">
                                    <span className="mustry-sched-item-name">{h.name}</span>
                                    <span className="mustry-sched-item-desc">
                                        {next !== null ? next : h.date}
                                        {h.repeatAnnually && <span className="mustry-holiday-badge">{p.labels.repeats}</span>}
                                        {past && <span className="mustry-holiday-badge">{p.labels.past}</span>}
                                    </span>
                                </span>
                                {p.editable && (p.allowCreate || p.allowDelete) && (
                                    <RowMenu
                                        moreActionsLabel={`${p.labels.moreActions} h.name`}
                                        duplicateLabel={p.labels.duplicate}
                                        deleteLabel={p.labels.delete}
                                        confirmDeleteLabel={p.labels.confirmDelete}
                                        showDuplicate={p.allowCreate}
                                        showDelete={p.allowDelete}
                                        onDuplicate={() => this.onDuplicate(h.name)}
                                        onDelete={() => this.onMenuDelete(h.name)}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
                {this.renderDetail()}
            </div>
        );
    }
}

export class HolidayManagerMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return HolidayManager as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 560, height: 380 };
    }

    getPropsReducer(tree: PropertyTree): HolidayManagerProps {
        return mapHolidayProps(tree);
    }
}
