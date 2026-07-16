import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { emptyMessageText } from '../../shared/labelPacks';
import { CSV_BOM, csvCell } from '../../shared/csv';
import { DocDismiss } from '../../shared/dismiss';
import {
    CellPos, ColumnLayout, EditError, GridColumn, GridSort, LaidColumn, MIN_COL_PX, RowRange,
    aggregateValue, batchPayload, cellText, columnLayout, editDraft, effectiveColumns,
    formatCell, gridIsEmpty, gridToCsv, matchStyle, nextCell, nextSelection, nextSort,
    parsePasteMatrix, pastePlan, quickFilterRows, reorderFields, sortRows,
    validateCell, visibleRowRange
} from './gridLogic';
import { GridProps, mapGridProps } from './gridProps';
import { GridCell, GridHeadCell } from './GridCells';
import { GridToolbar } from './GridToolbar';

// Must match DataGrid.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.datagrid';

interface EditState {
    pos: CellPos;
    field: string;
    draft: string;
    error: EditError;
}

interface DataGridState {
    scrollTop: number;
    viewportHeight: number;
    // Local echo of the quick filter while typing: the two-way prop write round-trips
    // through the gateway, which is far too slow for controlled keystrokes. The view
    // filters on the draft instantly; the prop write is debounced; the draft clears
    // once the prop echoes the same value back.
    filterDraft: string | null;
    // In-flight column gestures (live preview; the prop write lands on release).
    resize: { field: string; width: number } | null;
    drag: { field: string; over: string } | null;
    chooserOpen: boolean;
    // Editing (M2): the roving focused cell and the open editor.
    focus: CellPos | null;
    editing: EditState | null;
    // Committed-but-not-yet-rebound values, keyed `rowId::field` — the grid never
    // mutates data.rows; these overlay the display until the author's write-back
    // rebinds the rows (any data.rows change clears them, calendar semantics).
    pending: Record<string, unknown>;
}

type Row = Record<string, unknown>;

/**
 * Virtualized editable data grid: sticky header, frozen (pinned) columns, one
 * scroll container (the timeline's proven layout). Read-side interactions are
 * two-way through `state.*` (sort / quickFilter / selection / columnLayout).
 * Editing is CONTROLLED: an edit fires `onCellEdit` and overlays the value
 * until the author's write-back rebinds `data.rows` — the grid never mutates
 * its own data. Keyboard: arrows move the focused cell, Enter/F2/typing edit,
 * Enter/Tab commit + move, Escape reverts.
 */
export class DataGrid extends Component<ComponentProps<GridProps>, DataGridState> {

    private scrollRef = React.createRef<HTMLDivElement>();
    private editorRef = React.createRef<HTMLInputElement & HTMLSelectElement>();
    private resizeObs: ResizeObserver | null = null;
    private selectionAnchor = '';   // last plainly-clicked row id (shift-range endpoint)
    private filterTimer = 0;        // debounces the state.quickFilter write while typing
    private suppressSort = false;   // a header drag/resize just ended — swallow its click
    private chooserDismiss = new DocDismiss(
        ['.mustry-dg-chooser', '.mustry-dg-chooser-btn'], () => this.setState({ chooserOpen: false }));

    constructor(props: ComponentProps<GridProps>) {
        super(props);
        this.state = {
            scrollTop: 0, viewportHeight: 0, filterDraft: null,
            resize: null, drag: null, chooserOpen: false,
            focus: null, editing: null, pending: {}
        };
    }

    componentDidMount(): void {
        this.measure();
        if (typeof ResizeObserver !== 'undefined' && this.scrollRef.current) {
            this.resizeObs = new ResizeObserver(() => this.measure());
            this.resizeObs.observe(this.scrollRef.current);
        }
    }

    componentDidUpdate(prevProps: ComponentProps<GridProps>): void {
        if (this.state.filterDraft !== null && this.state.filterDraft === this.props.props.quickFilter) {
            this.setState({ filterDraft: null });   // the write echoed back; the prop leads again
        }
        this.reconcilePending();
    }

    componentWillUnmount(): void {
        if (this.resizeObs) {
            this.resizeObs.disconnect();
        }
        if (this.filterTimer) {
            window.clearTimeout(this.filterTimer);
        }
        this.chooserDismiss.close();
    }

    private measure(): void {
        const el = this.scrollRef.current;
        if (el && el.clientHeight !== this.state.viewportHeight) {
            this.setState({ viewportHeight: el.clientHeight });
        }
    }

    private onScroll = (): void => {
        const el = this.scrollRef.current;
        if (el) {
            this.setState({ scrollTop: el.scrollTop });
        }
    };

    private fireEvent(name: string, payload: object): void {
        if (this.props.eventsEnabled) {
            this.props.componentEvents.fireComponentEvent(name, payload);
        }
    }

    // --- the effective columns + view pipeline, memoized on their inputs -------
    private colsMemo: { deps: unknown[]; cols: GridColumn[] } | null = null;
    private viewMemo: { deps: unknown[]; rows: Row[] } | null = null;

    /** config.columns with the user's two-way layout applied (+ live resize preview). */
    private effCols(): GridColumn[] {
        const p = this.props.props;
        const deps = [p.columns, p.columnLayout, this.state.resize];
        if (this.colsMemo && this.colsMemo.deps.every((d, i) => d === deps[i])) {
            return this.colsMemo.cols;
        }
        let cols = effectiveColumns(p.columns, p.columnLayout);
        const rz = this.state.resize;
        if (rz) {
            cols = cols.map((c) => (c.field === rz.field ? { ...c, width: rz.width } : c));
        }
        this.colsMemo = { deps, cols };
        return cols;
    }

    private viewRows(): Row[] {
        const p = this.props.props;
        const filter = this.effectiveFilter();
        const cols = this.effCols();
        const deps = [p.rows, cols, filter, p.sort.field, p.sort.dir, p.locale];
        if (this.viewMemo && this.viewMemo.deps.every((d, i) => d === deps[i])) {
            return this.viewMemo.rows;
        }
        const rows = sortRows(quickFilterRows(p.rows, cols, filter, p.locale), p.sort);
        this.viewMemo = { deps, rows };
        return rows;
    }

    private rowId(row: Row): string {
        return cellText(row[this.props.props.idField]);
    }

    /** The cell's current value: a committed-but-unbound edit wins over the prop. */
    private cellValue(row: Row, field: string): unknown {
        const k = `${this.rowId(row)}::${field}`;
        return k in this.state.pending ? this.state.pending[k] : row[field];
    }

    private colEditable(col: GridColumn): boolean {
        return this.props.props.editable && col.editable;
    }

    // --- two-way state writes -------------------------------------------------
    private setSort(field: string): void {
        if (this.suppressSort) {
            this.suppressSort = false;   // that click concluded a drag/resize gesture
            return;
        }
        const next: GridSort = nextSort(this.props.props.sort, field);
        this.props.store.props.write('state.sort', next);
    }

    private effectiveFilter(): string {
        return this.state.filterDraft !== null ? this.state.filterDraft : this.props.props.quickFilter;
    }

    private setQuickFilter = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const v = e.target.value;
        this.setState({ filterDraft: v });
        if (this.filterTimer) {
            window.clearTimeout(this.filterTimer);
        }
        this.filterTimer = window.setTimeout(
            () => this.props.store.props.write('state.quickFilter', v), 250);
    };

    private clickRow(row: Row, e: React.MouseEvent): void {
        const p = this.props.props;
        if (p.rowSelect === 'none') {
            return;
        }
        const id = this.rowId(row);
        const orderedIds = this.viewRows().map((r) => this.rowId(r));
        const next = nextSelection(
            p.selection, id, p.rowSelect,
            { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey },
            orderedIds, this.selectionAnchor
        );
        if (!e.shiftKey) {
            this.selectionAnchor = id;
        }
        this.props.store.props.write('state.selection', next);
    }

    private toggleHidden(field: string): void {
        const cur = this.props.props.columnLayout.hidden;
        const next = cur.indexOf(field) >= 0 ? cur.filter((f) => f !== field) : [...cur, field];
        this.props.store.props.write('state.columnLayout.hidden', next);
    }

    private exportCsv = (): void => {
        const p = this.props.props;
        const csv = CSV_BOM + gridToCsv(this.effCols(), this.viewRows(), csvCell, p.locale);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'grid-rows.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    };

    // --- editing ----------------------------------------------------------------
    private startEdit(pos: CellPos, initial?: string): void {
        const col = this.effCols()[pos.col];
        const row = this.viewRows()[pos.row];
        if (!col || !row || !this.colEditable(col)) {
            return;
        }
        const draft = initial !== undefined ? initial : editDraft(this.cellValue(row, col.field), col);
        this.setState({ focus: pos, editing: { pos, field: col.field, draft, error: null } },
            () => this.editorRef.current?.focus());
    }

    /** Validate + fire + close. Returns false (and stays open) on a validation error. */
    private commitEdit(): boolean {
        const ed = this.state.editing;
        if (!ed) {
            return true;
        }
        const col = this.effCols()[ed.pos.col];
        const row = this.viewRows()[ed.pos.row];
        if (!col || !row) {
            this.setState({ editing: null });
            return true;
        }
        const { value, error } = validateCell(ed.draft, col);
        if (error) {
            this.setState({ editing: { ...ed, error } });
            return false;
        }
        const oldValue = this.cellValue(row, col.field);
        if (cellText(value) !== cellText(oldValue)) {
            this.fireCellEdit(row, col.field, oldValue, value);
        }
        this.setState({ editing: null });
        return true;
    }

    private cancelEdit(): void {
        this.setState({ editing: null }, () => this.scrollRef.current?.focus());
    }

    private lastDirtyCount = -1;

    private setPending(pending: Record<string, unknown>): void {
        this.setState({ pending });
        const n = Object.keys(pending).length;
        if (n !== this.lastDirtyCount) {
            this.lastDirtyCount = n;
            this.props.store.props.write('output.dirtyCount', n);
        }
    }

    /** Drop pending entries whose value now matches the bound data — the author's
     *  write-back landed. (Identity checks are useless here: the props reducer
     *  rebuilds the rows array on EVERY prop write, including our own dirtyCount
     *  write — comparing values is the only reliable signal.) */
    private reconcilePending(): void {
        const pending = this.state.pending;
        const keys = Object.keys(pending);
        if (!keys.length) {
            return;
        }
        const p = this.props.props;
        const byId = new Map<string, Row>();
        p.rows.forEach((r) => byId.set(this.rowId(r), r));
        const next: Record<string, unknown> = {};
        let dropped = false;
        for (const k of keys) {
            const sep = k.indexOf('::');
            const row = byId.get(k.slice(0, sep));
            if (row && cellText(row[k.slice(sep + 2)]) === cellText(pending[k])) {
                dropped = true;   // the data caught up with the edit
            } else {
                next[k] = pending[k];
            }
        }
        if (dropped) {
            this.setPending(next);
        }
    }

    /** Route a validated value: cell mode fires onCellEdit immediately; batch
     *  mode only accumulates (Save fires one onBatchSave). Both overlay. When
     *  `acc` is given (multi-cell paste), the overlay entry goes there instead —
     *  setState is async, so per-cell setPending calls would clobber each other. */
    private fireCellEdit(row: Row, field: string, oldValue: unknown, newValue: unknown, acc?: Record<string, unknown>): void {
        const k = `${this.rowId(row)}::${field}`;
        if (acc) {
            acc[k] = newValue;
        } else {
            this.setPending({ ...this.state.pending, [k]: newValue });
        }
        if (this.props.props.editMode === 'batch') {
            return;
        }
        this.fireEvent('onCellEdit', {
            rowId: this.rowId(row),
            field,
            oldValue: oldValue === undefined ? null : oldValue,
            newValue,
            row: { ...row, [field]: newValue }
        });
    }

    private saveBatch = (): void => {
        const p = this.props.props;
        const payload = batchPayload(this.state.pending, p.rows, p.idField);
        if (payload.edits.length) {
            this.fireEvent('onBatchSave', payload);
        }
        // the overlay stays until the write-back rebinds data.rows (or Discard)
    };

    private discardBatch = (): void => {
        this.setPending({});
    };

    /** A boolean cell's checkbox toggled — commits immediately (no editor). */
    private toggleBoolean(row: Row, col: GridColumn): void {
        const cur = this.cellValue(row, col.field);
        this.fireCellEdit(row, col.field, cur, !(cur === true || cur === 'true'));
    }

    private errorText(error: EditError, col: GridColumn): string {
        const L = this.props.props.labels;
        switch (error) {
            case 'required': return L.errRequired;
            case 'number': return L.errNumber;
            case 'min': return L.errMin.replace('{min}', String(col.min));
            case 'max': return L.errMax.replace('{max}', String(col.max));
            case 'pattern': return L.errPattern;
            case 'option': return L.errOption;
            default: return '';
        }
    }

    // --- keyboard model -----------------------------------------------------------
    private moveFocus(key: string, shift: boolean): void {
        const cols = this.effCols();
        const rows = this.viewRows();
        const cur = this.state.focus || { row: 0, col: 0 };
        const pos = nextCell(cur, key === 'Tab' && shift ? 'ShiftTab' : key, rows.length, cols.length);
        this.setState({ focus: pos }, () => this.scrollCellIntoView(pos));
    }

    private scrollCellIntoView(pos: CellPos): void {
        const el = this.scrollRef.current;
        if (!el) {
            return;
        }
        const p = this.props.props;
        const headH = 28;
        const rowTop = headH + pos.row * p.rowHeight;
        if (rowTop - headH < el.scrollTop) {
            el.scrollTop = rowTop - headH;
        } else if (rowTop + p.rowHeight > el.scrollTop + el.clientHeight) {
            el.scrollTop = rowTop + p.rowHeight - el.clientHeight;
        }
        const layout = columnLayout(this.effCols());
        const all = [...layout.pinned, ...layout.scrolling];
        const col = all[pos.col];
        if (col && col.left < 0) {   // scrolling columns only (pinned are always visible)
            let x = layout.pinnedWidth;
            for (const lc of layout.scrolling) {
                if (lc === col) {
                    break;
                }
                x += lc.width;
            }
            if (x < el.scrollLeft + layout.pinnedWidth) {
                el.scrollLeft = x - layout.pinnedWidth;
            } else if (x + col.width > el.scrollLeft + el.clientWidth) {
                el.scrollLeft = x + col.width - el.clientWidth;
            }
        }
    }

    private onGridKeyDown = (e: React.KeyboardEvent): void => {
        if (this.state.editing) {
            return;   // the editor's own keydown handles it
        }
        const nav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Tab'];
        if (nav.indexOf(e.key) >= 0) {
            if (e.key === 'Tab' && !this.state.focus) {
                return;   // let Tab leave the grid when nothing is focused
            }
            e.preventDefault();
            this.moveFocus(e.key, e.shiftKey);
            return;
        }
        const focus = this.state.focus;
        if (!focus) {
            return;
        }
        if (e.key === 'Enter' || e.key === 'F2') {
            e.preventDefault();
            this.startEdit(focus);
            return;
        }
        // type-to-edit: a printable character replaces the value (Excel muscle memory)
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.startEdit(focus, e.key);
        }
    };

    private onPaste = (e: React.ClipboardEvent): void => {
        const p = this.props.props;
        const focus = this.state.focus;
        if (!p.editable || !focus || this.state.editing) {
            return;
        }
        const text = e.clipboardData.getData('text/plain');
        if (!text) {
            return;
        }
        e.preventDefault();
        const cols = this.effCols();
        const view = this.viewRows();
        const plan = pastePlan(parsePasteMatrix(text), focus, cols, view.length);
        const acc: Record<string, unknown> = {};
        for (const t of plan) {
            const col = cols[t.col];
            const row = view[t.row];
            const { value, error } = validateCell(t.draft, col);
            if (!error) {
                const oldValue = this.cellValue(row, col.field);
                if (cellText(value) !== cellText(oldValue)) {
                    this.fireCellEdit(row, col.field, oldValue, value, acc);
                }
            }
        }
        if (Object.keys(acc).length) {
            this.setPending({ ...this.state.pending, ...acc });
        }
    };

    private onEditorKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.cancelEdit();
            return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            const key = e.key;
            const shift = e.shiftKey;
            if (this.commitEdit()) {
                this.moveFocus(key, shift);
                this.scrollRef.current?.focus();
            }
        }
    };

    // --- header gestures: resize handle + drag to reorder ----------------------
    private startResize(col: GridColumn, e: React.PointerEvent): void {
        e.stopPropagation();
        e.preventDefault();
        const startX = e.clientX;
        const startW = col.width;
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent): void => {
            this.setState({ resize: { field: col.field, width: Math.max(MIN_COL_PX, startW + ev.clientX - startX) } });
        };
        const up = (): void => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            const rz = this.state.resize;
            if (rz) {
                const widths = { ...this.props.props.columnLayout.widths, [rz.field]: rz.width };
                this.props.store.props.write('state.columnLayout.widths',
                    Object.keys(widths).map((f) => ({ field: f, width: widths[f] })));
            }
            this.suppressSort = true;
            this.setState({ resize: null });
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    }

    private startHeaderDrag(col: GridColumn, e: React.PointerEvent): void {
        if (e.button !== 0) {
            return;
        }
        const startX = e.clientX;
        const el = e.currentTarget as HTMLElement;
        // Capture immediately: past the threshold, move/up must reach us even when
        // the pointer is far outside this header (a fast drag jumps there in one event).
        el.setPointerCapture(e.pointerId);
        let dragging = false;
        const move = (ev: PointerEvent): void => {
            if (!dragging && Math.abs(ev.clientX - startX) > 6) {
                dragging = true;
            }
            if (dragging) {
                const under = document.elementFromPoint(ev.clientX, ev.clientY);
                const target = under && (under as HTMLElement).closest('[data-field]');
                const over = target ? String((target as HTMLElement).dataset.field) : '';
                this.setState({ drag: { field: col.field, over } });
            }
        };
        const up = (): void => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            const d = this.state.drag;
            if (dragging) {
                if (d && d.over && d.over !== d.field) {
                    const fields = this.effCols().map((c) => c.field);
                    this.props.store.props.write('state.columnLayout.order', reorderFields(fields, d.field, d.over));
                }
                this.suppressSort = true;
            }
            this.setState({ drag: null });
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    }

    // --- rendering -------------------------------------------------------------
    private renderEditor(col: GridColumn, ed: EditState, rowHeight: number): React.ReactNode {
        const invalid = ed.error !== null;
        const common = {
            ref: this.editorRef as any,
            className: `mustry-dg-editor${invalid ? ' mustry-dg-editor--invalid' : ''}`,
            value: ed.draft,
            title: invalid ? this.errorText(ed.error, col) : undefined,
            onKeyDown: this.onEditorKeyDown,
            onBlur: () => {
                // blur commits when valid; an invalid draft reverts (never trap focus)
                if (this.state.editing && !this.commitEdit()) {
                    this.setState({ editing: null });
                }
            },
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
                this.setState({ editing: { ...ed, draft: e.target.value, error: null } })
        };
        if (col.options.length) {
            return (
                <select {...common} style={{ height: rowHeight - 4 }}>
                    {ed.draft === '' && <option value="" />}
                    {col.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            );
        }
        const type = col.type === 'date' ? 'date' : col.type === 'datetime' ? 'datetime-local' : 'text';
        const inputMode = col.type === 'number' ? { inputMode: 'decimal' as const } : {};
        return <input {...common} type={type} {...inputMode} style={{ height: rowHeight - 4 }} />;
    }

    private renderCell(lc: LaidColumn, row: Row, pos: CellPos, rowHeight: number): React.ReactNode {
        const { col } = lc;
        const p = this.props.props;
        const ed = this.state.editing;
        const isEditing = !!(ed && ed.pos.row === pos.row && ed.pos.col === pos.col);
        const isFocused = !!(!isEditing && this.state.focus
            && this.state.focus.row === pos.row && this.state.focus.col === pos.col);
        const value = this.cellValue(row, col.field);
        const editable = this.colEditable(col);
        const boolEditable = editable && col.type === 'boolean';
        return (
            <GridCell
                key={col.field}
                lc={lc}
                rowHeight={rowHeight}
                text={formatCell(value, col, p.locale)}
                styleRule={col.cellStyles.length ? matchStyle(value, col.cellStyles) : null}
                editable={editable}
                isFocused={isFocused}
                isPending={`${this.rowId(row)}::${col.field}` in this.state.pending}
                editor={isEditing ? this.renderEditor(col, ed as EditState, rowHeight) : null}
                boolChecked={!isEditing && boolEditable ? (value === true || value === 'true') : null}
                onFocus={() => this.setState({ focus: pos })}
                onStartEdit={editable && col.type !== 'boolean' ? () => this.startEdit(pos) : undefined}
                onToggleBoolean={() => this.toggleBoolean(row, col)}
            />
        );
    }

    private renderHeadCell(lc: LaidColumn, sort: GridSort): React.ReactNode {
        const { col } = lc;
        const d = this.state.drag;
        return (
            <GridHeadCell
                key={col.field}
                lc={lc}
                sort={sort}
                dragState={d && d.field === col.field ? 'dragging'
                    : d && d.over === col.field ? 'dragover' : null}
                onSort={() => this.setSort(col.field)}
                onDragStart={(e) => this.startHeaderDrag(col, e)}
                onResizeStart={(e) => this.startResize(col, e)}
            />
        );
    }

    private renderChooser(): React.ReactNode {
        const p = this.props.props;
        if (!this.state.chooserOpen) {
            this.chooserDismiss.close();
            return null;
        }
        this.chooserDismiss.open();
        const hidden = new Set(p.columnLayout.hidden);
        return (
            <div className="mustry-dg-chooser" role="menu">
                {p.columns.map((c) => (
                    <label key={c.field} className="mustry-dg-chooser-item">
                        <input
                            type="checkbox"
                            checked={!hidden.has(c.field)}
                            onChange={() => this.toggleHidden(c.field)}
                        />
                        {c.header || c.field}
                    </label>
                ))}
            </div>
        );
    }

    private deleteSelected = (): void => {
        const p = this.props.props;
        const selected = new Set(p.selection);
        const rows = p.rows.filter((r) => selected.has(this.rowId(r)));
        if (rows.length) {
            this.fireEvent('onRowsDelete', { rowIds: rows.map((r) => this.rowId(r)), rows });
            this.props.store.props.write('state.selection', []);
        }
    };

    private renderToolbar(view: Row[]): React.ReactNode {
        const p = this.props.props;
        if (!p.showToolbar) {
            return null;
        }
        return (
            <GridToolbar
                labels={p.labels}
                filter={this.effectiveFilter()}
                matchCount={view.length}
                selCount={p.selection.length}
                dirtyCount={Object.keys(this.state.pending).length}
                batchMode={p.editMode === 'batch'}
                allowAdd={p.allowAdd}
                allowDelete={p.allowDelete}
                showExport={p.showExport}
                chooserOpen={this.state.chooserOpen}
                chooser={this.renderChooser()}
                onFilter={this.setQuickFilter}
                onSaveBatch={this.saveBatch}
                onDiscardBatch={this.discardBatch}
                onAddRow={() => this.fireEvent('onRowAdd', {})}
                onDeleteSelected={this.deleteSelected}
                onToggleChooser={() => this.setState({ chooserOpen: !this.state.chooserOpen })}
                onExportCsv={this.exportCsv}
            />
        );
    }

    render(): React.ReactNode {
        const p = this.props.props;
        const layout: ColumnLayout = columnLayout(this.effCols());
        const cols: LaidColumn[] = [...layout.pinned, ...layout.scrolling];
        const view = this.viewRows();
        const range: RowRange = visibleRowRange(this.state.scrollTop, this.state.viewportHeight, p.rowHeight, view.length);
        const emptyLabel = gridIsEmpty(p.loading, p.rows)
            ? emptyMessageText(p.emptyMessage, p.labels.noRows, 'No rows') : '';
        const selected = new Set(p.selection);

        const visible: React.ReactNode[] = [];
        for (let i = range.first; i <= range.last; i++) {
            const row = view[i];
            const isSel = p.rowSelect !== 'none' && selected.has(this.rowId(row));
            visible.push(
                <div
                    key={i}
                    className={`mustry-dg-row${i % 2 ? ' mustry-dg-row--odd' : ''}${isSel ? ' mustry-dg-row--selected' : ''}${p.rowSelect !== 'none' ? ' mustry-dg-row--selectable' : ''}`}
                    style={{ top: i * p.rowHeight, height: p.rowHeight, width: layout.totalWidth }}
                    onClick={(e) => this.clickRow(row, e)}
                >
                    {cols.map((lc, ci) => this.renderCell(lc, row, { row: i, col: ci }, p.rowHeight))}
                </div>
            );
        }

        return (
            <div {...this.props.emit({ classes: ['mustry-datagrid'] })}>
                {this.renderToolbar(view)}
                {p.loading && <div className="mustry-dg-loading-bar" aria-hidden="true" />}
                <div
                    className={`mustry-dg-scroll${p.loading ? ' mustry-dg-loading' : ''}`}
                    ref={this.scrollRef}
                    tabIndex={0}
                    onScroll={this.onScroll}
                    onKeyDown={this.onGridKeyDown}
                    onPaste={this.onPaste}
                >
                    <div className="mustry-dg-head" style={{ width: layout.totalWidth }}>
                        {cols.map((lc) => this.renderHeadCell(lc, p.sort))}
                    </div>
                    <div className="mustry-dg-body" style={{ height: view.length * p.rowHeight, width: layout.totalWidth }}>
                        {visible}
                    </div>
                    {cols.some((lc) => lc.col.aggregate) && (
                        <div className="mustry-dg-foot" style={{ width: layout.totalWidth }}>
                            {cols.map((lc) => {
                                const agg = aggregateValue(view, lc.col);
                                const pinned = lc.left >= 0;
                                return (
                                    <div key={lc.col.field}
                                         className={`mustry-dg-cell mustry-dg-foot-cell mustry-dg-cell--${lc.col.align}${pinned ? ' mustry-dg-cell--pinned' : ''}`}
                                         style={{ width: lc.width, minWidth: lc.width, ...(pinned ? { left: lc.left } : null) }}
                                         title={lc.col.aggregate || undefined}>
                                        {agg === null ? '' : lc.col.aggregate === 'count'
                                            ? String(agg) : formatCell(agg, lc.col, p.locale)}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                {emptyLabel && <div className="mustry-dg-empty-badge">{emptyLabel}</div>}
            </div>
        );
    }
}

export class DataGridMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        // PComponent is typed over PlainObject props; getPropsReducer below is
        // what actually guarantees the shape this class receives.
        return DataGrid as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 640, height: 360 };
    }

    getPropsReducer(tree: PropertyTree): GridProps {
        return mapGridProps(tree);
    }
}
