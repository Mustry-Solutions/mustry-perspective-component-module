import { Page } from '@playwright/test';
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

/**
 * Count the grid's onCellEdit events in the client, where they are fired. The
 * DataGrid instance is found through React 16's fiber on its scroll container,
 * and componentEvents.fireComponentEvent is wrapped where it is defined (own
 * property or prototype), so the count survives re-renders. Counting on the
 * gateway instead would race: two script runs could both read the old counter.
 */
async function spyCellEdits(page: Page): Promise<void> {
    const found = await page.locator('.mustry-dg-scroll').first().evaluate((el) => {
        const key = Object.keys(el).find((k) => k.startsWith('__reactInternalInstance$'));
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
