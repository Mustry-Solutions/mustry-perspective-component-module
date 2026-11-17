// The grid's two cell renderers: a sortable/draggable/resizable header cell and
// a body cell (text, boolean checkbox, or the in-flight editor passed in as a
// node). Pure presentation — edit state, focus, pending tracking and gestures
// live in DataGrid and arrive precomputed.
import * as React from 'react';
import { GridSort, LaidColumn, MAX_KEY_COL_PX, MIN_COL_PX } from './gridLogic';

interface GridHeadCellProps {
    lc: LaidColumn;
    sort: GridSort;
    dragState: 'dragging' | 'dragover' | null;
    onSort: () => void;
    onDragStart: (e: React.PointerEvent) => void;
    onResizeStart: (e: React.PointerEvent) => void;
    onResizeKey: (e: React.KeyboardEvent) => void;
    resizeLabel: string;
}

export function GridHeadCell(p: GridHeadCellProps): React.ReactElement {
    const { col } = p.lc;
    const pinned = p.lc.left >= 0;
    const dir = p.sort.field === col.field ? p.sort.dir : '';
    const dragCls = p.dragState === 'dragging' ? ' mustry-dg-head-cell--dragging'
        : p.dragState === 'dragover' ? ' mustry-dg-head-cell--dragover' : '';
    // The cell is a wrapper: the sort/drag button and, BESIDE it, the resize
    // handle. The handle is a focusable separator (arrow keys resize), and
    // interactive content can't nest inside a button (#91).
    return (
        <div
            data-field={col.field}
            className={`mustry-dg-cell mustry-dg-head-cell mustry-dg-cell--${col.align}${pinned ? ' mustry-dg-cell--pinned' : ''}${dragCls}`}
            style={{ width: p.lc.width, minWidth: p.lc.width, ...(pinned ? { left: p.lc.left } : null) }}
        >
            <button
                type="button"
                className="mustry-dg-head-btn"
                title={col.header || col.field}
                aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                onClick={p.onSort}
                onPointerDown={p.onDragStart}
            >
                {col.header || col.field}
                {dir && <span className="mustry-dg-sort-arrow" aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span>}
            </button>
            <span
                className="mustry-dg-resize"
                role="separator"
                aria-orientation="vertical"
                aria-label={p.resizeLabel}
                aria-valuenow={p.lc.width}
                aria-valuemin={MIN_COL_PX}
                aria-valuemax={Math.max(p.lc.width, MAX_KEY_COL_PX)}
                tabIndex={0}
                onPointerDown={p.onResizeStart}
                onKeyDown={p.onResizeKey}
            />
        </div>
    );
}

interface GridCellProps {
    lc: LaidColumn;
    rowHeight: number;
    text: string;
    styleRule: { color?: string; background?: string } | null;
    editable: boolean;
    isFocused: boolean;
    isPending: boolean;
    /** Rendered editor input when this cell is being edited (owned by DataGrid). */
    editor: React.ReactNode | null;
    /** Boolean columns render a live checkbox instead of text. */
    boolChecked: boolean | null;
    onFocus: () => void;
    onStartEdit?: () => void;
    onToggleBoolean: () => void;
}

export function GridCell(p: GridCellProps): React.ReactElement {
    const { col } = p.lc;
    const pinned = p.lc.left >= 0;
    const isEditing = p.editor !== null;
    return (
        <div
            className={`mustry-dg-cell mustry-dg-cell--${col.align}${pinned ? ' mustry-dg-cell--pinned' : ''}`
                + `${p.isFocused ? ' mustry-dg-cell--focus' : ''}${p.editable ? ' mustry-dg-cell--editable' : ''}`
                + `${p.isPending ? ' mustry-dg-cell--pending' : ''}`}
            style={{
                width: p.lc.width, minWidth: p.lc.width, lineHeight: `${p.rowHeight - 1}px`,
                ...(pinned ? { left: p.lc.left } : null),
                ...(p.styleRule && p.styleRule.color ? { color: p.styleRule.color } : null),
                ...(p.styleRule && p.styleRule.background ? { background: p.styleRule.background } : null)
            }}
            title={isEditing ? undefined : p.text || undefined}
            onClick={p.onFocus}
            onDoubleClick={p.onStartEdit}
        >
            {isEditing ? p.editor
                : p.boolChecked !== null ? (
                    <input
                        type="checkbox"
                        className="mustry-dg-bool"
                        checked={p.boolChecked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={p.onToggleBoolean}
                    />
                ) : p.text}
        </div>
    );
}
