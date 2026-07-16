// The timeline's toolbar: window title (optionally the mini-nav trigger),
// empty-state badge, zoom presets, export, live-follow toggle and paging.
// Pure presentation — window math and state stay in ResourceTimeline.
import * as React from 'react';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { TimelineZoom } from './timelineLogic';
import { TimelineLabels } from '../../shared/labelPacks';

interface TimelineToolbarProps {
    title: string;
    labels: TimelineLabels;
    zoom: TimelineZoom;
    zooms: Array<{ id: TimelineZoom; label: string }>;
    followNow: boolean;
    showMiniNav: boolean;
    miniOpen: boolean;
    showExport: boolean;
    emptyLabel: string;
    emptyHint: string;
    onToggleMini: (e: React.MouseEvent) => void;
    onSetZoom: (zoom: TimelineZoom) => void;
    onExportCsv: () => void;
    onToggleFollowNow: () => void;
    onPrev: () => void;
    onToday: () => void;
    onNext: () => void;
}

export function TimelineToolbar(p: TimelineToolbarProps): React.ReactElement {
    const { labels } = p;
    return (
        <div className="mustry-tml-toolbar">
            {p.showMiniNav ? (
                <button
                    type="button"
                    className={`mustry-tml-title mustry-tml-title--btn${p.miniOpen ? ' is-open' : ''}`}
                    onClick={p.onToggleMini}
                    aria-haspopup="true"
                    aria-expanded={p.miniOpen}
                >
                    {p.title}
                    <span className="mustry-tml-title-caret" aria-hidden="true">▾</span>
                </button>
            ) : (
                <div className="mustry-tml-title">{p.title}</div>
            )}
            {p.emptyLabel && <span className="mustry-tml-empty-badge" title={p.emptyHint || p.emptyLabel}>{p.emptyLabel}</span>}
            <div className="mustry-tml-zooms">
                {p.zooms.map((z) => (
                    <button
                        type="button" key={z.id}
                        className={`mustry-tml-zoom-btn${p.zoom === z.id ? ' mustry-tml-zoom-btn--active' : ''}`}
                        onClick={() => p.onSetZoom(z.id)}
                    >
                        {z.label}
                    </button>
                ))}
            </div>
            <div className="mustry-tml-nav">
                {p.showExport && (
                    <button type="button" className="mustry-tml-nav-btn mustry-tml-export-btn" onClick={p.onExportCsv} title={labels.exportCsv} aria-label={labels.exportCsv}>
                        <IconRenderer path="material/get_app" color="var(--tml-accent)" />
                    </button>
                )}
                <button
                    type="button"
                    className={`mustry-tml-live${p.followNow ? ' mustry-tml-live--on' : ''}`}
                    onClick={p.onToggleFollowNow}
                    aria-pressed={p.followNow}
                >
                    {p.followNow && <span className="mustry-tml-live-dot" aria-hidden="true" />}
                    {labels.followNow}
                </button>
                <button type="button" className="mustry-tml-nav-btn" onClick={p.onPrev} aria-label={labels.previous}>‹</button>
                <button type="button" className="mustry-tml-today" onClick={p.onToday}>{labels.today}</button>
                <button type="button" className="mustry-tml-nav-btn" onClick={p.onNext} aria-label={labels.next}>›</button>
            </div>
        </div>
    );
}
