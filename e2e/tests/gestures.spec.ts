import { test, expect, openRoute } from './helpers';

// Safety net for the drag-gesture lifecycle (pointer capture, click-vs-drag
// threshold, preview/commit): real pointer drags against the evergreen demos.
// The demos persist every change through their onChange scripts, so a committed
// drag survives the re-render and a plain click must open the editor instead.

test('calendar: dragging a chip commits a move (and does not open the editor)', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    const chip = page.locator('.cal-tg-event', { hasText: 'Pump A service' });
    await expect(chip).toBeVisible();
    const before = (await chip.textContent()) ?? '';

    // Raw mouse events don't auto-scroll like click() does, and the chip can sit
    // under the sticky toolbar/header until scrolled — press at its live center.
    await chip.scrollIntoViewIfNeeded();
    const box = (await chip.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;   // center: clear of the edge-resize handles
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Two slow steps > the 4px threshold, then a real displacement downwards.
    await page.mouse.move(cx, cy + 40, { steps: 8 });
    await page.mouse.move(cx, cy + 80, { steps: 8 });
    await page.mouse.up();

    // Committed move: same title, different time text; no editor.
    await expect(page.locator('.cal-editor')).toHaveCount(0);
    await expect(chip).toBeVisible();
    await expect.poll(async () => (await chip.textContent()) ?? '').not.toBe(before);
});

test('calendar: a plain click on a chip opens the editor (click-vs-drag threshold)', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    await page.locator('.cal-tg-event', { hasText: 'Pump A service' }).click();
    await expect(page.locator('.cal-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.cal-editor')).toHaveCount(0);
});

test('timeline: dragging a bar commits a horizontal move', async ({ page }) => {
    await openRoute(page, '/timeline', '.mustry-timeline');
    const bar = page.locator('.tml-bar', { hasText: 'Batch 4711' });
    await expect(bar).toBeVisible();
    await bar.scrollIntoViewIfNeeded();
    const before = (await bar.boundingBox())!;

    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2, { steps: 8 });
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('.cal-editor')).toHaveCount(0);
    await expect(bar).toBeVisible();
    await expect
        .poll(async () => (await bar.boundingBox())!.x, { message: 'bar should have moved right' })
        .toBeGreaterThan(before.x + 40);
});

test('timeline: a plain click on a bar opens the editor', async ({ page }) => {
    await openRoute(page, '/timeline', '.mustry-timeline');
    await page.locator('.tml-bar', { hasText: 'Batch 4711' }).click();
    await expect(page.locator('.cal-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.cal-editor')).toHaveCount(0);
});
