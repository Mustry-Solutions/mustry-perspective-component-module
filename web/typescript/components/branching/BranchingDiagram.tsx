import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { columnOffset, diagnose, findRoot, layoutTree } from './branchingLogic';
import { BranchingProps, mapBranchingProps } from './branchingProps';
import { BranchNode } from './BranchNode';
import { BranchConnection } from './BranchConnection';

// Must match BranchingDiagram.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.display.branching';

// Horizontal padding of the node's pill halo (must match `.mustry-branch-pill`
// in branching.scss) — how far the white halo extends past the disc, so an
// arrowhead approaching along the horizontal (flow) axis can clear it.
const PILL_PADDING = 10;

interface BranchingState {
    /** Rendered size of the scroll viewport (drives flow-axis spacing). */
    width: number;
    height: number;
}

/**
 * Branching Diagram — a left-to-right decision-tree / flow-path renderer,
 * migrated from ignition-mustry-ui (see
 * docs/branching-component-migration-plan.md). data.nodes is a flat node
 * array; the pure layout (branchingLogic) BFS-places nodes into columns by
 * depth and rows by category, pushes re-referenced nodes forward so arrows
 * always point right, and routes SVG connectors. Clicking a node fires
 * onNodeClick and writes state.selectedNode (two-way). Display-only:
 * no data mutation, no persistence contract.
 */
export class BranchingDiagram extends Component<ComponentProps<BranchingProps>, BranchingState> {

    constructor(props: ComponentProps<BranchingProps>) {
        super(props);
        this.state = { width: 0, height: 0 };
    }

    componentDidMount(): void {
        window.addEventListener('resize', this.measure);
        this.measure();
        this.writeOutputs();
    }

    componentDidUpdate(): void {
        this.writeOutputs();
    }

    componentWillUnmount(): void {
        window.removeEventListener('resize', this.measure);
    }

    /** props.store.element is Perspective's ref to our mounted root. */
    private measure = (): void => {
        const root = this.props.store.element;
        const viewport = root && root.querySelector('.mustry-branch-viewport');
        if (viewport) {
            const box = viewport.getBoundingClientRect();
            if (box.width !== this.state.width || box.height !== this.state.height) {
                this.setState({ width: box.width, height: box.height });
            }
        }
    };

    private writeOutputs(): void {
        const p = this.props.props;
        const { rootId, warnings } = diagnose(p.nodes);
        this.props.store.props.write('output.count', p.nodes.length);
        this.props.store.props.write('output.hasRoot', rootId !== null);
        this.props.store.props.write('output.warnings', warnings.map((w) => w.message));
    }

    private onNodeClick = (id: number): void => {
        const node = this.props.props.nodes.find((n) => n.id === id);
        this.props.store.props.write('state.selectedNode', id);
        if (this.props.eventsEnabled && node) {
            this.props.componentEvents.fireComponentEvent('onNodeClick', {
                id, name: node.name, category: node.category
            });
        }
    };

    /** Empty-state message, distinguishing no-nodes / cycle / generic no-root. */
    private emptyMessage(): string {
        const p = this.props.props;
        if (p.nodes.length === 0) {
            return p.labels.noNodes;
        }
        return diagnose(p.nodes).warnings.some((w) => w.code === 'cycle')
            ? p.labels.cyclic
            : p.labels.noRoot;
    }

    render() {
        const p = this.props.props;
        const layout = layoutTree(p.nodes);
        const empty = layout.nodes.length === 0;

        const emitter = this.props.emit({ classes: ['mustry-branching'] });
        const vertical = p.orientation === 'vertical';
        const absoluteNodeSize = p.nodeSize + p.nodeBorderWidth * 2;

        // Flow axis = tree depth (fills the available extent, min minXOffset,
        // then scrolls); cross axis = category (fixed yOffset spacing).
        const flowSize = vertical ? this.state.height : this.state.width;

        // Horizontal only: the original let labels spill outside the component
        // (overflow visible); we scroll instead, so the half-label hanging past
        // the first/last column must be reserved INSIDE the scroll area. Two
        // passes because the label width follows the spacing it also reduces.
        const overhangOf = (offset: number): number =>
            Math.max(0, (Math.min(200, Math.max(40, offset - 30)) - absoluteNodeSize) / 2);
        const firstPass = columnOffset(flowSize, layout.maxX, p.nodeSize, p.nodeBorderWidth, p.minXOffset);
        const overhang = vertical ? 0 : overhangOf(firstPass);
        const flowSpacing = columnOffset(flowSize - 2 * overhang, layout.maxX, p.nodeSize, p.nodeBorderWidth, p.minXOffset);
        const crossSpacing = p.yOffset;

        // cell (depth, category) -> pixel centre, orientation-aware.
        const pos = (cx: number, cy: number): { x: number; y: number } =>
            vertical
                ? { x: cy * crossSpacing, y: cx * flowSpacing }
                : { x: cx * flowSpacing, y: cy * crossSpacing };

        const disposition = p.nodeSize / 2 + p.nodeBorderWidth;
        const crossPad = layout.minY * -1 * crossSpacing;
        const maxCross = Math.max(0, ...layout.nodes.map((n) => n.cell.y));
        const crossExtent = (maxCross - layout.minY) * crossSpacing;
        const flowExtentMin = layout.maxX * p.minXOffset;
        const textSpace = vertical ? Math.max(40, crossSpacing - 10) : Math.max(40, flowSpacing - 30);
        // Vertical: labels are horizontal text centred under discs, so the
        // half-label overhangs the cross axis (as the horizontal label
        // overhangs the flow axis) and must be reserved to avoid left-clipping.
        const labelPad = vertical ? textSpace / 2 : 0;

        // Keep the grid scrollable at its minimum density on both axes.
        emitter.style = vertical
            ? { ...emitter.style, minWidth: `${crossExtent + 2 * labelPad + absoluteNodeSize}px`, minHeight: `${flowExtentMin}px` }
            : { ...emitter.style, minWidth: `${flowExtentMin + 2 * overhang}px` };

        const translate = vertical
            ? `translate(${crossPad + disposition + labelPad}px, ${disposition}px)`
            : `translate(${disposition + overhang}px, ${crossPad + disposition}px)`;

        return (
            <div {...emitter}>
                <div className="mustry-branch-viewport">
                    {empty ? (
                        <div className="mustry-branch-empty">{this.emptyMessage()}</div>
                    ) : (
                        <div className="mustry-branch-canvas" style={{ transform: translate }}>
                            {layout.connections.map((c) => (
                                <BranchConnection
                                    key={`${c.fromId}-${c.toId}`}
                                    id={`${c.fromId}-${c.toId}`}
                                    from={pos(c.from.x, c.from.y)}
                                    to={pos(c.to.x, c.to.y)}
                                    fromSplit={c.split[1] * flowSpacing}
                                    toSplit={c.split[0] * flowSpacing}
                                    curveSize={p.curveSize}
                                    color={c.color}
                                    lineWidth={p.lineWidth}
                                    vertical={vertical}
                                    arrow={p.showArrows}
                                    nodeRadius={disposition}
                                    haloPad={vertical ? 0 : PILL_PADDING}
                                />
                            ))}
                            {layout.connections.map((c) => {
                                const label = p.edgeLabels[`${c.fromId}-${c.toId}`];
                                if (!label) {
                                    return null;
                                }
                                const from = pos(c.from.x, c.from.y);
                                const to = pos(c.to.x, c.to.y);
                                // Endpoint midpoint: siblings from one source that
                                // fan to different rows separate instead of colliding.
                                const at = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                                return (
                                    <div
                                        key={`lbl-${c.fromId}-${c.toId}`}
                                        className="mustry-branch-edge-label"
                                        style={{ left: at.x, top: at.y }}
                                    >
                                        {label}
                                    </div>
                                );
                            })}
                            {layout.nodes.map(({ node, cell }) => {
                                const pt = pos(cell.x, cell.y);
                                return (
                                    <BranchNode
                                        key={node.id}
                                        node={node}
                                        x={pt.x}
                                        y={pt.y}
                                        size={p.nodeSize}
                                        borderWidth={p.nodeBorderWidth}
                                        textSpace={textSpace}
                                        backgroundColor={p.backgroundColor}
                                        selected={node.id === p.selectedNode}
                                        onClick={this.onNodeClick}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

export class BranchingDiagramMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return BranchingDiagram as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 560, height: 320 };
    }

    getPropsReducer(tree: PropertyTree): BranchingProps {
        return mapBranchingProps(tree);
    }
}
