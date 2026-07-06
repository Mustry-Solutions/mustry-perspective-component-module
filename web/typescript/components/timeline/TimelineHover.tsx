// Event detail popover shown on hover, portaled to escape the timeline's clipping.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Category } from '../../shared/types';
import { EventIcon, resolveColor } from '../../shared/eventStyle';
import { TimelineLabels } from '../../shared/labelPacks';
import { zonedFormat } from './timelineLogic';
import { TimelineEvent } from './timelineLogic';

export interface TimelineHoverInfo {
    event: TimelineEvent;
    resourceLabel: string;
    startMs: number;   // unclamped when known; clamped window values otherwise
    endMs: number;
    rect: { top: number; bottom: number; left: number; right: number };
}

interface TimelineHoverProps {
    hover: TimelineHoverInfo;
    locale: string;
    timezone: string;
    categories: Category[];
    labels: TimelineLabels;
}

export function TimelineHover({ hover, locale, timezone, categories, labels }: TimelineHoverProps): React.ReactElement {
    const ev = hover.event;
    const fmt = zonedFormat(locale, timezone, {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    });
    const W = 260;
    const left = Math.max(6, Math.min(hover.rect.left, window.innerWidth - W - 6));
    const below = hover.rect.bottom + 6;
    const top = below + 120 > window.innerHeight ? Math.max(6, hover.rect.top - 126) : below;
    const color = resolveColor(categories, ev);
    // Localized status badge (calendar HoverPopover parity).
    const statusLabel = ev.status === 'tentative' ? labels.statusTentative
        : ev.status === 'cancelled' ? labels.statusCancelled
            : ev.status === 'done' ? labels.statusDone : '';
    return ReactDOM.createPortal(
        <div className="tml-hover" style={{ top, left, width: W }}>
            <div className="tml-hover-title">
                <span className="tml-hover-dot" style={{ background: color || 'var(--tml-accent)' }} />
                <EventIcon ev={ev} categories={categories} />
                <span className="tml-hover-name">{ev.title}</span>
                {statusLabel ? <span className="tml-hover-status">{statusLabel}</span> : null}
            </div>
            <div className="tml-hover-line">{hover.resourceLabel}</div>
            <div className="tml-hover-line">
                {fmt.format(new Date(hover.startMs))} – {fmt.format(new Date(hover.endMs))}
            </div>
            {ev.description && <div className="tml-hover-desc">{ev.description}</div>}
        </div>,
        document.body
    );
}
