import { test, expect, openRoute } from './helpers';

test('timeline: day view renders resources and seeded bars', async ({ page }) => {
    await openRoute(page, '/timeline', '.mustry-timeline');
    await expect(page.getByText('Batch 4711')).toBeVisible();
    await expect(page.getByText('Mixer 1', { exact: true })).toBeVisible();
});

test('timeline: collapsing a resource group hides its rows', async ({ page }) => {
    await openRoute(page, '/timeline', '.mustry-timeline');
    await expect(page.getByText('Mixer 1', { exact: true })).toBeVisible();
    await page.locator('.mustry-tml-label--group', { hasText: 'LINE 1' }).click();
    await expect(page.getByText('Mixer 1', { exact: true })).not.toBeVisible();
});

test('timeline: empty state shows the badge', async ({ page }) => {
    await openRoute(page, '/timeline-empty', '.mustry-timeline');
    await expect(page.locator('.mustry-tml-empty-badge')).toBeVisible();
});

test('timeline: sub-hour zoom presets (issue #117) show second-resolution ticks and keep now in view', async ({ page }) => {
    await openRoute(page, '/timeline-cycle', '.mustry-timeline');
    const zooms = page.locator('.mustry-tml-zoom-btn');
    await expect(zooms).toHaveText(['Millisecond', 'Second', 'Minute', 'Hour', 'Day']);
    await expect(zooms.filter({ hasText: /^Second$/ })).toHaveClass(/mustry-tml-zoom-btn--active/);
    // 'second' = a 2-minute window ticked every 5 s, labelled HH:mm:ss; the
    // seeded cycles run around now, so phase bars are on the board.
    const lower = page.locator('.mustry-tml-axis-lower .mustry-tml-tick');
    await expect(lower).toHaveCount(24);
    await expect(lower.first()).toHaveText(/^\d\d:\d\d:[0-5]\d$/);
    await expect(page.locator('.mustry-tml-bar', { hasText: 'Inject' }).first()).toBeVisible();
    // The now-line is inside the window (Today anchors on the containing stride).
    await expect(page.locator('.mustry-tml-now')).toBeVisible();
    // 'minute' = 30 one-minute ticks; the day label carries the window's start time.
    await zooms.filter({ hasText: /^Minute$/ }).click();
    await expect(lower).toHaveCount(30);
    await expect(lower.first()).toHaveText(/^\d\d:\d\d$/);
    await expect(page.locator('.mustry-tml-axis-upper .mustry-tml-tick').first()).toHaveText(/\d\d:\d\d/);
    await expect(page.locator('.mustry-tml-now')).toBeVisible();
    // Zooming back in returns to the current cycle, not to midnight.
    await zooms.filter({ hasText: /^Second$/ }).click();
    await expect(lower).toHaveCount(24);
    await expect(page.locator('.mustry-tml-now')).toBeVisible();
});

test('timeline: millisecond zoom resolves sub-second phases at their true width', async ({ page }) => {
    await openRoute(page, '/timeline-cycle', '.mustry-timeline');
    const zooms = page.locator('.mustry-tml-zoom-btn');
    // The board is read-only, so the 12px grabbable floor is off: a 40ms 'Vent'
    // phase is a sub-pixel hairline at 'second' zoom rather than a fake second.
    const vent = page.locator('.mustry-tml-bar[title="Vent"]').first();
    await expect(vent).toBeVisible();
    expect(await vent.evaluate((el: HTMLElement) => el.getBoundingClientRect().width)).toBeLessThan(4);

    // 'millisecond' = a 10-second window on 500ms ticks labelled to a tenth.
    await zooms.filter({ hasText: 'Millisecond' }).click();
    const lower = page.locator('.mustry-tml-axis-lower .mustry-tml-tick');
    await expect(lower).toHaveCount(20);
    await expect(lower.first()).toHaveText(/^\d\d:\d\d:[0-5]\d[.,]\d$/);

    // Same 40ms phase, now several px wide and still not floored to a second.
    // Station A vents once per 19.9 s cycle, so a given clock-aligned 10 s
    // window holds a whole Vent only about half the time: step forward until
    // one does. Two consecutive windows cover a full cycle, so 3 is plenty.
    const vents = page.locator('.mustry-tml-bar[title="Vent"]');
    let w = 0;
    for (let i = 0; i < 3 && w <= 3; i++) {
        if (i > 0) {
            const first = (await lower.first().textContent()) ?? '';
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            await expect(lower.first()).not.toHaveText(first);
        }
        const widths = await vents.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
        w = Math.max(0, ...widths);
    }
    expect(w).toBeGreaterThan(3);
    expect(w).toBeLessThan(20);   // a floored 1s phase would be ~144px
});

test('timeline: bound events do not fade in on page load', async ({ page }) => {
    // The demo's events come from a binding that delivers after the component
    // mounts; that first delivery is the initial load, not newly created events.
    await page.addInitScript(() => {
        const w = window as unknown as { enterSeen: number };
        w.enterSeen = 0;
        const watch = () => new MutationObserver(() => {
            w.enterSeen += document.querySelectorAll('.mustry-tml-anim-enter').length;
        }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        if (document.documentElement) {
            watch();
        } else {
            document.addEventListener('readystatechange', watch, { once: true });
        }
    });
    await openRoute(page, '/timeline', '.mustry-timeline');
    await expect(page.getByText('Batch 4711')).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { enterSeen: number }).enterSeen)).toBe(0);
});
