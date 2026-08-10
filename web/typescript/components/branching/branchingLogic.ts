// Pure layout logic for the Branching Diagram — no DOM, node-tested.
//
// Originally ported from ignition-mustry-ui's BranchingComponent, then the
// placement was rewritten from that BFS + forward-push scheme to a layered
// ("Sugiyama-style") layout: a cycle-break pass classifies back-edges, then
// longest-path layer assignment sets each node's column (category → row).
// A loop no longer shoves its downstream subtree sideways — it just draws as
// a backward connector. Connector split-point routing (kept from the port)
// prefers the midpoint but detours around occupied cells. Returns positioned
// DATA — the shell maps it to elements.

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
    /** Info-card text shown on hover ('' = none). Rendered as markdown. */
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

/** Grid cell (x = depth/layer column, y = category row). */
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

/** Machine-readable reason codes for why a tree does/doesn't render fully. */
export type BranchWarningCode = 'no-edges' | 'cycle' | 'dangling-edge' | 'unreachable';

export interface BranchWarning {
    code: BranchWarningCode;
    /** English, author-facing detail (surfaced via output.warnings). */
    message: string;
    /** Offending node ids, where applicable. */
    ids: number[];
}

export interface BranchDiagnosis {
    rootId: number | null;
    warnings: BranchWarning[];
}

/**
 * Explain a dataset the layout can't (fully) draw, so the reason is visible
 * instead of a silent empty canvas. Purely additive — it never changes what
 * renders; it just reports: no edges at all, a cycle (every node referenced,
 * so no entry point), edges pointing at unknown ids, and nodes unreachable
 * from the root (which the layout silently drops).
 */
export function diagnose(nodes: BranchNode[]): BranchDiagnosis {
    const warnings: BranchWarning[] = [];
    if (nodes.length === 0) {
        return { rootId: null, warnings };
    }

    const ids = new Set(nodes.map((n) => n.id));
    let anyOutgoing = false;
    const dangling: number[] = [];
    for (const node of nodes) {
        if (node.nextId.length > 0) {
            anyOutgoing = true;
        }
        for (const target of node.nextId) {
            if (!ids.has(target) && !dangling.includes(target)) {
                dangling.push(target);
            }
        }
    }
    if (dangling.length > 0) {
        warnings.push({
            code: 'dangling-edge',
            message: `Edge(s) point to unknown node id(s): ${dangling.join(', ')}. They are ignored.`,
            ids: dangling
        });
    }

    const rootId = findRoot(nodes);
    if (rootId === null) {
        if (!anyOutgoing) {
            warnings.push({
                code: 'no-edges',
                message: 'No node has outgoing edges, so nothing links into a tree.',
                ids: []
            });
        } else {
            warnings.push({
                code: 'cycle',
                message: 'Every node is referenced by another (a cycle) — there is no entry point to draw from.',
                ids: []
            });
        }
        return { rootId, warnings };
    }

    // Reachability: the layout only places nodes reachable from the root.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const reached = new Set<number>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
        const cur = byId.get(queue.shift()!)!;
        for (const target of cur.nextId) {
            if (ids.has(target) && !reached.has(target)) {
                reached.add(target);
                queue.push(target);
            }
        }
    }
    const unreachable = nodes.filter((n) => !reached.has(n.id)).map((n) => n.id);
    if (unreachable.length > 0) {
        warnings.push({
            code: 'unreachable',
            message: `${unreachable.length} node(s) are not reachable from the root and are not drawn: ${unreachable.join(', ')}.`,
            ids: unreachable
        });
    }

    return { rootId, warnings };
}

interface Placed {
    node: BranchNode;
    cell: Cell;
    origins: Array<{ id: number; split: [number, number] }>;
}

/**
 * Layered ("Sugiyama-style") layout. Replaces the original BFS + forward-push:
 *  1. Cycle-break: a DFS from the root classifies each edge as forward or a
 *     BACK edge (one pointing to an ancestor still on the DFS stack).
 *  2. Layer assignment: longest path over the forward DAG gives each node its
 *     column. A loop no longer shoves the whole downstream subtree right to
 *     keep arrows forward — the layers stay compact and the loop is simply
 *     drawn as a backward connector (computeConnector routes it clear of the
 *     nodes between). Row = the category's rank, as before.
 *  3. Split routing (unchanged): each connector picks its horizontal hand-off.
 * Only nodes reachable from the root are placed; the rest are diagnose()'d.
 * Same contract as the original: siblings share a column, so distinct
 * categories must separate them into rows or they overlap.
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

    // 1. Cycle-break: iterative DFS (safe on deep graphs). An edge to a node
    //    still on the stack is a back-edge; everything reached is `reachable`.
    const backEdge = new Set<string>();
    const reachable = new Set<number>([rootId]);
    const visited = new Set<number>([rootId]);
    const onStack = new Set<number>([rootId]);
    const dfs: Array<[number, number]> = [[rootId, 0]]; // [nodeId, next child index]
    while (dfs.length > 0) {
        const frame = dfs[dfs.length - 1];
        const kids = nodes.get(frame[0])!.nextId;
        if (frame[1] >= kids.length) {
            onStack.delete(frame[0]);
            dfs.pop();
            continue;
        }
        const child = kids[frame[1]++];
        if (!nodes.has(child)) {
            continue; // dangling edge — ignored
        }
        if (onStack.has(child)) {
            backEdge.add(`${frame[0]}-${child}`);
        } else if (!visited.has(child)) {
            visited.add(child);
            reachable.add(child);
            onStack.add(child);
            dfs.push([child, 0]);
        }
    }

    // 2. Longest-path layer assignment over the forward (non-back) edges.
    const forwardKids = (id: number): number[] =>
        nodes.get(id)!.nextId.filter((t) => reachable.has(t) && !backEdge.has(`${id}-${t}`));
    const indeg = new Map<number, number>();
    reachable.forEach((id) => indeg.set(id, 0));
    reachable.forEach((id) => forwardKids(id).forEach((t) => indeg.set(t, indeg.get(t)! + 1)));
    const layer = new Map<number, number>();
    const ready: number[] = [];
    reachable.forEach((id) => { if (indeg.get(id) === 0) { layer.set(id, 0); ready.push(id); } });
    while (ready.length > 0) {
        const u = ready.shift()!;
        for (const t of forwardKids(u)) {
            layer.set(t, Math.max(layer.get(t) ?? 0, layer.get(u)! + 1));
            indeg.set(t, indeg.get(t)! - 1);
            if (indeg.get(t) === 0) {
                ready.push(t);
            }
        }
    }

    // 3. Place nodes into (layer, row) cells; record every edge on its target.
    const placed = new Map<number, Placed>();
    const levels: Array<Array<number | undefined>> = categories.map(() => []);
    let maxX = 0;
    reachable.forEach((id) => {
        const node = nodes.get(id)!;
        const cell: Cell = { x: layer.get(id) ?? 0, y: rowOf[node.category] };
        maxX = Math.max(maxX, cell.x);
        levels[cell.y][cell.x] = id;
        placed.set(id, { node, cell, origins: [] });
    });
    reachable.forEach((id) => {
        for (const t of nodes.get(id)!.nextId) {
            if (reachable.has(t)) {
                placed.get(t)!.origins.push({ id, split: [0, 0] });
            }
        }
    });

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

/** A positioned SVG connector: box in px + path segments in box-local coords. */
export interface ConnectorGeometry {
    left: number;
    top: number;
    width: number;
    height: number;
    /** One `d` string per segment (line/curve), already box-local. */
    segments: string[];
}

const CONNECTOR_PADDING = 10;

/**
 * Geometry for one connector, mirroring the original five-segment routing
 * (horizontal run → rounded corner → cross run → rounded corner → horizontal
 * run) but generalized so it is CORRECT in every direction and orientation:
 *
 *  - It works in a flow/cross frame (flow = tree depth, cross = category) and
 *    maps to screen at the end, so `vertical` transposes cleanly.
 *  - The bounding box uses min/max, so a BACKWARD edge (origin in a later
 *    column than its target — e.g. a rework loop) never yields a negative
 *    width. The original's split math only handled forward edges, so such
 *    edges rendered as a stray diagonal; here a backward edge is re-routed
 *    through the column midpoint.
 *  - `trimTarget` pulls the target end back by that many px (for arrowheads,
 *    so the tip lands on the disc edge instead of hidden under the disc).
 *
 * `fromSplit`/`toSplit` are pixel offsets from the origin along the flow axis
 * (the layout's split columns × spacing), same as before.
 */
export function computeConnector(
    from: { x: number; y: number },
    to: { x: number; y: number },
    fromSplit: number,
    toSplit: number,
    curveSize: number,
    vertical: boolean,
    trimTarget: number
): ConnectorGeometry {
    // Flow axis carries tree depth; cross axis carries category.
    const fromF = vertical ? from.y : from.x;
    const fromC = vertical ? from.x : from.y;
    const toF = vertical ? to.y : to.x;
    const toC = vertical ? to.x : to.y;

    // Backward edge: the origin sits past the target along the flow axis, where
    // the layout's split is meaningless. Run along the origin's row and rise
    // CLOSE TO THE TARGET rather than at the midpoint — the midpoint usually
    // lands on an intermediate node (e.g. a rework loop crossing the QA node),
    // whereas rising just past the target clears whatever sits between them.
    let outSplit = fromSplit;
    let inSplit = toSplit;
    if (toF < fromF) {
        const nearTarget = (toF - fromF) * 0.85;
        outSplit = nearTarget;
        inSplit = nearTarget;
    }

    const cs = fromC === toC ? 0 : curveSize;
    const dirC = fromC < toC ? 1 : -1;
    const hOut = fromF + outSplit; // first corner (leaves the origin row)
    const hIn = fromF + inSplit;   // second corner (reaches the target row)
    const dirOut = Math.sign(hOut - fromF) || 1;
    const dirIn = Math.sign(toF - hIn) || 1;

    // Trim the final (flow-axis) segment so an arrow tip clears the disc.
    const lastLen = Math.abs(toF - (hIn + dirIn * cs));
    const trim = Math.min(Math.max(0, trimTarget), Math.max(0, lastLen - 1));
    const lastDir = Math.sign(toF - (hIn + dirIn * cs)) || dirIn;
    const endF = toF - lastDir * trim;

    // Points in flow/cross space.
    const p = [
        { f: fromF, c: fromC },
        { f: hOut - dirOut * cs, c: fromC },
        { f: hOut, c: fromC + dirC * cs },
        { f: hIn, c: toC - dirC * cs },
        { f: hIn + dirIn * cs, c: toC },
        { f: endF, c: toC }
    ];

    const fs = p.map((q) => q.f);
    const csv = p.map((q) => q.c);
    const fMin = Math.min(...fs);
    const fMax = Math.max(...fs);
    const cMin = Math.min(...csv);
    const cMax = Math.max(...csv);
    const margin = CONNECTOR_PADDING / 2;

    // Screen box: flow maps to the x axis (horizontal) or y axis (vertical).
    const left = (vertical ? cMin : fMin) - margin;
    const top = (vertical ? fMin : cMin) - margin;
    const width = (vertical ? cMax - cMin : fMax - fMin) + CONNECTOR_PADDING;
    const height = (vertical ? fMax - fMin : cMax - cMin) + CONNECTOR_PADDING;

    // Box-local coordinate for a flow/cross point, orientation-aware.
    const lf = fMin - margin;
    const lc = cMin - margin;
    const m = (q: { f: number; c: number }): string =>
        vertical ? `${q.c - lc} ${q.f - lf}` : `${q.f - lf} ${q.c - lc}`;

    // Rounded-corner elbows, expressed in flow/cross so they transpose right.
    const e2 = { f: p[2].f, c: p[1].c };
    const e4 = { f: p[3].f, c: p[4].c };

    const segments = [
        `M ${m(p[0])} L ${m(p[1])}`,
        `M ${m(p[1])} C ${m(p[1])} ${m(e2)} ${m(p[2])}`,
        `M ${m(p[2])} L ${m(p[3])}`,
        `M ${m(p[3])} C ${m(p[3])} ${m(e4)} ${m(p[4])}`,
        `M ${m(p[4])} L ${m(p[5])}`
    ];

    return { left, top, width, height, segments };
}
