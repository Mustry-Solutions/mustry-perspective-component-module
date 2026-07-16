// The grid's two cell renderers: a sortable/draggable/resizable header cell and
// a body cell (text, boolean checkbox, or the in-flight editor passed in as a
// node). Pure presentation — edit state, focus, pending tracking and gestures
// live in DataGrid and arrive precomputed.
import * as React from 'react';
import { GridSort, LaidColumn } from './gridLogic';

interface GridHeadCellProps {
    lc: LaidColumn;
    sort: GridSort;
    dragState: 'dragging' | 'dragover' | null;
    onSort: () => void;
    onDragStart: (e: React.PointerEvent) => void;
    onResizeStart: (e: React.PointerEvent) => void;
}

export function GridHeadCell(p: GridHeadCellProps): React.ReactElement {
    const { col } = p.lc;
    const pinned = p.lc.left >= 0;
    const dir = p.sort.field === col.field ? p.sort.dir : '';
    const dragCls = p.dragState === 'dragging' ? ' mustry-dg-head-cell--dragging'
        : p.dragState === 'dragover' ? ' mustry-dg-head-cell--dragover' : '';
    return (
        <button
            type="button"
            data-field={col.field}
            className={`mustry-dg-cell mustry-dg-head-cell mustry-dg-cell--${col.align}${pinned ? ' mustry-dg-cell--pinned' : ''}${dragCls}`}
            style={{ width: p.lc.width, minWidth: p.lc.width, ...(pinned ? { left: p.lc.left } : null) }}
            title={col.header || col.field}
            aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
            onClick={p.onSort}
            onPointerDown={p.onDragStart}
        >
            {col.header || col.field}
            {dir && <span className="mustry-dg-sort-arrow" aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span>}
            <span className="mustry-dg-resize" onPointerDown={p.onResizeStart} onClick={(e) => e.stopPropagation()} />
        </button>
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
