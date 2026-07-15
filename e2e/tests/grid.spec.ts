import { test, expect, openRoute } from './helpers';

test('grid: renders rows, headers and the aggregate footer', async ({ page }) => {
    await openRoute(page, '/grid', '.mustry-datagrid');
    await expect(page.getByText('WO-10000', { exact: true })).toBeVisible();
    // Headers render uppercase via CSS text-transform; the accessible name is "Order".
    await expect(page.getByRole('button', { name: 'Order', exact: true })).toBeVisible();
    await expect(page.locator('.dg-foot')).toBeVisible();
});

test('grid: quick filter narrows the view', async ({ page }) => {
    await openRoute(page, '/grid', '.mustry-datagrid');
    await expect(page.getByText('Widget A').first()).toBeVisible();
    await page.getByPlaceholder('Search').fill('Gasket');
    await expect(page.getByText('Gasket 12mm').first()).toBeVisible();
    await expect(page.getByText('Widget A')).toHaveCount(0);
});

// The 50k-row stress fixture exercises virtualization: the view generates the
// dataset client-side on load, so give it a longer runway.
test('grid stress: 50k rows virtualize', async ({ page }) => {
    test.setTimeout(120_000);
    await openRoute(page, '/grid-stress', '.mustry-datagrid');
    // The stress generator numbers rows from WO-100000 (see GridStress/view.json).
    await expect(page.getByText('WO-100000', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.dg-foot')).toBeVisible();
});
