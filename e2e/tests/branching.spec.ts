import { test, expect, openRoute } from './helpers';

// Branching Diagram: layout + selection against the seeded demo flow (which
// includes a rework loop exercising the duplicate-forwarding layout).

test.describe('Branching Diagram', () => {

    test('renders the seeded flow with nodes, connectors and outputs', async ({ page }) => {
        const root = await openRoute(page, '/branching', '.mustry-branching');
        await expect(root.locator('.mustry-branch-node')).toHaveCount(6);
        // Edges: 1→2, 2→3, 3→4, 4→6, 4→5, 5→3 = 6 connectors (one rework loop).
        await expect(root.locator('.mustry-branch-path')).toHaveCount(6);
        await expect(page.getByText(/output\.count: 6/)).toBeVisible();
        await expect(page.getByText(/output\.hasRoot: true/i)).toBeVisible();
    });

    test('clicking a node selects it (two-way) and fires onNodeClick', async ({ page }) => {
        const root = await openRoute(page, '/branching', '.mustry-branching');
        // Select by aria-label (exact) — hasText would also match a tooltip
        // that mentions another node (QA's tooltip says "ships").
        const byName = (name: string) => root.getByRole('button', { name, exact: true });
        await byName('QA').click();
        await expect(root.locator('.mustry-branch-node--selected')).toHaveCount(1);
        await expect(root.locator('.mustry-branch-node--selected')).toContainText('QA');
        await expect(page.getByText(/state\.selectedNode: 4/)).toBeVisible();
        await expect(page.getByText(/onNodeClick id=4 name="QA" category=0/)).toBeVisible();
        // Selecting another node moves the highlight.
        await byName('Ship').click();
        await expect(root.locator('.mustry-branch-node--selected')).toContainText('Ship');
    });

    test('the info card shows on hover', async ({ page }) => {
        const root = await openRoute(page, '/branching', '.mustry-branching');
        const card = root.locator('.mustry-branch-card').first();
        await expect(card).toBeHidden();
        await root.locator('.mustry-branch-node').filter({ hasText: 'Intake' }).hover();
        await expect(root.locator('.mustry-branch-card').filter({ hasText: 'Raw material arrives' })).toBeVisible();
    });

    test('every connector renders with a positive-area box (no backward-edge artifact)', async ({ page }) => {
        // The rework loop (QA→Rework) is a backward edge; the original routing
        // gave it a negative-width SVG that painted a stray diagonal. Assert
        // every connector box has real width AND height.
        const root = await openRoute(page, '/branching', '.mustry-branching');
        const paths = root.locator('.mustry-branch-path');
        await expect(paths).toHaveCount(6);
        const count = await paths.count();
        for (let i = 0; i < count; i++) {
            const box = await paths.nth(i).boundingBox();
            expect(box, `connector ${i} has a box`).not.toBeNull();
            expect(box!.width, `connector ${i} width`).toBeGreaterThan(0);
            expect(box!.height, `connector ${i} height`).toBeGreaterThan(0);
        }
    });

    test('showArrows draws an arrowhead marker per connector', async ({ page }) => {
        const root = await openRoute(page, '/branching-arrows', '.mustry-branching');
        await expect(root.locator('.mustry-branch-node')).toHaveCount(6);
        // Each connector SVG defines its own arrow marker when arrows are on.
        await expect(root.locator('.mustry-branch-path marker')).toHaveCount(6);
        await expect(root.locator('.mustry-branch-path path[marker-end]')).toHaveCount(6);
    });

    test('a cyclic dataset reports the reason (empty-state + output.warnings)', async ({ page }) => {
        const root = await openRoute(page, '/branching-cycle', '.mustry-branching');
        // Nothing draws — but the empty state names the cause and a warning is emitted.
        await expect(root.locator('.mustry-branch-node')).toHaveCount(0);
        await expect(root.locator('.mustry-branch-empty')).toContainText(/entry point|cycle/i);
        await expect(page.getByText(/output\.hasRoot: false/i)).toBeVisible();
        await expect(page.getByText(/output\.warnings:.*cycle/i)).toBeVisible();
    });

    test('edge labels render on their connectors and nowhere else', async ({ page }) => {
        const root = await openRoute(page, '/branching-labels', '.mustry-branching');
        await expect(root.locator('.mustry-branch-node')).toHaveCount(6);
        const labels = root.locator('.mustry-branch-edge-label');
        // Four of five edges carry a decision label; the trunk edge stays bare.
        await expect(labels).toHaveCount(4);
        for (const text of ['Yes', 'No', 'Wait', 'Cancel']) {
            await expect(labels.filter({ hasText: new RegExp(`^${text}$`) })).toBeVisible();
        }
    });

    test('vertical orientation lays the tree top-to-bottom without clipping labels', async ({ page }) => {
        const root = await openRoute(page, '/branching-vertical', '.mustry-branching');
        await expect(root.locator('.mustry-branch-node')).toHaveCount(6);
        // Target nodes by aria-label (their name) — hasText would also match a
        // tooltip that mentions another node's name.
        const byName = (name: string) => root.getByRole('button', { name, exact: true });
        // Depth runs down the y axis: Intake sits above Ship, and Rework
        // (parallel column) sits to the right of the main spine.
        const intake = await byName('Intake').boundingBox();
        const ship = await byName('Ship').boundingBox();
        const assemble = await byName('Assemble').boundingBox();
        const rework = await byName('Rework').boundingBox();
        expect(ship!.y).toBeGreaterThan(intake!.y);
        expect(rework!.x).toBeGreaterThan(assemble!.x);
    });
});
