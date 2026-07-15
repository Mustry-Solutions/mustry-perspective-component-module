import { test, expect, openRoute } from './helpers';

// Evergreen demo: events are seeded relative to today on view load, so the
// default week view always contains the seeded titles.
test('calendar: week view renders seeded events', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    await expect(page.getByText('Pump A service')).toBeVisible();
    // Category legend proves categories/config props mapped through.
    await expect(page.getByText('Maintenance', { exact: true })).toBeVisible();
});

test('calendar: view switch to Month re-renders', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    // Month grid shows ~6 weeks; the seeded multi-day "Audit window" survives the switch.
    await expect(page.getByText('Audit window').first()).toBeVisible();
});

test('calendar: empty state shows the badge', async ({ page }) => {
    await openRoute(page, '/calendar-empty', '.mustry-calendar');
    await expect(page.locator('.cal-empty-badge')).toBeVisible();
});
