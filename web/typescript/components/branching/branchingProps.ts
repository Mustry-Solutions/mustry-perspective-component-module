// Pure mapping from the component's PropertyTree to typed BranchingProps.
import { PropReader } from '../../shared/propReader';
import { BranchingLabels, branchingLabelBase } from '../../shared/labels/branching';
import { BranchNode, normalizeBranchNode } from './branchingLogic';

export interface BranchingProps {
    /** Minimum pixel spacing between columns (grid stretches to fill width). */
    minXOffset: number;
    /** Pixel spacing between category rows. */
    yOffset: number;
    /** Corner radius of connector bends. */
    curveSize: number;
    lineWidth: number;
    nodeSize: number;
    nodeBorderWidth: number;
    /** Node pill / info-card background ('' = the --brn-node-bg theme var). */
    backgroundColor: string;
    /** Flow direction: 'horizontal' (left-to-right) or 'vertical' (top-down). */
    orientation: string;
    /** Draw arrowheads at the target end of each connector. */
    showArrows: boolean;
    locale: string;
    labels: BranchingLabels;
    nodes: BranchNode[];
    /** state.selectedNode (two-way) — the selected node's id, -1 = none. */
    selectedNode: number;
}

export function mapBranchingProps(tree: PropReader): BranchingProps {
    const locale = tree.readString('config.locale', '');
    const base = branchingLabelBase(locale);
    const labels = {} as Record<string, string>;
    (Object.keys(base) as Array<keyof BranchingLabels>).forEach((k) => {
        const v = tree.readString(`config.labels.${k}`, '');
        labels[k] = v !== '' ? v : base[k];
    });

    return {
        minXOffset: Math.max(20, tree.readNumber('config.minXOffset', 50)),
        yOffset: Math.max(20, tree.readNumber('config.yOffset', 50)),
        curveSize: Math.max(0, tree.readNumber('config.curveSize', 10)),
        lineWidth: Math.max(1, tree.readNumber('config.lineWidth', 2)),
        nodeSize: Math.max(8, tree.readNumber('config.nodeSize', 20)),
        nodeBorderWidth: Math.max(0, tree.readNumber('config.nodeBorderWidth', 2)),
        backgroundColor: tree.readString('config.backgroundColor', ''),
        orientation: tree.readString('config.orientation', 'horizontal') === 'vertical' ? 'vertical' : 'horizontal',
        showArrows: tree.readBoolean('config.showArrows', false),
        locale,
        labels: labels as unknown as BranchingLabels,
        nodes: (tree.readArray('data.nodes', []) || []).map(normalizeBranchNode),
        selectedNode: tree.readNumber('state.selectedNode', -1)
    };
}
