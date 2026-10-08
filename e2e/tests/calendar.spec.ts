import { Page } from '@playwright/test';
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

test('calendar: hovering an event shows only the detail popover (issue #205)', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    const chip = page.locator('.mustry-cal-tg-event').first();
    // Scroll first and let the scroll event land: the time grid hides the hover
    // popover on scroll, so a hover() that scrolls would cancel its own popover.
    await chip.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await chip.hover();
    await expect(page.locator('.mustry-cal-popover')).toBeVisible();
    // No native title: the browser's own tooltip would pop up over the popover.
    await expect(chip).not.toHaveAttribute('title', /.*/);
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(page.locator('.mustry-cal-mbar').first()).not.toHaveAttribute('title', /.*/);
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

/** Count every enter-animation class the page ever shows, from first paint. */
async function countEnterAnimations(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as { enterSeen: number };
        w.enterSeen = 0;
        const watch = () => new MutationObserver(() => {
            w.enterSeen += document.querySelectorAll('.mustry-cal-anim-enter').length;
        }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        if (document.documentElement) {
            watch();
        } else {
            document.addEventListener('readystatechange', watch, { once: true });
        }
    });
}

const enterSeen = (page: Page) => page.evaluate(() => (window as unknown as { enterSeen: number }).enterSeen);

test('calendar: events and recurring series do not fade in on page load', async ({ page }) => {
    await countEnterAnimations(page);
    await openRoute(page, '/calendar', '.mustry-calendar');
    await page.waitForTimeout(1000);
    expect(await enterSeen(page)).toBe(0);
});

test('calendar: a windowed binding\'s new page does not fade in', async ({ page }) => {
    // /calendar-db refetches per visible range; its one-off events sit in
    // May-August 2026. Paging back into them loads new ids, which are loaded
    // data, not newly created events.
    await countEnterAnimations(page);
    await openRoute(page, '/calendar-db', '.mustry-calendar');
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    const oneOff = page.locator('.mustry-cal-mbar:not(:has(.mustry-cal-ev-recur))');
    for (let i = 0; i < 36 && !(await oneOff.count()); i++) {
        await page.getByRole('button', { name: 'Previous', exact: true }).click();
        await page.waitForTimeout(400);
    }
    await expect(oneOff.first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(await enterSeen(page)).toBe(0);
});
