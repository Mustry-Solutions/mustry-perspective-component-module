import { test, expect, openRoute } from './helpers';

// Branching Diagram: layout + selection against the seeded demo flow (which
// includes a rework loop exercising the duplicate-forwarding layout).

test.describe('Branching Diagram', () => {

    test('renders the seeded flow with nodes, connectors and outputs', async ({ page }) => {
        const root = await openRoute(page, '/branching', '.mustry-branching');
        await expect(root.locator('.mustry-branch-node')).toHaveCount(6);
        // Edges: 1→2, 2→3, 2→5, 3→4, 4→6, 4→5, 5→3 = 7 connectors.
        await expect(root.locator('.mustry-branch-path')).toHaveCount(7);
        await expect(page.getByText(/output\.count: 6/)).toBeVisible();
        await expect(page.getByText(/output\.hasRoot: true/i)).toBeVisible();
    });

    test('clicking a node selects it (two-way) and fires onNodeClick', async ({ page }) => {
        const root = await openRoute(page, '/branching', '.mustry-branching');
        await root.locator('.mustry-branch-node').filter({ hasText: 'QA' }).click();
        await expect(root.locator('.mustry-branch-node--selected')).toHaveCount(1);
        await expect(root.locator('.mustry-branch-node--selected')).toContainText('QA');
        await expect(page.getByText(/state\.selectedNode: 4/)).toBeVisible();
        await expect(page.getByText(/onNodeClick id=4 name="QA" category=0/)).toBeVisible();
        // Selecting another node moves the highlight.
        await root.locator('.mustry-branch-node').filter({ hasText: 'Ship' }).click();
        await expect(root.locator('.mustry-branch-node--selected')).toContainText('Ship');
    });

    test('the info card shows on hover', async ({ page }) => {
        const root = await openRoute(page, '/branching', '.mustry-branching');
        const card = root.locator('.mustry-branch-card').first();
        await expect(card).toBeHidden();
        await root.locator('.mustry-branch-node').filter({ hasText: 'Intake' }).hover();
        await expect(root.locator('.mustry-branch-card').filter({ hasText: 'Raw material arrives' })).toBeVisible();
    });
});
