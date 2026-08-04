// Pure layout logic for the Branching Diagram — no DOM, node-tested.
//
// Ported from ignition-mustry-ui's BranchingComponent (its one real asset):
// a left-to-right directed tree laid out by BFS, with category→row mapping,
// forward-pushing of nodes that are reached again later (so arrows always
// point right), and connector split-point routing that prefers the midpoint
// but detours around occupied cells. The original embedded this in the React
// class; here it is extracted pure and returns positioned DATA — the shell
// maps it to elements.

export interface BranchNode {
    id: number;
    name: string;
    /** Category buckets map to rows: lower category = higher row. */
    category: number;
    /** Outgoing edges (ids). Unknown ids are dropped in normalization. */
    nextId: number[];
    color: string;
    /** Fill the icon disc with the node colour (false = outline only). */
    fill: boolean;
    icon: { path: string; color: string } | null;
    /** Info-card text shown on hover ('' = none). Plain text this milestone. */
    tooltip: string;
    /** Per-node style passthroughs (open objects from the bound data). */
    style: object;
    tooltipStyle: object;
}

export function normalizeBranchNode(raw: any): BranchNode {
    const src = raw || {};
    const icon = src.icon && src.icon.path
        ? { path: String(src.icon.path), color: src.icon.color == null ? '' : String(src.icon.color) }
        : null;
    return {
        id: Number(src.id),
        name: src.name == null ? '' : String(src.name),
        category: Number(src.category) || 0,
        nextId: Array.isArray(src.nextId) ? src.nextId.map(Number).filter((n: number) => !isNaN(n)) : [],
        color: src.color == null ? '' : String(src.color),
        fill: src.fill !== false,
        icon,
        tooltip: src.tooltip == null ? '' : String(src.tooltip),
        style: src.style || {},
        tooltipStyle: src.tooltipStyle || {}
    };
}

/** Grid cell (x = BFS depth column, y = category row). */
export interface Cell {
    x: number;
    y: number;
}

export interface LayoutNode {
    node: BranchNode;
    cell: Cell;
}

export interface LayoutConnection {
    fromId: number;
    toId: number;
    from: Cell;
    to: Cell;
    /** Where the connector leaves its horizontal run, in column units
     *  relative to `from.x`: [toSplit, fromSplit] per the original routing. */
    split: [number, number];
    color: string;
}

export interface Layout {
    nodes: LayoutNode[];
    connections: LayoutConnection[];
    /** Highest occupied column (grid units). */
    maxX: number;
    /** Rows above row 0 (grid units) — the shell translates down by this. */
    minY: number;
}

/**
 * The root is the node that has outgoing edges but is referenced by no one.
 * Returns null when the data has no such node (empty, cyclic, or all-leaf).
 */
export function findRoot(nodes: BranchNode[]): number | null {
    const referenced = new Set<number>();
    for (const node of nodes) {
        node.nextId.forEach((id) => referenced.add(id));
    }
    const root = nodes.find((n) => n.nextId.length > 0 && !referenced.has(n.id));
    return root ? root.id : null;
}

interface Placed {
    node: BranchNode;
    cell: Cell;
    origins: Array<{ id: number; split: [number, number] }>;
}

/**
 * BFS layout. Faithful port of the original three passes:
 *  1. BFS from the root, one column per depth, row = the category's rank.
 *     A node reached twice is recorded as a duplicate edge, not re-placed.
 *  2. Duplicate resolution: when an edge points backwards or sideways
 *     (origin at/after the target's column), the target and its whole
 *     subtree are pushed right until the arrow points forward again.
 *  3. Split routing: each connector picks the horizontal hand-off column —
 *     the midpoint when the corridor is clear, otherwise the nearest free
 *     half-cells on each side.
 */
export function layoutTree(input: BranchNode[]): Layout {
    const nodes = new Map<number, BranchNode>();
    input.forEach((n) => nodes.set(n.id, n));
    const rootId = findRoot(input);
    if (rootId === null) {
        return { nodes: [], connections: [], maxX: 0, minY: 0 };
    }

    const categories = Array.from(new Set(input.map((n) => n.category))).sort((a, b) => a - b);
    const rowOf: { [category: number]: number } = {};
    categories.forEach((c, i) => { rowOf[c] = i; });

    const placed = new Map<number, Placed>();
    const levels: Array<Array<number | undefined>> = categories.map(() => []);
    const queued = new Set<number>([rootId]);
    const duplicates: Array<[number, number]> = []; // [targetId, originId]
    let maxX = 0;

    const root = nodes.get(rootId)!;
    const buffer: Array<[BranchNode, Cell, number]> = [[root, { x: 0, y: rowOf[root.category] }, -1]];

    while (buffer.length > 0) {
        const [node, cell, originId] = buffer.shift()!;
        for (const childId of node.nextId) {
            const child = nodes.get(childId);
            if (!child) {
                continue; // dangling edge — dropped, never crashes the layout
            }
            if (queued.has(childId)) {
                duplicates.push([childId, node.id]);
            } else {
                buffer.push([child, { x: cell.x + 1, y: rowOf[child.category] }, node.id]);
                queued.add(childId);
            }
            levels[cell.y][cell.x] = node.id;
        }
        maxX = Math.max(maxX, cell.x);
        placed.set(node.id, {
            node, cell,
            origins: originId === -1 ? [] : [{ id: originId, split: [0, 0] }]
        });
    }

    for (const [targetId, originId] of duplicates) {
        const origin = placed.get(originId);
        const target = placed.get(targetId);
        if (!origin || !target) {
            continue;
        }
        if (origin.cell.x >= target.cell.x) {
            const behind = origin.cell.x - target.cell.x + 1;
            const forward: number[] = [targetId];
            const done = new Set<number>();
            while (forward.length > 0) {
                const id = forward.shift()!;
                if (done.has(id)) {
                    continue;
                }
                const p = placed.get(id);
                if (!p) {
                    continue;
                }
                if (levels[p.cell.y][p.cell.x] === id) {
                    levels[p.cell.y][p.cell.x] = undefined;
                }
                p.cell.x += behind;
                maxX = Math.max(maxX, p.cell.x);
                levels[p.cell.y][p.cell.x] = id;
                forward.push(...p.node.nextId);
                done.add(id);
            }
        }
        target.origins.push({ id: originId, split: [0, 0] });
    }

    for (const { cell, origins } of placed.values()) {
        let minNodeSplit = cell.x - 1;
        while (minNodeSplit > 0 && levels[cell.y][minNodeSplit] === undefined) {
            minNodeSplit--;
        }
        for (const origin of origins) {
            const originCell = placed.get(origin.id)!.cell;
            let maxOriginSplit = originCell.x + 1;
            while (
                maxOriginSplit < levels[originCell.y].length
                && maxOriginSplit < cell.y
                && levels[originCell.y][maxOriginSplit] === undefined
            ) {
                maxOriginSplit++;
            }
            if (maxOriginSplit === levels[originCell.y].length || maxOriginSplit > cell.x) {
                maxOriginSplit = cell.x;
            }
            const boundedMin = minNodeSplit < originCell.x ? originCell.x : minNodeSplit;
            if (maxOriginSplit > boundedMin) {
                const half = (maxOriginSplit - boundedMin) / 2;
                let split = half;
                if (maxOriginSplit - originCell.x > cell.x - boundedMin) {
                    split = cell.x - originCell.x - half;
                }
                origin.split = [split, split];
            } else {
                origin.split = [boundedMin + 0.5 - originCell.x, maxOriginSplit - 0.5 - originCell.x];
            }
        }
    }

    const out: Layout = { nodes: [], connections: [], maxX, minY: 0 };
    for (const { node, cell, origins } of placed.values()) {
        out.minY = Math.min(out.minY, cell.y);
        out.nodes.push({ node, cell });
        for (const origin of origins) {
            const from = placed.get(origin.id)!;
            out.connections.push({
                fromId: origin.id,
                toId: node.id,
                from: { ...from.cell },
                to: { ...cell },
                split: origin.split,
                color: from.node.color
            });
        }
    }
    return out;
}

/** The pixel x-spacing between columns for a given rendered width. */
export function columnOffset(width: number, maxX: number, nodeSize: number, borderWidth: number, minXOffset: number): number {
    if (maxX <= 0) {
        return minXOffset;
    }
    const absoluteNodeSize = nodeSize + borderWidth * 2;
    const offset = (width - absoluteNodeSize) / maxX;
    return offset < minXOffset ? minXOffset : offset;
}
