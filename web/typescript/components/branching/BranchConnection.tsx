import * as React from 'react';

interface Point {
    x: number;
    y: number;
}

interface BranchConnectionProps {
    from: Point;
    to: Point;
    /** Pixel offsets (from `from.x`) where the run hands off between rows. */
    fromSplit: number;
    toSplit: number;
    curveSize: number;
    color: string;
    lineWidth: number;
}

const PADDING = 10;

/**
 * The SVG connector between two nodes: horizontal run, curved hand-off to
 * the target row, horizontal run to the target. Faithful port of
 * mustry-ui's ConnectionComponent (five path segments), with namespaced
 * classes and theme-var default colour.
 */
export function BranchConnection(props: BranchConnectionProps): JSX.Element {
    const { from, to, curveSize, lineWidth } = props;
    const margin = PADDING / 2;
    const curveStep = from.y === to.y ? 0 : curveSize;
    const fromHigher = from.y < to.y;

    const s0: Point = { x: margin, y: fromHigher ? margin : from.y - to.y + margin };
    const s1: Point = { x: s0.x + props.fromSplit - curveStep, y: s0.y };
    const s2: Point = { x: s1.x + curveStep, y: fromHigher ? s1.y + curveStep : s1.y - curveStep };
    const s3: Point = { x: props.toSplit + margin, y: fromHigher ? to.y - from.y + margin - curveStep : margin + curveStep };
    const s4: Point = { x: s3.x + curveStep, y: fromHigher ? s3.y + curveStep : s3.y - curveStep };
    const s5: Point = { x: to.x - from.x + margin, y: s4.y };

    const stroke = props.color || 'var(--brn-line, #7b8794)';
    return (
        <svg
            className="mustry-branch-path"
            style={{
                left: from.x - margin,
                top: (fromHigher ? from.y : to.y) - margin,
                width: to.x - from.x + PADDING,
                height: Math.abs(from.y - to.y) + PADDING
            }}
        >
            <path d={`M ${s0.x} ${s0.y} L ${s1.x} ${s1.y}`} stroke={stroke} strokeWidth={lineWidth} fill="none" />
            <path d={`M ${s1.x} ${s1.y} C ${s1.x} ${s1.y} ${s2.x} ${s1.y} ${s2.x} ${s2.y}`} stroke={stroke} strokeWidth={lineWidth} fill="none" />
            <path d={`M ${s2.x} ${s2.y} L ${s3.x} ${s3.y}`} stroke={stroke} strokeWidth={lineWidth} fill="none" />
            <path d={`M ${s3.x} ${s3.y} C ${s3.x} ${s3.y} ${s3.x} ${s4.y} ${s4.x} ${s4.y}`} stroke={stroke} strokeWidth={lineWidth} fill="none" />
            <path d={`M ${s4.x} ${s4.y} L ${s5.x} ${s5.y}`} stroke={stroke} strokeWidth={lineWidth} fill="none" />
        </svg>
    );
}
