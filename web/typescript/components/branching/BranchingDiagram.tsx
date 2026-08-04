import * as React from 'react';
import {
    Component,
    ComponentMeta,
    ComponentProps,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { columnOffset, findRoot, layoutTree } from './branchingLogic';
import { BranchingProps, mapBranchingProps } from './branchingProps';
import { BranchNode } from './BranchNode';
import { BranchConnection } from './BranchConnection';

// Must match BranchingDiagram.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.display.branching';

interface BranchingState {
    /** Rendered width of the scroll viewport (drives column spacing). */
    width: number;
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
        this.state = { width: 0 };
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
            const width = viewport.getBoundingClientRect().width;
            if (width !== this.state.width) {
                this.setState({ width });
            }
        }
    };

    private writeOutputs(): void {
        const p = this.props.props;
        this.props.store.props.write('output.count', p.nodes.length);
        this.props.store.props.write('output.hasRoot', findRoot(p.nodes) !== null);
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

    render() {
        const p = this.props.props;
        const layout = layoutTree(p.nodes);
        const empty = layout.nodes.length === 0;

        const emitter = this.props.emit({ classes: ['mustry-branching'] });
        const xOffset = columnOffset(this.state.width, layout.maxX, p.nodeSize, p.nodeBorderWidth, p.minXOffset);
        // The grid must stay scrollable at its minimum density.
        emitter.style = {
            ...emitter.style,
            minWidth: `${layout.maxX * p.minXOffset}px`
        };

        const disposition = p.nodeSize / 2 + p.nodeBorderWidth;
        const yPadding = layout.minY * -1 * p.yOffset;

        return (
            <div {...emitter}>
                <div className="mustry-branch-viewport">
                    {empty ? (
                        <div className="mustry-branch-empty">
                            {p.nodes.length === 0 ? p.labels.noNodes : p.labels.noRoot}
                        </div>
                    ) : (
                        <div
                            className="mustry-branch-canvas"
                            style={{ transform: `translate(${disposition}px, ${yPadding + disposition}px)` }}
                        >
                            {layout.connections.map((c) => (
                                <BranchConnection
                                    key={`${c.fromId}-${c.toId}`}
                                    from={{ x: c.from.x * xOffset, y: c.from.y * p.yOffset }}
                                    to={{ x: c.to.x * xOffset, y: c.to.y * p.yOffset }}
                                    fromSplit={c.split[1] * xOffset}
                                    toSplit={c.split[0] * xOffset}
                                    curveSize={p.curveSize}
                                    color={c.color}
                                    lineWidth={p.lineWidth}
                                />
                            ))}
                            {layout.nodes.map(({ node, cell }) => (
                                <BranchNode
                                    key={node.id}
                                    node={node}
                                    x={cell.x * xOffset}
                                    y={cell.y * p.yOffset}
                                    size={p.nodeSize}
                                    borderWidth={p.nodeBorderWidth}
                                    textSpace={Math.max(40, xOffset - 30)}
                                    selected={node.id === p.selectedNode}
                                    onClick={this.onNodeClick}
                                />
                            ))}
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
