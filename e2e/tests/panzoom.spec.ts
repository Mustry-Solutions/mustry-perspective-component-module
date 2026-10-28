import { test, expect, openRoute } from './helpers';

test('panzoom: embeds the synoptic and shows the zoom badge', async ({ page }) => {
    await openRoute(page, '/panzoom', '.mustry-panzoom');
    await expect(page.locator('.mustry-pz-zoom-badge')).toHaveText(/%$/);
    await expect(page.getByText('PLANT FLOOR — SYNOPTIC DEMO', { exact: false })).toBeVisible();
});

test('panzoom: embedded view stays interactive', async ({ page }) => {
    await openRoute(page, '/panzoom', '.mustry-panzoom');
    // The button lives INSIDE the embedded (scaled) view; the counter label
    // proves events reach the child session content through the transform.
    await page.getByText('Click me (interactivity proof)').click();
    await expect(page.getByText('Clicked 1x')).toBeVisible();
});

test('panzoom: scripted fly-to lands on the POI zoom', async ({ page }) => {
    await openRoute(page, '/panzoom', '.mustry-panzoom');
    await page.getByRole('button', { name: 'Fly to Pump 3' }).click();
    // The fly-to animation eases in log space and settles at 150%.
    await expect(page.locator('.mustry-pz-zoom-badge')).toHaveText('150%', { timeout: 10_000 });
});

test('panzoom: minimap previews the embedded view', async ({ page }) => {
    await openRoute(page, '/panzoom', '.mustry-panzoom');
    await page.getByRole('button', { name: 'Fly to Pump 3' }).click();
    await expect(page.locator('.mustry-pz-zoom-badge')).toHaveText('150%', { timeout: 10_000 });
    // an inert clone of the embedded view, scaled behind the view rectangle
    const snapshot = page.locator('.mustry-pz-minimap .mustry-pz-mini-snapshot');
    await expect(snapshot).toContainText('SYNOPTIC DEMO', { timeout: 5_000 });
    await expect(snapshot).toHaveAttribute('inert', '');
});

test('panzoom: dragging the minimap view rectangle keeps the grab point', async ({ page }) => {
    await openRoute(page, '/panzoom', '.mustry-panzoom');
    await page.getByRole('button', { name: 'Fly to Pump 3' }).click();
    await expect(page.locator('.mustry-pz-zoom-badge')).toHaveText('150%', { timeout: 10_000 });
    const rect = page.locator('.mustry-pz-mini-view');
    const before = (await rect.boundingBox())!;
    // press near the rectangle's top-left corner (off-center), drag 20px left
    const x = before.x + 4, y = before.y + 4;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 10, y, { steps: 3 });
    await page.mouse.move(x - 20, y, { steps: 3 });
    await page.mouse.up();
    const after = (await rect.boundingBox())!;
    // the rectangle follows the pointer from where it was grabbed: no jump to center it
    expect(Math.abs(after.x - (before.x - 20))).toBeLessThan(2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);
});

test('panzoom: clicking a minimap POI dot flies there', async ({ page }) => {
    await openRoute(page, '/panzoom', '.mustry-panzoom');
    await page.getByRole('button', { name: 'Fly to Pump 3' }).click();
    await expect(page.locator('.mustry-pz-zoom-badge')).toHaveText('150%', { timeout: 10_000 });
    const dot = page.locator('.mustry-pz-mini-poi[title="Tank 101"]');
    await expect(dot).toHaveAttribute('aria-label', 'Tank 101');
    await dot.click();
    // Tank 101's POI zoom is 1.2
    await expect(page.locator('.mustry-pz-zoom-badge')).toHaveText('120%', { timeout: 10_000 });
});
