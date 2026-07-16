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
