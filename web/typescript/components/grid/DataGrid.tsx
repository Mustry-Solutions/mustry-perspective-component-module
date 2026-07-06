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
import {
    ColumnLayout, LaidColumn, RowRange,
    cellText, columnLayout, gridIsEmpty, visibleRowRange
} from './gridLogic';
import { GridProps, mapGridProps } from './gridProps';

// Must match DataGrid.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.input.datagrid';

interface DataGridState {
    scrollTop: number;
    viewportHeight: number;
}

/**
 * M0: a read-only virtualized grid — sticky header, frozen (pinned) columns,
 * fixed row height. One scroll container for both axes (the timeline's proven
 * layout): the header is sticky-top, pinned cells sticky-left, so both scroll
 * directions stay aligned by construction. Rows are windowed (virtualized) and
 * absolutely positioned inside a full-height canvas so the scrollbar is exact.
 */
export class DataGrid extends Component<ComponentProps<GridProps>, DataGridState> {

    private scrollRef = React.createRef<HTMLDivElement>();
    private resizeObs: ResizeObserver | null = null;

    constructor(props: ComponentProps<GridProps>) {
        super(props);
        this.state = { scrollTop: 0, viewportHeight: 0 };
    }

    componentDidMount(): void {
        this.measure();
        if (typeof ResizeObserver !== 'undefined' && this.scrollRef.current) {
            this.resizeObs = new ResizeObserver(() => this.measure());
            this.resizeObs.observe(this.scrollRef.current);
        }
    }

    componentWillUnmount(): void {
        if (this.resizeObs) {
            this.resizeObs.disconnect();
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

    private renderCell(lc: LaidColumn, row: Record<string, unknown>, rowHeight: number): React.ReactNode {
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

    private renderHeadCell(lc: LaidColumn): React.ReactNode {
        const { col } = lc;
        const pinned = lc.left >= 0;
        return (
            <div
                key={col.field}
                className={`dg-cell dg-head-cell dg-cell--${col.align}${pinned ? ' dg-cell--pinned' : ''}`}
                style={{ width: lc.width, minWidth: lc.width, ...(pinned ? { left: lc.left } : null) }}
                title={col.header || col.field}
            >
                {col.header || col.field}
            </div>
        );
    }

    render(): React.ReactNode {
        const p = this.props.props;
        const layout: ColumnLayout = columnLayout(p.columns);
        const cols: LaidColumn[] = [...layout.pinned, ...layout.scrolling];
        const rows = p.rows;
        const range: RowRange = visibleRowRange(this.state.scrollTop, this.state.viewportHeight, p.rowHeight, rows.length);
        const emptyLabel = gridIsEmpty(p.loading, rows)
            ? emptyMessageText(p.emptyMessage, p.labels.noRows, 'No rows') : '';

        const visible: React.ReactNode[] = [];
        for (let i = range.first; i <= range.last; i++) {
            visible.push(
                <div
                    key={i}
                    className={`dg-row${i % 2 ? ' dg-row--odd' : ''}`}
                    style={{ top: i * p.rowHeight, height: p.rowHeight, width: layout.totalWidth }}
                >
                    {cols.map((lc) => this.renderCell(lc, rows[i], p.rowHeight))}
                </div>
            );
        }

        return (
            <div {...this.props.emit({ classes: ['mustry-datagrid'] })}>
                {p.loading && <div className="dg-loading-bar" aria-hidden="true" />}
                <div
                    className={`dg-scroll${p.loading ? ' dg-loading' : ''}`}
                    ref={this.scrollRef}
                    onScroll={this.onScroll}
                >
                    <div className="dg-head" style={{ width: layout.totalWidth }}>
                        {cols.map((lc) => this.renderHeadCell(lc))}
                    </div>
                    <div className="dg-body" style={{ height: rows.length * p.rowHeight, width: layout.totalWidth }}>
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
