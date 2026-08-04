import {
    columnOffset, findRoot, layoutTree, normalizeBranchNode, BranchNode
} from '../branching/branchingLogic';

const n = (raw: any): BranchNode => normalizeBranchNode(raw);

/** id → cell lookup for readable assertions. */
function cells(layout: ReturnType<typeof layoutTree>): { [id: number]: [number, number] } {
    const out: { [id: number]: [number, number] } = {};
    layout.nodes.forEach(({ node, cell }) => { out[node.id] = [cell.x, cell.y]; });
    return out;
}

describe('normalizeBranchNode', () => {
    it('defaults everything defensively', () => {
        const b = n({ id: 3 });
        expect(b).toMatchObject({ id: 3, name: '', category: 0, nextId: [], fill: true, icon: null, tooltip: '' });
    });
    it('keeps icon only when a path exists and drops NaN edges', () => {
        expect(n({ id: 1, icon: { color: 'red' } }).icon).toBeNull();
        expect(n({ id: 1, icon: { path: 'material/check' } }).icon).toEqual({ path: 'material/check', color: '' });
        expect(n({ id: 1, nextId: [2, 'x', 3] }).nextId).toEqual([2, 3]);
    });
});

describe('findRoot', () => {
    it('picks the unreferenced node with outgoing edges', () => {
        const nodes = [n({ id: 1, nextId: [2] }), n({ id: 2, nextId: [3] }), n({ id: 3 })];
        expect(findRoot(nodes)).toBe(1);
    });
    it('returns null for empty, all-leaf, or fully cyclic data', () => {
        expect(findRoot([])).toBeNull();
        expect(findRoot([n({ id: 1 }), n({ id: 2 })])).toBeNull();
        expect(findRoot([n({ id: 1, nextId: [2] }), n({ id: 2, nextId: [1] })])).toBeNull();
    });
});

describe('layoutTree — BFS placement', () => {
    // 1 → 2 → 4, 1 → 3; categories: 1,2 in cat 0 (row 0), 3 in cat 5 (row 1), 4 in cat 0.
    const tree = [
        n({ id: 1, category: 0, nextId: [2, 3] }),
        n({ id: 2, category: 0, nextId: [4] }),
        n({ id: 3, category: 5 }),
        n({ id: 4, category: 0 })
    ];
    const layout = layoutTree(tree);

    it('one column per BFS depth, row = category rank (not raw value)', () => {
        expect(cells(layout)).toEqual({ 1: [0, 0], 2: [1, 0], 3: [1, 1], 4: [2, 0] });
    });
    it('tracks maxX and emits one connection per edge', () => {
        expect(layout.maxX).toBe(2);
        expect(layout.connections.map((c) => `${c.fromId}>${c.toId}`).sort())
            .toEqual(['1>2', '1>3', '2>4']);
    });
    it('a clear corridor routes at the midpoint (equal split halves)', () => {
        const c = layout.connections.find((x) => x.fromId === 1 && x.toId === 3)!;
        expect(c.split[0]).toBe(c.split[1]);
    });
});

describe('layoutTree — duplicate forwarding', () => {
    it('pushes a re-referenced node (and its subtree) right of its late origin', () => {
        // 1 → 2 → 3, and 3 → 2 would be a cycle; instead: 1 → 2, 1 → 3, 3 → 2:
        // BFS places 2 at x=1; the later edge 3→2 (3 also at x=1) must push 2 to x=2.
        const layout = layoutTree([
            n({ id: 1, category: 0, nextId: [2, 3] }),
            n({ id: 2, category: 0, nextId: [] }),
            n({ id: 3, category: 1, nextId: [2] })
        ]);
        const c = cells(layout);
        expect(c[3]).toEqual([1, 1]);
        expect(c[2][0]).toBe(2); // forwarded past its second origin
        expect(layout.maxX).toBe(2);
        // Both edges into 2 exist.
        expect(layout.connections.filter((x) => x.toId === 2).map((x) => x.fromId).sort()).toEqual([1, 3]);
    });

    it('forwarding carries the whole downstream subtree', () => {
        const layout = layoutTree([
            n({ id: 1, category: 0, nextId: [2, 3] }),
            n({ id: 2, category: 0, nextId: [4] }),
            n({ id: 4, category: 0 }),
            n({ id: 3, category: 1, nextId: [2] })
        ]);
        const c = cells(layout);
        expect(c[2][0]).toBe(2);
        expect(c[4][0]).toBe(3); // child moved with its parent
    });
});

describe('layoutTree — resilience', () => {
    it('empty data yields an empty layout', () => {
        expect(layoutTree([])).toEqual({ nodes: [], connections: [], maxX: 0, minY: 0 });
    });
    it('dangling nextId edges are dropped, not fatal', () => {
        const layout = layoutTree([n({ id: 1, category: 0, nextId: [2, 99] }), n({ id: 2, category: 0 })]);
        expect(layout.nodes).toHaveLength(2);
        expect(layout.connections).toHaveLength(1);
    });
});

describe('columnOffset', () => {
    it('spreads columns across the width but never below the minimum', () => {
        expect(columnOffset(500, 4, 20, 1, 50)).toBe((500 - 22) / 4);
        expect(columnOffset(100, 4, 20, 1, 50)).toBe(50);
        expect(columnOffset(500, 0, 20, 1, 50)).toBe(50);
    });
});
