import * as React from 'react';
import { computeConnector } from './branchingLogic';

interface Point {
    x: number;
    y: number;
}

interface BranchConnectionProps {
    /** Stable id for this edge (used to scope the arrow marker). */
    id: string;
    from: Point;
    to: Point;
    /** Pixel offsets (from the origin, along the flow axis) for the run hand-off. */
    fromSplit: number;
    toSplit: number;
    curveSize: number;
    color: string;
    lineWidth: number;
    /** Vertical (top-to-bottom) layout instead of the default left-to-right. */
    vertical: boolean;
    /** Draw an arrowhead at the target; the run is trimmed to the disc edge. */
    arrow: boolean;
    /** Disc radius (nodeSize/2 + border) — how far to trim for the arrow tip. */
    nodeRadius: number;
}

/**
 * The SVG connector between two nodes. All geometry lives in the pure,
 * node-tested computeConnector (which fixes the original's broken routing for
 * backward/loop edges and adds orientation + arrow trimming); this component
 * only turns that into elements and, when enabled, an auto-oriented arrowhead.
 */
export function BranchConnection(props: BranchConnectionProps): JSX.Element {
    const stroke = props.color || 'var(--brn-line, #7b8794)';
    const geo = computeConnector(
        props.from,
        props.to,
        props.fromSplit,
        props.toSplit,
        props.curveSize,
        props.vertical,
        props.arrow ? props.nodeRadius + props.lineWidth : 0
    );
    const markerId = `brn-arrow-${props.id}`;
    return (
        <svg
            className="mustry-branch-path"
            style={{ left: geo.left, top: geo.top, width: geo.width, height: geo.height }}
        >
            {props.arrow && (
                <defs>
                    <marker
                        id={markerId}
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth={8}
                        markerHeight={8}
                        orient="auto-start-reverse"
                    >
                        <path d="M 0 1 L 9 5 L 0 9 z" fill={stroke} />
                    </marker>
                </defs>
            )}
            {geo.segments.map((d, i) => (
                <path
                    key={i}
                    d={d}
                    stroke={stroke}
                    strokeWidth={props.lineWidth}
                    fill="none"
                    markerEnd={props.arrow && i === geo.segments.length - 1 ? `url(#${markerId})` : undefined}
                />
            ))}
        </svg>
    );
}
