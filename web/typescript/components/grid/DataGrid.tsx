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
import {
    ColumnLayout, GridSort, LaidColumn, RowRange,
    cellText, columnLayout, gridIsEmpty, gridToCsv, nextSelection, nextSort,
    quickFilterRows, sortRows, visibleRowRange
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
}

type Row = Record<string, unknown>;

/**
 * M0: read-only virtualized grid — sticky header, frozen (pinned) columns,
 * fixed row height, one scroll container for both axes (the timeline's proven
 * layout). M1 adds the interactions: header-click sorting, a toolbar quick
 * filter, row selection and CSV export — all two-way through `state.*`
 * (sort / quickFilter / selection), so views can pre-set or bind them.
 */
export class DataGrid extends Component<ComponentProps<GridProps>, DataGridState> {

    private scrollRef = React.createRef<HTMLDivElement>();
    private resizeObs: ResizeObserver | null = null;
    private selectionAnchor = '';   // last plainly-clicked row id (shift-range endpoint)
    private filterTimer = 0;        // debounces the state.quickFilter write while typing

    constructor(props: ComponentProps<GridProps>) {
        super(props);
        this.state = { scrollTop: 0, viewportHeight: 0, filterDraft: null };
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

    // --- the view pipeline (filter -> sort), memoized on its inputs ----------
    private viewMemo: { deps: unknown[]; rows: Row[] } | null = null;

    private viewRows(): Row[] {
        const p = this.props.props;
        const filter = this.effectiveFilter();
        const deps = [p.rows, p.columns, filter, p.sort.field, p.sort.dir];
        if (this.viewMemo && this.viewMemo.deps.every((d, i) => d === deps[i])) {
            return this.viewMemo.rows;
        }
        const rows = sortRows(quickFilterRows(p.rows, p.columns, filter), p.sort);
        this.viewMemo = { deps, rows };
        return rows;
    }

    private rowId(row: Row): string {
        return cellText(row[this.props.props.idField]);
    }

    // --- two-way state writes -------------------------------------------------
    private setSort(field: string): void {
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

    private exportCsv = (): void => {
        const p = this.props.props;
        const csv = CSV_BOM + gridToCsv(p.columns, this.viewRows(), csvCell);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'grid-rows.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    };

    // --- rendering -------------------------------------------------------------
    private renderCell(lc: LaidColumn, row: Row, rowHeight: number): React.ReactNode {
        const { col } = lc;
        const pinned = lc.left >= 0;
        return (
            <div
                key={col.field}
                className={`dg-cell dg-cell--${col.align}${pinned ? ' dg-cell--pinned' : ''}`}
                style={{
                    width: lc.width, minWidth: lc.width, lineHeight: `${rowHeight - 1}px`,
                    ...(pinned ? { left: lc.left } : null)
                }}
                title={cellText(row[col.field]) || undefined}
            >
                {cellText(row[col.field])}
            </div>
        );
    }

    private renderHeadCell(lc: LaidColumn, sort: GridSort): React.ReactNode {
        const { col } = lc;
        const pinned = lc.left >= 0;
        const dir = sort.field === col.field ? sort.dir : '';
        return (
            <button
                type="button"
                key={col.field}
                className={`dg-cell dg-head-cell dg-cell--${col.align}${pinned ? ' dg-cell--pinned' : ''}`}
                style={{ width: lc.width, minWidth: lc.width, ...(pinned ? { left: lc.left } : null) }}
                title={col.header || col.field}
                aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                onClick={() => this.setSort(col.field)}
            >
                {col.header || col.field}
                {dir && <span className="dg-sort-arrow" aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span>}
            </button>
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
                {p.showExport && (
                    <button type="button" className="dg-export-btn" title={p.labels.exportCsv}
                            aria-label={p.labels.exportCsv} onClick={this.exportCsv}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                        </svg>
                    </button>
                )}
            </div>
        );
    }

    render(): React.ReactNode {
        const p = this.props.props;
        const layout: ColumnLayout = columnLayout(p.columns);
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
