import { test, expect, openRoute } from './helpers';

// The DashboardDemo view: a 12-col grid tiling four embedded views.

test('dashboard: renders all tiles on the grid', async ({ page }) => {
    await openRoute(page, '/dashboard', '.mustry-dash');
    await expect(page.locator('.mustry-dash-tile')).toHaveCount(4);
    // Titles show.
    await expect(page.locator('.mustry-dash-tile-title', { hasText: 'Plant floor' })).toBeVisible();
    await expect(page.locator('.mustry-dash-tile-title', { hasText: 'Work orders' })).toBeVisible();
});

test('dashboard: embedded views actually render inside their tiles', async ({ page }) => {
    await openRoute(page, '/dashboard', '.mustry-dash');
    // The synoptic tile embeds SynopticDemo (the plant-floor view).
    const synoptic = page.locator('.mustry-dash-tile[data-tile="synoptic"] .mustry-dash-tile-body');
    await expect(synoptic.getByText('PLANT FLOOR', { exact: false })).toBeVisible({ timeout: 20_000 });
    // The grid tile embeds this module's data grid — its rows render.
    const gridTile = page.locator('.mustry-dash-tile[data-tile="grid"]');
    await expect(gridTile.locator('.mustry-datagrid')).toBeVisible();
});

test('dashboard: tiles are placed per their grid geometry', async ({ page }) => {
    await openRoute(page, '/dashboard', '.mustry-dash');
    const synoptic = page.locator('.mustry-dash-tile[data-tile="synoptic"]');
    const calendar = page.locator('.mustry-dash-tile[data-tile="calendar"]');
    // synoptic (x0 w8) sits left of calendar (x8 w4) on the same row.
    const sBox = (await synoptic.boundingBox())!;
    const cBox = (await calendar.boundingBox())!;
    expect(sBox.x).toBeLessThan(cBox.x);
    expect(Math.abs(sBox.y - cBox.y)).toBeLessThan(4);
    expect(sBox.width).toBeGreaterThan(cBox.width);   // 8 cols vs 4
});

test('dashboard: dragging a tile header moves it and fires onLayoutChange', async ({ page }) => {
    await openRoute(page, '/dashboard', '.mustry-dash');
    const tile = page.locator('.mustry-dash-tile[data-tile="grid"]');
    const before = (await tile.boundingBox())!;
    const head = page.locator('.mustry-dash-tile[data-tile="grid"] .mustry-dash-tile-head');

    const hb = (await head.boundingBox())!;
    await page.mouse.move(hb.x + 30, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 30 - 100, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.move(hb.x + 30 - 200, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect.poll(async () => (await tile.boundingBox())!.x).toBeLessThan(before.x - 40);
    await expect(page.getByText(/onLayoutChange: \d+ tiles/)).toBeVisible();
});

test('dashboard: the corner handle resizes a tile', async ({ page }) => {
    await openRoute(page, '/dashboard', '.mustry-dash');
    const tile = page.locator('.mustry-dash-tile[data-tile="calendar"]');
    const before = (await tile.boundingBox())!;
    const handle = page.locator('.mustry-dash-tile[data-tile="calendar"] .mustry-dash-resize');

    const gb = (await handle.boundingBox())!;
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + 120, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => (await tile.boundingBox())!.height).toBeGreaterThan(before.height + 40);
});
