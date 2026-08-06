import {
    columnOffset, computeConnector, diagnose, findRoot, layoutTree, normalizeBranchNode, BranchNode
} from '../branching/branchingLogic';

/** Extract every numeric coordinate from an SVG path `d` string. */
function coords(d: string): number[] {
    return (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
}

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
    it('a re-referenced node takes its LONGEST forward path as its column', () => {
        // 1 → 2, 1 → 3, 3 → 2: 3→2 is a forward cross-edge (not a loop), so 2's
        // longest path is 1→3→2 and it lands at column 2 (past its second origin).
        const layout = layoutTree([
            n({ id: 1, category: 0, nextId: [2, 3] }),
            n({ id: 2, category: 0, nextId: [] }),
            n({ id: 3, category: 1, nextId: [2] })
        ]);
        const c = cells(layout);
        expect(c[3]).toEqual([1, 1]);
        expect(c[2][0]).toBe(2);
        expect(layout.maxX).toBe(2);
        // Both edges into 2 exist.
        expect(layout.connections.filter((x) => x.toId === 2).map((x) => x.fromId).sort()).toEqual([1, 3]);
    });

    it('the longest path carries the whole downstream subtree', () => {
        const layout = layoutTree([
            n({ id: 1, category: 0, nextId: [2, 3] }),
            n({ id: 2, category: 0, nextId: [4] }),
            n({ id: 4, category: 0 }),
            n({ id: 3, category: 1, nextId: [2] })
        ]);
        const c = cells(layout);
        expect(c[2][0]).toBe(2);
        expect(c[4][0]).toBe(3); // child sits one column past its parent
    });

    it('a true LOOP (back-edge) stays compact — the target is NOT pushed', () => {
        // 1→2→3→4 with 4→2 a loop (2 is an ancestor of 4). The old algorithm
        // shoved 2,3,4 right to keep arrows forward (maxX 6); longest-path keeps
        // them at their forward layers (maxX 3) and draws 4→2 as a back-edge.
        const layout = layoutTree([
            n({ id: 1, category: 0, nextId: [2] }),
            n({ id: 2, category: 0, nextId: [3] }),
            n({ id: 3, category: 0, nextId: [4] }),
            n({ id: 4, category: 1, nextId: [2] })
        ]);
        const c = cells(layout);
        expect(c[1][0]).toBe(0);
        expect(c[2][0]).toBe(1); // NOT pushed by the loop
        expect(c[3][0]).toBe(2);
        expect(c[4][0]).toBe(3);
        expect(layout.maxX).toBe(3);
        expect(layout.connections.some((x) => x.fromId === 4 && x.toId === 2)).toBe(true);
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

describe('diagnose', () => {
    const codes = (nodes: BranchNode[]) => diagnose(nodes).warnings.map((w) => w.code);

    it('a healthy tree has a root and no warnings', () => {
        const d = diagnose([n({ id: 1, category: 0, nextId: [2] }), n({ id: 2, category: 0 })]);
        expect(d.rootId).toBe(1);
        expect(d.warnings).toHaveLength(0);
    });

    it('flags a cycle (no entry point) with no root', () => {
        const d = diagnose([
            n({ id: 1, category: 0, nextId: [2] }),
            n({ id: 2, category: 0, nextId: [1] })
        ]);
        expect(d.rootId).toBeNull();
        expect(d.warnings.map((w) => w.code)).toContain('cycle');
    });

    it('flags data with no edges at all', () => {
        expect(codes([n({ id: 1, category: 0 }), n({ id: 2, category: 0 })])).toContain('no-edges');
    });

    it('flags edges pointing at unknown ids', () => {
        const d = diagnose([n({ id: 1, category: 0, nextId: [2, 99] }), n({ id: 2, category: 0 })]);
        expect(d.warnings.find((w) => w.code === 'dangling-edge')!.ids).toContain(99);
    });

    it('flags nodes unreachable from the root (which the layout drops)', () => {
        // 1→2 is the tree; 3→4 is a detached pair the BFS never reaches.
        const d = diagnose([
            n({ id: 1, category: 0, nextId: [2] }),
            n({ id: 2, category: 0 }),
            n({ id: 3, category: 0, nextId: [4] }),
            n({ id: 4, category: 0 })
        ]);
        const w = d.warnings.find((x) => x.code === 'unreachable')!;
        expect(w.ids.sort()).toEqual([3, 4]);
    });
});

describe('computeConnector', () => {
    const box = (g: ReturnType<typeof computeConnector>) => ({ w: g.width, h: g.height });

    it('a forward edge produces a positive box and five segments', () => {
        const g = computeConnector({ x: 0, y: 0 }, { x: 120, y: 50 }, 60, 60, 10, false, 0);
        expect(g.width).toBeGreaterThan(0);
        expect(g.height).toBeGreaterThan(0);
        expect(g.segments).toHaveLength(5);
    });

    it('a BACKWARD edge (origin past target) never yields a negative box', () => {
        // The original bug: to.x < from.x made width = to.x - from.x + pad < 0.
        const g = computeConnector({ x: 120, y: 0 }, { x: 0, y: 50 }, -180, -180, 10, false, 0);
        expect(g.width).toBeGreaterThan(0);
        expect(g.height).toBeGreaterThan(0);
        // Every drawn coordinate stays inside the box (no stray off-canvas run).
        for (const d of g.segments) {
            for (const v of coords(d)) {
                expect(v).toBeGreaterThanOrEqual(-0.01);
            }
        }
    });

    it('a backward edge rises CLOSE TO THE TARGET, not at the midpoint', () => {
        // Regression for the rework-loop crossing: the cross-over run (segment
        // index 2) must sit near the target, so it clears nodes in the middle.
        const g = computeConnector({ x: 120, y: 0 }, { x: 0, y: 50 }, -60, -60, 10, false, 0);
        const [x1, , x2] = coords(g.segments[2]); // the vertical cross-run
        expect(x1).toBeCloseTo(x2, 5);            // it IS vertical (same x)
        expect(x1).toBeLessThan(g.width / 3);     // in the target third (target is at left)
    });

    it('vertical orientation transposes the box of a forward edge', () => {
        const h = computeConnector({ x: 0, y: 0 }, { x: 120, y: 50 }, 60, 60, 10, false, 0);
        const v = computeConnector({ x: 0, y: 0 }, { x: 50, y: 120 }, 60, 60, 10, true, 0);
        // Flow (the longer 120 run) lands on x when horizontal, on y when vertical.
        expect(box(h).w).toBeGreaterThan(box(h).h);
        expect(box(v).h).toBeGreaterThan(box(v).w);
    });

    it('trimTarget shortens the final run so an arrow clears the disc', () => {
        const full = computeConnector({ x: 0, y: 0 }, { x: 200, y: 0 }, 100, 100, 0, false, 0);
        const trimmed = computeConnector({ x: 0, y: 0 }, { x: 200, y: 0 }, 100, 100, 0, false, 12);
        expect(trimmed.width).toBeLessThan(full.width);
    });
});
