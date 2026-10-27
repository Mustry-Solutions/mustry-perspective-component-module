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

/**
 * Count the grid's onCellEdit events in the client, where they are fired. The
 * DataGrid instance is found through React's fiber on its scroll container,
 * and componentEvents.fireComponentEvent is wrapped where it is defined (own
 * property or prototype), so the count survives re-renders. Counting on the
 * gateway instead would race: two script runs could both read the old counter.
 */
async function spyCellEdits(page: Page): Promise<void> {
    const found = await page.locator('.mustry-dg-scroll').first().evaluate((el) => {
        // React 17+ (Perspective 8.3 ships 18) names the key __reactFiber$; 16 used __reactInternalInstance$.
        const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        let fiber = key ? (el as any)[key] : null;
        while (fiber && !(fiber.stateNode && fiber.stateNode.props && fiber.stateNode.props.componentEvents)) {
            fiber = fiber.return;
        }
        if (!fiber) {
            return false;
        }
        const events = fiber.stateNode.props.componentEvents;
        const host = Object.prototype.hasOwnProperty.call(events, 'fireComponentEvent')
            ? events : Object.getPrototypeOf(events);
        const original = host.fireComponentEvent;
        const w = window as unknown as { cellEdits: unknown[] };
        w.cellEdits = [];
        host.fireComponentEvent = function (this: unknown, name: string, payload: unknown, ...rest: unknown[]) {
            if (name === 'onCellEdit') {
                w.cellEdits.push(payload);
            }
            return original.call(this, name, payload, ...rest);
        };
        return true;
    });
    expect(found, 'the DataGrid instance behind .mustry-dg-scroll').toBe(true);
}

const cellEdits = (page: Page) => page.evaluate(() => (window as unknown as { cellEdits: unknown[] }).cellEdits);

test('grid: cell mode fires onCellEdit exactly once per committed edit', async ({ page }) => {
    // Regression: Enter/Tab committed, then handed focus back to the grid; the
    // editor's blur ran commitEdit again before React had applied editing:null,
    // so the author's write-back script ran twice per edit.
    await openRoute(page, '/grid-cell', '.mustry-datagrid');
    await expect(page.getByText('WO-20000', { exact: true })).toBeVisible();
    await spyCellEdits(page);
    const runs = page.getByText(/^onCellEdit runs: \d+$/);
    await expect(runs).toHaveText('onCellEdit runs: 0');
    const editor = page.locator('.mustry-dg-editor');
    const qtyCell = (wo: string) => page.locator('.mustry-dg-row', { hasText: wo })
        .locator('.mustry-dg-cell', { hasText: /^\d+$/ });

    // Enter
    await qtyCell('WO-20000').dblclick();
    await editor.fill('11');
    await editor.press('Enter');
    await expect(editor).toHaveCount(0);
    await expect(qtyCell('WO-20000')).toHaveText('11');
    await expect(runs).toHaveText('onCellEdit runs: 1');
    expect(await cellEdits(page)).toEqual([
        expect.objectContaining({ rowId: 'WO-20000', field: 'qty', oldValue: 10, newValue: 11 })
    ]);

    // Tab
    await qtyCell('WO-20001').dblclick();
    await editor.fill('21');
    await editor.press('Tab');
    await expect(editor).toHaveCount(0);
    await expect(runs).toHaveText('onCellEdit runs: 2');
    expect(await cellEdits(page)).toHaveLength(2);

    // Clicking away (blur alone) commits once too
    await qtyCell('WO-20002').dblclick();
    await editor.fill('31');
    await page.getByText(/^Data Grid CELL editing/).click();
    await expect(editor).toHaveCount(0);
    await expect(runs).toHaveText('onCellEdit runs: 3');
    expect(await cellEdits(page)).toHaveLength(3);

    // Escape reverts without an event
    await qtyCell('WO-20003').dblclick();
    await editor.fill('41');
    await editor.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(qtyCell('WO-20003')).toHaveText('40');

    // Nothing late: a second event would have fired synchronously with the first.
    await page.waitForTimeout(500);
    expect((await cellEdits(page)).map((e: any) => [e.rowId, e.newValue])).toEqual([
        ['WO-20000', 11], ['WO-20001', 21], ['WO-20002', 31]
    ]);
    await expect(runs).toHaveText('onCellEdit runs: 3');
});
