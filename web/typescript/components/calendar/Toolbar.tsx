// Calendar toolbar: title (optionally a mini-nav trigger), view switcher, export + nav.
import * as React from 'react';
import { IconRenderer } from '@inductiveautomation/perspective-client';
import { CalLabels, CalView } from './calendarTypes';

const VIEWS: CalView[] = ['month', 'week', 'day', 'list'];

interface ToolbarProps {
    title: string;
    view: CalView;
    showMiniNav: boolean;
    miniOpen: boolean;
    showExport: boolean;
    emptyLabel: string;   // shown as a muted badge by the title when no events are configured ('' = hidden)
    emptyHint: string;    // tooltip on that badge — a nutshell of how to use / add events
    followNow: boolean;   // live follow mode armed (state.followNow, two-way)
    labels: CalLabels;
    onToggleMini: (e: React.MouseEvent) => void;
    onSetView: (v: CalView) => void;
    onExport: () => void;
    onToggleFollow: () => void;
    onPrev: () => void;
    onToday: () => void;
    onNext: () => void;
}

export function Toolbar(props: ToolbarProps): React.ReactElement {
    const {
        title, view, showMiniNav, miniOpen, showExport, emptyLabel, emptyHint, followNow, labels,
        onToggleMini, onSetView, onExport, onToggleFollow, onPrev, onToday, onNext
    } = props;
    return (
        <div className="mustry-cal-toolbar">
            {showMiniNav ? (
                <button
                    type="button"
                    className={`mustry-cal-title mustry-cal-title--btn${miniOpen ? ' is-open' : ''}`}
                    onClick={onToggleMini}
                    aria-haspopup="true"
                    aria-expanded={miniOpen}
                >
                    {title}
                    <span className="mustry-cal-title-caret" aria-hidden="true">▾</span>
                </button>
            ) : (
                <div className="mustry-cal-title">{title}</div>
            )}
            {emptyLabel && <span className="mustry-cal-empty-badge" title={emptyHint || emptyLabel}>{emptyLabel}</span>}
            <div className="mustry-cal-views">
                {VIEWS.map((v) => (
                    <button
                        type="button"
                        key={v}
                        className={`mustry-cal-view-btn${view === v ? ' mustry-cal-view-btn--active' : ''}`}
                        onClick={() => onSetView(v)}
                    >
                        {labels[v]}
                    </button>
                ))}
            </div>
            <div className="mustry-cal-nav">
                {showExport && (
                    <button type="button" className="mustry-cal-nav-btn mustry-cal-export-btn" onClick={onExport} title={labels.exportCsv} aria-label={labels.exportCsv}>
                        <IconRenderer path="material/get_app" color="var(--cal-accent)" />
                    </button>
                )}
                <button
                    type="button"
                    className={`mustry-cal-live${followNow ? ' mustry-cal-live--on' : ''}`}
                    onClick={onToggleFollow}
                    aria-pressed={followNow}
                >
                    {followNow && <span className="mustry-cal-live-dot" aria-hidden="true" />}
                    {labels.followNow}
                </button>
                <button type="button" className="mustry-cal-nav-btn" onClick={onPrev} aria-label={labels.previous}>‹</button>
                <button type="button" className="mustry-cal-today" onClick={onToday}>{labels.today}</button>
                <button type="button" className="mustry-cal-nav-btn" onClick={onNext} aria-label={labels.next}>›</button>
            </div>
        </div>
    );
}
