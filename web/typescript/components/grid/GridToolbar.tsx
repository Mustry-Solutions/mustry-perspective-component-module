// The grid's toolbar: quick filter + match count, selection badge, batch
// save/discard, add/delete, the column chooser trigger (the chooser popover
// itself is rendered by DataGrid and passed in — its dismiss lifecycle is
// stateful) and CSV export. Pure presentation.
import * as React from 'react';
import { GridLabels } from '../../shared/labelPacks';

interface GridToolbarProps {
    labels: GridLabels;
    filter: string;
    matchCount: number;
    selCount: number;
    dirtyCount: number;
    batchMode: boolean;
    allowAdd: boolean;
    allowDelete: boolean;
    showExport: boolean;
    chooserOpen: boolean;
    chooser: React.ReactNode;
    onFilter: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSaveBatch: () => void;
    onDiscardBatch: () => void;
    onAddRow: () => void;
    onDeleteSelected: () => void;
    onToggleChooser: () => void;
    onExportCsv: () => void;
}

export function GridToolbar(p: GridToolbarProps): React.ReactElement {
    const { labels } = p;
    return (
        <div className="dg-toolbar">
            <input
                type="text"
                className="dg-search"
                value={p.filter}
                placeholder={labels.search}
                aria-label={labels.search}
                onChange={p.onFilter}
            />
            {p.filter && <span className="dg-count">{p.matchCount}</span>}
            <span className="dg-toolbar-spring" />
            {p.selCount > 0 && (
                <span className="dg-selected-badge">{labels.selected.replace('{n}', String(p.selCount))}</span>
            )}
            {p.batchMode && p.dirtyCount > 0 && (
                <>
                    <span className="dg-dirty-badge">{labels.unsaved.replace('{n}', String(p.dirtyCount))}</span>
                    <button type="button" className="dg-save-btn" onClick={p.onSaveBatch}>{labels.save}</button>
                    <button type="button" className="dg-export-btn dg-discard-btn" title={labels.discard}
                            aria-label={labels.discard} onClick={p.onDiscardBatch}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z" /></svg>
                    </button>
                </>
            )}
            {p.allowAdd && (
                <button type="button" className="dg-export-btn" title={labels.addRow}
                        aria-label={labels.addRow} onClick={p.onAddRow}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" /></svg>
                </button>
            )}
            {p.allowDelete && (
                <button type="button" className="dg-export-btn" disabled={p.selCount === 0}
                        title={labels.deleteRows.replace('{n}', String(p.selCount))}
                        aria-label={labels.deleteRows.replace('{n}', String(p.selCount))}
                        onClick={p.onDeleteSelected}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z" /></svg>
                </button>
            )}
            <button type="button" className="dg-export-btn dg-chooser-btn" title={labels.columns}
                    aria-label={labels.columns} aria-haspopup="true" aria-expanded={p.chooserOpen}
                    onClick={p.onToggleChooser}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 5h4v14H4zM10 5h4v14h-4zM16 5h4v14h-4z" />
                </svg>
            </button>
            {p.showExport && (
                <button type="button" className="dg-export-btn" title={labels.exportCsv}
                        aria-label={labels.exportCsv} onClick={p.onExportCsv}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                    </svg>
                </button>
            )}
            {p.chooser}
        </div>
    );
}
