import { test, expect, openRoute } from './helpers';

test('timeline: day view renders resources and seeded bars', async ({ page }) => {
    await openRoute(page, '/timeline', '.mustry-timeline');
    await expect(page.getByText('Batch 4711')).toBeVisible();
    await expect(page.getByText('Mixer 1', { exact: true })).toBeVisible();
});

test('timeline: collapsing a resource group hides its rows', async ({ page }) => {
    await openRoute(page, '/timeline', '.mustry-timeline');
    await expect(page.getByText('Mixer 1', { exact: true })).toBeVisible();
    await page.locator('.tml-label--group', { hasText: 'LINE 1' }).click();
    await expect(page.getByText('Mixer 1', { exact: true })).not.toBeVisible();
});

test('timeline: empty state shows the badge', async ({ page }) => {
    await openRoute(page, '/timeline-empty', '.mustry-timeline');
    await expect(page.locator('.tml-empty-badge')).toBeVisible();
});
