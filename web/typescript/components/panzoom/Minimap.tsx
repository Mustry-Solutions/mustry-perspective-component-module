// The Pan & Zoom minimap: content preview, view rectangle and POI dots. Pure
// presentation — the viewport, the press/drag gesture and the fly-to live in
// PanZoomView and arrive as callbacks.
import * as React from 'react';
import { PzPoi } from './panZoomLogic';

interface MinimapProps {
    rootRef: React.RefObject<HTMLDivElement>;
    /** Callback ref for the preview layer the MinimapSnapshot fills. */
    previewRef: (el: HTMLDivElement | null) => void;
    label: string;
    anchor: { top?: number; right?: number; bottom?: number; left?: number };
    layout: { w: number; h: number; scale: number };
    viewRect: { x: number; y: number; w: number; h: number };
    contentW: number;
    contentH: number;
    preview: boolean;
    pois: PzPoi[];
    onPointerDown: (e: React.PointerEvent, scale: number) => void;
    onPoiClick: (poi: PzPoi) => void;
}

export function Minimap(p: MinimapProps): React.ReactElement {
    const { layout, viewRect: r } = p;
    return (
        <div
            className="mustry-pz-minimap"
            ref={p.rootRef}
            aria-label={p.label}
            style={{ ...p.anchor, width: layout.w, height: layout.h }}
            onPointerDown={(e) => p.onPointerDown(e, layout.scale)}
        >
            {p.preview && (
                <div
                    className="mustry-pz-mini-preview"
                    ref={p.previewRef}
                    style={{ width: p.contentW, height: p.contentH, transform: `scale(${layout.scale})` }}
                />
            )}
            <div className="mustry-pz-mini-view" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
            {p.pois.map((poi, i) => (
                <button
                    key={`${poi.name}-${i}`}
                    type="button"
                    className={`mustry-pz-mini-poi${poi.flagged ? ' mustry-pz-mini-poi--flagged' : ''}`}
                    style={{ left: poi.x * layout.scale, top: poi.y * layout.scale }}
                    title={poi.name}
                    aria-label={poi.name}
                    onClick={() => p.onPoiClick(poi)}
                />
            ))}
        </div>
    );
}
