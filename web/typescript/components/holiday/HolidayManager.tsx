import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { validateName } from '../../shared/adminCommon';
import { CommitControls } from '../../shared/CommitControls';
import { ConfirmButton } from '../../shared/ConfirmButton';
import {
    HolidayDraft, HolidayItem, emptyHolidayDraft, holidayDraftEquals, holidayDraftFromItem,
    holidayDraftToFlat, nextOccurrence, parseIsoDate, sortHolidays
} from './holidayLogic';
import { HolidayManagerProps, mapHolidayProps } from './holidayProps';

// Must match HolidayManager.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.ingots.admin.holidaymanager';

/** How long the Delete button stays in its confirm step before reverting. */
const CONFIRM_DELETE_MS = 4000;

interface HolidayManagerState {
    draft: HolidayDraft | null;
    draftFor: string;
    creating: boolean;
    nameDraft: string;
    confirmingDelete: boolean;
}

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
 * Controlled; selection is two-way via state.selectedHoliday.
 */
export class HolidayManager extends Component<ComponentProps<HolidayManagerProps>, HolidayManagerState> {

    private confirmTimer: number | null = null;

    constructor(props: ComponentProps<HolidayManagerProps>) {
        super(props);
        this.state = { draft: null, draftFor: '', creating: false, nameDraft: '', confirmingDelete: false };
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
        this.clearConfirmTimer();
    }

    // --- draft lifecycle ----------------------------------------------------

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
        if (selectionChanged || (this.state.draft && !this.isDirty() && !holidayDraftEquals(this.state.draft, holidayDraftFromItem(item)))) {
            this.setState({
                draft: holidayDraftFromItem(item), draftFor: item.name, nameDraft: item.name, confirmingDelete: false
            });
        } else if (this.state.draft === null) {
            this.setState({ draft: holidayDraftFromItem(item), draftFor: item.name, nameDraft: item.name });
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
        return this.state.nameDraft !== item.name || !holidayDraftEquals(this.state.draft, holidayDraftFromItem(item));
    }

    private nameError(): 'empty' | 'duplicate' | null {
        if (!this.props.props.editable) {
            return null;
        }
        const names = this.props.props.holidays.map((h) => h.name);
        return validateName(this.state.nameDraft, names, this.state.creating ? '' : this.state.draftFor);
    }

    private dateError(): boolean {
        const draft = this.state.draft;
        return !!draft && parseIsoDate(draft.date) === null;
    }

    private saveBlocked(): boolean {
        return this.nameError() !== null || this.dateError();
    }

    // --- outputs / selection ------------------------------------------------

    private writeOutputs(): void {
        const w = this.props.store.props;
        const errors: string[] = [];
        const nameErr = this.nameError();
        if (nameErr !== null) {
            errors.push(nameErr === 'empty' ? 'nameRequired' : 'nameTaken');
        }
        if (this.state.draft && this.dateError() && (this.state.creating || this.isDirty())) {
            errors.push('dateInvalid');
        }
        w.write('output.count', this.props.props.holidays.length);
        w.write('output.isDirty', this.isDirty());
        w.write('output.validationErrors', errors);
    }

    private ensureSelection(): void {
        const p = this.props.props;
        if (p.holidays.length === 0 || this.state.creating || p.selectedHoliday !== '') {
            return;
        }
        this.props.store.props.write('state.selectedHoliday', this.sorted()[0].name);
    }

    private onSelect = (name: string): void => {
        if (this.state.creating) {
            this.setState({ creating: false, draft: null, draftFor: '', nameDraft: '' });
        }
        this.props.store.props.write('state.selectedHoliday', name);
    };

    private selected(): HolidayItem | undefined {
        const p = this.props.props;
        return p.holidays.find((h) => h.name === p.selectedHoliday);
    }

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
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

    // --- editing actions ----------------------------------------------------

    private onCreate = (): void => {
        this.clearConfirmTimer();
        this.setState({
            creating: true, draft: emptyHolidayDraft(), draftFor: '', nameDraft: '', confirmingDelete: false
        });
    };

    private onSave = (): void => {
        const draft = this.state.draft;
        if (!draft || this.saveBlocked() || !this.isDirty()) {
            return;
        }
        if (this.state.creating) {
            const name = this.state.nameDraft.trim();
            this.fireEvent('onHolidaySave', { holiday: holidayDraftToFlat(name, draft), isNew: true });
            this.setState({ creating: false, draft: null, draftFor: '', nameDraft: '' });
            this.props.store.props.write('state.selectedHoliday', name);
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
            this.props.store.props.write('state.selectedHoliday', newName);
        }
        this.fireEvent('onHolidaySave', payload);
    };

    private onDiscard = (): void => {
        if (this.state.creating) {
            this.setState({ creating: false, draft: null, draftFor: '', nameDraft: '' });
            return;
        }
        const item = this.selected();
        if (item) {
            this.setState({
                draft: holidayDraftFromItem(item), draftFor: item.name, nameDraft: item.name, confirmingDelete: false
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
        this.fireEvent('onHolidayDelete', { name: item.name });
    };

    private clearConfirmTimer(): void {
        if (this.confirmTimer !== null) {
            window.clearTimeout(this.confirmTimer);
            this.confirmTimer = null;
        }
    }

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
                    <span className="mustry-sched-head-spacer" />
                    {draft && (
                        <React.Fragment>
                            <CommitControls
                                reserveSpace={true}
                                labels={p.labels}
                                enabled={!this.saveBlocked()}
                                dirty={this.isDirty()}
                                onSave={this.onSave}
                                onDiscard={this.onDiscard}
                            />
                            {!creating && p.allowDelete && (
                                <ConfirmButton
                                    label={p.labels.delete}
                                    confirmLabel={p.labels.confirmDelete}
                                    confirming={this.state.confirmingDelete}
                                    className="mustry-sched-delete"
                                    confirmingClassName="mustry-sched-delete--confirm"
                                    onClick={this.onDelete}
                                />
                            )}
                        </React.Fragment>
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
