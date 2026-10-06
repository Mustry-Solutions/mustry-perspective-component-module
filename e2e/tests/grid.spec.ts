import { test, expect, openRoute } from './helpers';

test('grid: renders rows, headers and the aggregate footer', async ({ page }) => {
    await openRoute(page, '/grid', '.mustry-datagrid');
    await expect(page.getByText('WO-10000', { exact: true })).toBeVisible();
    // Headers render uppercase via CSS text-transform; the accessible name is "Order".
    await expect(page.getByRole('button', { name: 'Order', exact: true })).toBeVisible();
    await expect(page.locator('.mustry-dg-foot')).toBeVisible();
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
    await expect(page.locator('.mustry-dg-foot')).toBeVisible();
});

// #127: dragging Qty onto the pinned Order column makes the configured order
// [qty, wo, ...] while the grid still draws Order first. Editing the drawn Qty
// cell must edit qty, not the (read-only) order number next to it.
test('grid: editing a cell after a reorder past a pinned column edits that column', async ({ page }) => {
    await openRoute(page, '/grid', '.mustry-datagrid');
    const qtyHead = page.getByRole('button', { name: 'Qty', exact: true });
    const orderHead = page.getByRole('button', { name: 'Order', exact: true });
    const from = await qtyHead.boundingBox();
    const to = await orderHead.boundingBox();
    if (!from || !to) throw new Error('grid headers not laid out');
    await page.mouse.move(from.x + 10, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x - 20, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    const heads = page.locator('.mustry-dg-head-cell');
    await expect(heads.nth(0)).toHaveText('Order');
    await expect(heads.nth(1)).toHaveText('Qty');

    const firstRow = page.locator('.mustry-dg-row').first();
    const qtyCell = firstRow.locator('.mustry-dg-cell').nth(1);
    const shown = (await qtyCell.innerText()).trim();
    await qtyCell.dblclick();
    const editor = qtyCell.locator('.mustry-dg-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue(shown);
    await editor.fill('123');
    await editor.press('Enter');
    await expect(qtyCell).toHaveText('123');
    await expect(qtyCell).toHaveClass(/mustry-dg-cell--pending/);
    await expect(firstRow.locator('.mustry-dg-cell').nth(0)).toHaveText('WO-10000');
});
