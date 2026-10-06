import { Page } from '@playwright/test';
import { test, expect, openRoute } from './helpers';

type Row = Record<string, unknown>;

// A binding refresh, simulated: read or write data.rows through the grid's own
// property store, where a binding update lands. The /grid demo never refreshes
// on its own, and Perspective has no public client API for this, so it walks
// React's internal fiber from the grid's root element to the component.
const GRID_STORE = `(() => {
    const el = document.querySelector('.mustry-datagrid');
    let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))];
    while (f && !(f.stateNode && f.stateNode.props && f.stateNode.props.store)) f = f.return;
    return f.stateNode.props;
})()`;

const gridRows = (page: Page): Promise<Row[]> =>
    page.evaluate(`JSON.parse(JSON.stringify(${GRID_STORE}.props.rows))`);

const rebindRows = (page: Page, rows: Row[]): Promise<void> =>
    page.evaluate(`${GRID_STORE}.store.props.write('data.rows', ${JSON.stringify(rows)})`);

const gridRow = (page: Page, wo: string) => page.locator('.mustry-dg-row', { hasText: wo });

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

// #128: rows were keyed by index, so a rebind that shifted the edited row
// remounted the editor's input and dropped the focus: typing and Enter went
// nowhere. Keyed by id, the input moves with its row.
test('grid: an open editor keeps its record and the focus when a rebind inserts a row above', async ({ page }) => {
    await openRoute(page, '/grid', '.mustry-datagrid');
    const qty = gridRow(page, 'WO-10003').locator('.mustry-dg-cell').nth(3);
    await qty.dblclick();
    const editor = qty.locator('.mustry-dg-editor');
    await expect(editor).toBeFocused();

    const rows = await gridRows(page);
    await rebindRows(page, [{ ...rows[0], wo: 'WO-09999' }, ...rows]);
    await expect(page.locator('.mustry-dg-row').first().locator('.mustry-dg-cell').first()).toHaveText('WO-09999');
    await expect(editor).toBeFocused();

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('123');
    await page.keyboard.press('Enter');
    await expect(qty).toHaveText('123');
    await expect(gridRow(page, 'WO-10002').locator('.mustry-dg-cell').nth(3)).not.toHaveText('123');
});

// #130: once another row shares the edited row's id, the id no longer says which
// record the edit is for. The editor closes instead of committing to the first.
test('grid: an open editor closes when a rebind makes its row id a duplicate', async ({ page }) => {
    await openRoute(page, '/grid', '.mustry-datagrid');
    await gridRow(page, 'WO-10005').locator('.mustry-dg-cell').nth(3).dblclick();
    await expect(page.locator('.mustry-dg-editor')).toHaveCount(1);

    const rows = await gridRows(page);
    await rebindRows(page, rows.map((r) => (r.wo === 'WO-10001' ? { ...r, wo: 'WO-10005' } : r)));
    await expect(page.locator('.mustry-dg-editor')).toHaveCount(0);
    await expect(page.locator('.mustry-dg-cell--pending')).toHaveCount(0);
});

// #130: a Shift-range over a duplicate id must not put that id in the selection.
test('grid: a shift-range selection leaves out rows with a duplicate id', async ({ page }) => {
    await openRoute(page, '/grid', '.mustry-datagrid');
    await expect(gridRow(page, 'WO-10002')).toBeVisible();   // the binding has delivered the rows
    const rows = await gridRows(page);
    await rebindRows(page, rows.map((r) => (r.wo === 'WO-10002' ? { ...r, wo: 'WO-10001' } : r)));
    await expect(gridRow(page, 'WO-10001')).toHaveCount(2);

    await gridRow(page, 'WO-10000').locator('.mustry-dg-cell').nth(1).click();
    await gridRow(page, 'WO-10004').locator('.mustry-dg-cell').nth(1).click({ modifiers: ['Shift'] });
    await expect(page.locator('.mustry-dg-selected-badge')).toHaveText('3 selected');
    await expect(page.locator('.mustry-dg-row--selected')).toHaveCount(3);
});
