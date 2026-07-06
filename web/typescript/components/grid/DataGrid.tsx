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
    ColumnLayout, GridColumn, GridSort, LaidColumn, MIN_COL_PX, RowRange,
    cellText, columnLayout, effectiveColumns, formatCell, gridIsEmpty, gridToCsv,
    matchStyle, nextSelection, nextSort, quickFilterRows, reorderFields, sortRows,
    visibleRowRange
} from './gridLogic';
import { GridProps, mapGridProps } from './gridProps';

// Must match DataGrid.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.datagrid';

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
}

type Row = Record<string, unknown>;

/**
 * Virtualized data grid: sticky header, frozen (pinned) columns, fixed row
 * height, one scroll container for both axes (the timeline's proven layout).
 * Interactions are two-way through `state.*` — sort, quickFilter, selection
 * and columnLayout (widths/order/hidden) — so views can pre-set or bind them.
 * Header gestures: click sorts, drag reorders, the edge handle resizes; the
 * toolbar has the quick filter, a column chooser and CSV export of the view.
 */
export class DataGrid extends Component<ComponentProps<GridProps>, DataGridState> {

    private scrollRef = React.createRef<HTMLDivElement>();
    private resizeObs: ResizeObserver | null = null;
    private selectionAnchor = '';   // last plainly-clicked row id (shift-range endpoint)
    private filterTimer = 0;        // debounces the state.quickFilter write while typing
    private suppressSort = false;   // a header drag/resize just ended — swallow its click
    private chooserDismiss = new DocDismiss(
        ['.dg-chooser', '.dg-chooser-btn'], () => this.setState({ chooserOpen: false }));

    constructor(props: ComponentProps<GridProps>) {
        super(props);
        this.state = {
            scrollTop: 0, viewportHeight: 0, filterDraft: null,
            resize: null, drag: null, chooserOpen: false
        };
    }

    componentDidMount(): void {
        this.measure();
        if (typeof ResizeObserver !== 'undefined' && this.scrollRef.current) {
            this.resizeObs = new ResizeObserver(() => this.measure());
            this.resizeObs.observe(this.scrollRef.current);
        }
    }

    componentDidUpdate(): void {
        if (this.state.filterDraft !== null && this.state.filterDraft === this.props.props.quickFilter) {
            this.setState({ filterDraft: null });   // the write echoed back; the prop leads again
        }
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
    private renderCell(lc: LaidColumn, row: Row, rowHeight: number): React.ReactNode {
        const { col } = lc;
        const p = this.props.props;
        const pinned = lc.left >= 0;
        const text = formatCell(row[col.field], col, p.locale);
        const rule = col.cellStyles.length ? matchStyle(row[col.field], col.cellStyles) : null;
        return (
            <div
                key={col.field}
                className={`dg-cell dg-cell--${col.align}${pinned ? ' dg-cell--pinned' : ''}`}
                style={{
                    width: lc.width, minWidth: lc.width, lineHeight: `${rowHeight - 1}px`,
                    ...(pinned ? { left: lc.left } : null),
                    ...(rule && rule.color ? { color: rule.color } : null),
                    ...(rule && rule.background ? { background: rule.background } : null)
                }}
                title={text || undefined}
            >
                {text}
            </div>
        );
    }

    private renderHeadCell(lc: LaidColumn, sort: GridSort): React.ReactNode {
        const { col } = lc;
        const pinned = lc.left >= 0;
        const dir = sort.field === col.field ? sort.dir : '';
        const d = this.state.drag;
        const dragCls = d && d.field === col.field ? ' dg-head-cell--dragging'
            : d && d.over === col.field ? ' dg-head-cell--dragover' : '';
        return (
            <button
                type="button"
                key={col.field}
                data-field={col.field}
                className={`dg-cell dg-head-cell dg-cell--${col.align}${pinned ? ' dg-cell--pinned' : ''}${dragCls}`}
                style={{ width: lc.width, minWidth: lc.width, ...(pinned ? { left: lc.left } : null) }}
                title={col.header || col.field}
                aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                onClick={() => this.setSort(col.field)}
                onPointerDown={(e) => this.startHeaderDrag(col, e)}
            >
                {col.header || col.field}
                {dir && <span className="dg-sort-arrow" aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span>}
                <span className="dg-resize" onPointerDown={(e) => this.startResize(col, e)} onClick={(e) => e.stopPropagation()} />
            </button>
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
            <div className="dg-chooser" role="menu">
                {p.columns.map((c) => (
                    <label key={c.field} className="dg-chooser-item">
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

    private renderToolbar(view: Row[]): React.ReactNode {
        const p = this.props.props;
        if (!p.showToolbar) {
            return null;
        }
        const selCount = p.selection.length;
        return (
            <div className="dg-toolbar">
                <input
                    type="text"
                    className="dg-search"
                    value={this.effectiveFilter()}
                    placeholder={p.labels.search}
                    aria-label={p.labels.search}
                    onChange={this.setQuickFilter}
                />
                {this.effectiveFilter() && <span className="dg-count">{view.length}</span>}
                <span className="dg-toolbar-spring" />
                {selCount > 0 && (
                    <span className="dg-selected-badge">{p.labels.selected.replace('{n}', String(selCount))}</span>
                )}
                <button type="button" className="dg-export-btn dg-chooser-btn" title={p.labels.columns}
                        aria-label={p.labels.columns} aria-haspopup="true" aria-expanded={this.state.chooserOpen}
                        onClick={() => this.setState({ chooserOpen: !this.state.chooserOpen })}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 5h4v14H4zM10 5h4v14h-4zM16 5h4v14h-4z" />
                    </svg>
                </button>
                {p.showExport && (
                    <button type="button" className="dg-export-btn" title={p.labels.exportCsv}
                            aria-label={p.labels.exportCsv} onClick={this.exportCsv}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                        </svg>
                    </button>
                )}
                {this.renderChooser()}
            </div>
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
                    className={`dg-row${i % 2 ? ' dg-row--odd' : ''}${isSel ? ' dg-row--selected' : ''}${p.rowSelect !== 'none' ? ' dg-row--selectable' : ''}`}
                    style={{ top: i * p.rowHeight, height: p.rowHeight, width: layout.totalWidth }}
                    onClick={(e) => this.clickRow(row, e)}
                >
                    {cols.map((lc) => this.renderCell(lc, row, p.rowHeight))}
                </div>
            );
        }

        return (
            <div {...this.props.emit({ classes: ['mustry-datagrid'] })}>
                {this.renderToolbar(view)}
                {p.loading && <div className="dg-loading-bar" aria-hidden="true" />}
                <div
                    className={`dg-scroll${p.loading ? ' dg-loading' : ''}`}
                    ref={this.scrollRef}
                    onScroll={this.onScroll}
                >
                    <div className="dg-head" style={{ width: layout.totalWidth }}>
                        {cols.map((lc) => this.renderHeadCell(lc, p.sort))}
                    </div>
                    <div className="dg-body" style={{ height: view.length * p.rowHeight, width: layout.totalWidth }}>
                        {visible}
                    </div>
                </div>
                {emptyLabel && <div className="dg-empty-badge">{emptyLabel}</div>}
            </div>
        );
    }
}

export class DataGridMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return DataGrid;
    }

    getDefaultSize(): Size2d {
        return { width: 640, height: 360 };
    }

    getPropsReducer(tree: PropertyTree): GridProps {
        return mapGridProps(tree);
    }
}
