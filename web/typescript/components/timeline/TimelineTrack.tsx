// One resource row's track content: background bands, state bands, lane-packed
// event bars and the in-flight gesture ghost. Pure presentation — permissions,
// recurrence semantics, hover state and the gesture controller live in
// ResourceTimeline and arrive as callbacks.
import * as React from 'react';
import { EventIcon, resolveColor, statusClass } from '../../shared/eventStyle';
import { Category } from '../../shared/types';
import { BarLayout, RowItem, TimeScale, TimelineEvent, barGeom, msToPx } from './timelineLogic';
import { TlPreview } from './timelineGestureController';

/** One resource row's laid-out content. */
export interface RowLayouts {
    bands: BarLayout[];
    states: BarLayout[];
    bars: BarLayout[];
}

interface TimelineTrackProps {
    row: RowItem;
    lay: RowLayouts;
    scale: TimeScale;
    rowHeight: number;
    categories: Category[];
    preview: TlPreview | null;
    movable: (ev: TimelineEvent) => boolean;
    eventExtent: (ev: TimelineEvent) => { startMs: number; endMs: number };
    isOccurrence: (ev: TimelineEvent) => boolean;
    enterClass: (occId: string) => string;
    onBarHover: (it: BarLayout, resourceLabel: string, e: React.MouseEvent) => void;
    onHoverEnd: () => void;
    onBarClick: (ev: TimelineEvent) => void;
    onBandClick: (ev: TimelineEvent) => void;
    onStartMove: (ev: TimelineEvent, startMs: number, endMs: number, e: React.PointerEvent) => void;
    onStartResize: (edge: 'start' | 'end', ev: TimelineEvent, startMs: number, endMs: number, e: React.PointerEvent) => void;
}

/** The in-flight gesture's ghost bar / selection rectangle on this row. */
function renderPreview(p: TimelineTrackProps): React.ReactNode {
    const preview = p.preview;
    if (!preview || preview.resourceId !== p.row.resource!.id) {
        return null;
    }
    const left = msToPx(p.scale, Math.max(preview.startMs, p.scale.startMs));
    const width = Math.max(2, msToPx(p.scale, Math.min(preview.endMs, p.scale.endMs)) - left);
    if (preview.mode === 'create') {
        return <div className="mustry-tml-select" style={{ left, width }} />;
    }
    return (
        <div
            className="mustry-tml-bar mustry-tml-bar--ghost"
            style={{
                left, width, top: 3, height: p.rowHeight - 8,
                ...(preview.color ? { ['--ev' as string]: preview.color } : {})
            } as React.CSSProperties}
        >
            <span className="mustry-tml-bar-title">{preview.title || ''}</span>
        </div>
    );
}

export function TimelineTrack(p: TimelineTrackProps): React.ReactElement {
    const { row, lay, scale, categories, preview } = p;
    const rowH = p.rowHeight;
    const px = (ms: number) => msToPx(scale, ms);
    const geom = (it: BarLayout) => ({ left: px(it.startMs), width: Math.max(2, px(it.endMs) - px(it.startMs)) });
    const { bands, states, bars } = lay;
    const barArea = rowH - 6;   // 3px vertical inset
    return (
        <>
            {bands.map((it, i) => (
                <div
                    key={`bg-${it.event.id || i}`} className="mustry-tml-band mustry-tml-band--bg"
                    style={{ ...geom(it), background: resolveColor(categories, it.event) || undefined }}
                />
            ))}
            {states.map((it, i) => {
                const g = geom(it);
                return (
                    <div
                        key={`st-${it.event.id || i}`}
                        className={`mustry-tml-band mustry-tml-band--state${statusClass(it.event)}${p.enterClass(it.event.id)}`}
                        style={{ ...g, ['--ev' as string]: resolveColor(categories, it.event) } as React.CSSProperties}
                        role="button"
                        tabIndex={0}
                        aria-label={`${it.event.title || ''} — ${row.label}`}
                        onMouseEnter={(e) => p.onBarHover(it, row.label, e)}
                        onMouseLeave={p.onHoverEnd}
                        onClick={() => p.onBandClick(it.event)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                p.onBandClick(it.event);
                            }
                        }}
                    >
                        {g.width > 48 && <span className="mustry-tml-band-label">{it.event.title}</span>}
                    </div>
                );
            })}
            {bars.map((it, i) => {
                const ev = it.event;
                if (preview && preview.mode !== 'create' && preview.eventId === ev.id) {
                    return null;   // hidden while dragging; the ghost is shown instead
                }
                // Floor the width so short jobs stay grabbable; drop the edge
                // handles when they'd swallow the whole bar (move/click only).
                const g = barGeom(px(it.startMs), px(it.endMs));
                const laneH = barArea / it.lanes;
                const movable = p.movable(ev);
                const cls = ['mustry-tml-bar'];
                if (movable) { cls.push('mustry-tml-bar--movable'); }
                if (it.continuesLeft) { cls.push('mustry-tml-bar--cont-left'); }
                if (it.continuesRight) { cls.push('mustry-tml-bar--cont-right'); }
                const color = resolveColor(categories, ev);
                const extent = p.eventExtent(ev);
                return (
                    <div
                        key={`b-${ev.id || i}`}
                        className={cls.join(' ') + statusClass(ev) + p.enterClass(ev.id)}
                        style={{
                            left: g.left,
                            width: g.width,
                            top: 3 + it.lane * laneH,
                            height: Math.max(10, laneH - 2),
                            ...(color ? { ['--ev' as string]: color } : {})
                        } as React.CSSProperties}
                        title={ev.title}
                        role="button"
                        tabIndex={0}
                        aria-label={`${ev.title || ''} — ${row.label}`}
                        onPointerDown={movable
                            ? (e) => p.onStartMove(ev, extent.startMs, extent.endMs, e)
                            : undefined}
                        onClick={movable ? undefined : () => p.onBarClick(ev)}
                        // Keyboard: gestures hang off pointerdown, so Enter/Space
                        // opens the bar directly (a keyboard can't drag).
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                p.onBarClick(ev);
                            }
                        }}
                        onMouseEnter={(e) => p.onBarHover(it, row.label, e)}
                        onMouseLeave={p.onHoverEnd}
                    >
                        {movable && g.showHandles && !it.continuesLeft && (
                            <div
                                className="mustry-tml-resize mustry-tml-resize--start"
                                onPointerDown={(e) => p.onStartResize('start', ev, extent.startMs, extent.endMs, e)}
                            />
                        )}
                        {p.isOccurrence(ev) && (
                            // Part of a series: dragging/editing detaches this occurrence.
                            <span className="mustry-tml-bar-recur" aria-hidden="true">↻</span>
                        )}
                        <EventIcon ev={ev} categories={categories} />
                        <span className="mustry-tml-bar-title">{ev.title}</span>
                        {movable && g.showHandles && !it.continuesRight && (
                            <div
                                className="mustry-tml-resize mustry-tml-resize--end"
                                onPointerDown={(e) => p.onStartResize('end', ev, extent.startMs, extent.endMs, e)}
                            />
                        )}
                    </div>
                );
            })}
            {renderPreview(p)}
        </>
    );
}
