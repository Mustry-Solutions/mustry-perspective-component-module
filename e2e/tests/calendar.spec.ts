import { test, expect, openRoute } from './helpers';

// Evergreen demo: events are seeded relative to today on view load. The exact
// titles/positions vary by weekday, so assert on stable structure — that timed
// event chips render and the category legend (config) mapped through.
test('calendar: week view renders seeded events', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    await expect(page.locator('.mustry-cal-tg-event').first()).toBeVisible();
    expect(await page.locator('.mustry-cal-tg-event').count()).toBeGreaterThan(3);
    // Category legend proves categories/config props mapped through.
    await expect(page.getByText('Maintenance', { exact: true })).toBeVisible();
});

test('calendar: view switch to Month re-renders', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    // The month grid renders its day cells and at least one event chip.
    await expect(page.locator('.mustry-cal-day').first()).toBeVisible();
    await expect(page.locator('.mustry-cal-mbar, .mustry-cal-day-event, [class*="cal-m"]').first()).toBeVisible();
});

test('calendar: empty state shows the badge', async ({ page }) => {
    await openRoute(page, '/calendar-empty', '.mustry-calendar');
    await expect(page.locator('.mustry-cal-empty-badge')).toBeVisible();
});
