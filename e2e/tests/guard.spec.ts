import { clearAlarms, expect, guardStatus, litShare, OVERLAY, openGuarded, test, tile, waitIdle, zoneWhereHourIs } from './guardHelpers';

// The Idle Guard on the GuardDemo verify page (/guard/<mode>/<timeout>...).
// Every test runs in a fresh browser context (a fresh Perspective session).
// Alarms are gateway-wide, so the alarm tests clear them first and last; the
// tests in this file run one after another (the config is not fullyParallel).
test.use({
    viewport: { width: 1280, height: 760 },
    // Midday in the browser, so the default night window (22:00-06:00) never kicks in by accident.
    timezoneId: zoneWhereHourIs(13),
    launchOptions: {
        // A pre-installed Chromium (a container without `playwright install`).
        executablePath: process.env.PW_CHROMIUM_PATH || undefined,
        // CI runners have no GPU: WebGL2 runs on SwiftShader, which Chrome only allows when asked.
        args: ['--enable-unsafe-swiftshader']
    }
});
// Idling takes seconds per test; the canvas checks wait for the scene to build.
test.describe.configure({ timeout: 90_000 });

test.describe('idle and wake', () => {
    test('idles after the timeout and wakes on mouse movement with the page intact', async ({ page }) => {
        await openGuarded(page, 'clock', 5);
        await page.getByRole('button', { name: 'Start pump' }).click();
        await expect(tile(page, 'presses')).toHaveText('1');
        await expect(page.locator(OVERLAY)).toHaveCount(0);

        const overlay = await waitIdle(page);
        await expect(overlay).toHaveAttribute('data-mode', 'clock');
        await expect(page.locator('.mustry-idle-clock__time')).toBeVisible();

        // Jitter below the threshold (8 px) does not wake it.
        await page.mouse.move(400, 400);
        await page.mouse.move(403, 402);
        await page.waitForTimeout(400);
        await expect(overlay).toBeVisible();

        await page.mouse.move(600, 500, { steps: 4 });
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        // Same page, same state: nothing reloaded underneath.
        await expect(tile(page, 'presses')).toHaveText('1');
        await expect(tile(page, 'screen')).toHaveText('awake');
        await expect(guardStatus(page)).toContainText('last wake: input');
    });

    test('a waking click never reaches the page underneath', async ({ page }) => {
        await openGuarded(page, 'clock', 5);
        const jog = page.locator('#jog');
        const box = await jog.boundingBox();
        expect(box).not.toBeNull();
        const x = box!.x + box!.width / 2;
        const y = box!.y + box!.height / 2;
        // Park the pointer on the control so the click below involves no movement.
        await page.mouse.move(x, y);
        await waitIdle(page);

        // Press on the overlay, release where the jog control sits underneath.
        await page.mouse.down();
        await page.waitForTimeout(120);
        await page.mouse.up();
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        await page.waitForTimeout(1000);
        await expect(page.locator('#jog-count')).toHaveText('releases: 0');

        // Once awake, the same gesture works.
        await page.mouse.down();
        await page.mouse.up();
        await expect(page.locator('#jog-count')).toHaveText('releases: 1');
        await page.getByRole('button', { name: 'Start pump' }).click();
        await expect(tile(page, 'presses')).toHaveText('1');
    });

    test('a waking key press wakes the page and is swallowed', async ({ page }) => {
        await openGuarded(page, 'blank', 5);
        await page.getByRole('button', { name: 'Start pump' }).focus();
        await waitIdle(page);
        // Enter on a focused button would press it: it must only wake the page.
        await page.keyboard.press('Enter');
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        await page.waitForTimeout(1000);
        await expect(tile(page, 'presses')).toHaveText('0');
    });
});

test.describe('touch', () => {
    test.use({ hasTouch: true });

    // Chromium already drops a tap whose touch target (the overlay) went away,
    // so this passes even without the guard's swallowing; it is here as a
    // regression check. The mouse test above is the one that proves the
    // swallowing (verified by mutation: it fails with swallowing disabled).

    test('a waking tap never reaches the page underneath', async ({ page }) => {
        await openGuarded(page, 'starfield', 5);
        const jog = await page.locator('#jog').boundingBox();
        const pump = await page.getByRole('button', { name: 'Start pump' }).boundingBox();
        await waitIdle(page);
        await page.touchscreen.tap(jog!.x + jog!.width / 2, jog!.y + jog!.height / 2);
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        await page.waitForTimeout(1000);
        await expect(page.locator('#jog-count')).toHaveText('releases: 0');

        // Idle again, then tap the button itself.
        await waitIdle(page);
        await page.touchscreen.tap(pump!.x + pump!.width / 2, pump!.y + pump!.height / 2);
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        await page.waitForTimeout(1000);
        await expect(tile(page, 'presses')).toHaveText('0');
    });
});

test.describe('alarms', () => {
    test.afterEach(async ({ page }) => {
        // Wake first if needed (the clear button is under the overlay otherwise).
        await page.mouse.move(10, 300);
        await page.mouse.move(300, 300, { steps: 3 });
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        await clearAlarms(page);
    });

    test('a High alarm wakes the page and keeps it awake', async ({ page }) => {
        await openGuarded(page, 'starfield', 5);
        await clearAlarms(page);
        await page.getByRole('button', { name: /High alarm/ }).click();
        const clickedAt = Date.now();
        await waitIdle(page);
        // Raised 8 s after the click; the feed polls every second.
        await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 15_000 });
        const wokeAfter = Date.now() - clickedAt;
        expect(wokeAfter).toBeGreaterThan(7_500);
        expect(wokeAfter).toBeLessThan(8_000 + 3_000);
        await expect(guardStatus(page)).toContainText('last wake: alarm');
        // While it is active, the page does not idle again.
        await page.waitForTimeout(7_000);
        await expect(page.locator(OVERLAY)).toHaveCount(0);
    });

    test('a Medium alarm pins a banner over the idle mode without waking', async ({ page }) => {
        await openGuarded(page, 'pipes', 5);
        await clearAlarms(page);
        await page.getByRole('button', { name: /Medium alarm/ }).click();
        const overlay = await waitIdle(page);
        const banner = page.locator('.mustry-idle-banner');
        await expect(banner).toBeVisible({ timeout: 12_000 });
        await expect(banner).toContainText('1 active alarm');
        await expect(banner).toContainText('1 Medium');
        await expect(banner).toContainText('Line 1 glue temperature drifting');
        await expect(banner).toHaveClass(/mustry-idle-banner--medium/);
        await expect(overlay).toBeVisible();
    });

    test('a Critical alarm wakes the page even when wakePriority is Critical', async ({ page }) => {
        await openGuarded(page, 'clock', 5, 'Critical');
        await clearAlarms(page);
        await page.getByRole('button', { name: /High alarm/ }).click();
        await page.getByRole('button', { name: /Critical alarm/ }).click();
        await waitIdle(page);
        await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 15_000 });
        await expect(guardStatus(page)).toContainText('last wake: alarm');
    });

    test('an active Critical alarm is never covered', async ({ page }) => {
        await openGuarded(page, 'clock', 5, 'Critical');
        await clearAlarms(page);
        await page.getByRole('button', { name: /Critical alarm/ }).click();
        // 8 s until it is raised: the page idles meanwhile, then wakes.
        await waitIdle(page);
        await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 15_000 });
        // Twice the timeout with nobody touching it: still uncovered.
        await page.waitForTimeout(11_000);
        await expect(page.locator(OVERLAY)).toHaveCount(0);
    });
});

test.describe('fail open', () => {
    test('when the alarm feed goes quiet the guard removes itself and stays away', async ({ page }) => {
        let blockFeed = false;
        // Sit between the page and the gateway; drop only the feed's messages.
        await page.routeWebSocket(/.*/, (ws) => {
            const server = ws.connectToServer();
            ws.onMessage((m) => server.send(m));
            server.onMessage((m) => {
                if (blockFeed && typeof m === 'string' && m.includes('screensaver-alarms')) {
                    return;
                }
                ws.send(m);
            });
        });
        await openGuarded(page, 'starfield', 5);
        await waitIdle(page);
        blockFeed = true;
        // alarm.staleAfterSec defaults to 8.
        await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 12_000 });
        await expect(guardStatus(page)).toContainText('last wake: feed-stale');
        await page.waitForTimeout(7_000);
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        // Feed back: it idles again.
        blockFeed = false;
        await waitIdle(page, 15_000);
    });
});

/**
 * Every canvas mode: its renderer, and the share of bright pixels it must beat (overlay text
 * hidden). Measured on SwiftShader after 4 s; the thresholds sit well below that and well
 * above the same scene's dark background (line modes measured with every line off).
 * [mode, renderer, minimum share, brightness threshold (sum of R+G+B)]
 */
const CANVAS_MODES: Array<[string, 'webgl2' | '2d', number, number]> = [
    ['pipes', 'webgl2', 0.01, 300],      // ~2.4 % (lines off: 0.00 %)
    ['aurora', 'webgl2', 0.05, 300],     // ~14 % (lines off: 0.13 %)
    ['halo', 'webgl2', 0.015, 300],      // ~4.6 % (lines off: 0.29 %)
    ['starfield', 'webgl2', 0.002, 300], // ~0.5 %
    ['synthwave', 'webgl2', 0.1, 300],   // ~45 %
    ['lava', 'webgl2', 0.04, 300],       // ~17 %
    ['tunnel', 'webgl2', 0.05, 300],     // ~19 %
    ['flow', 'webgl2', 0.08, 100],       // ~29 % (its background sums to ~70)
    ['bounce', '2d', 0.002, 300],        // ~0.6 %
    ['pong', '2d', 0.005, 300],          // ~1.8 %
    ['ducks', '2d', 0.2, 300]            // ~65 %
];

test.describe('modes', () => {
    for (const [mode, renderer, minLit, brightness] of CANVAS_MODES) {
        test(`${mode} renders (${renderer})`, async ({ page }) => {
            await openGuarded(page, mode, 5);
            const overlay = await waitIdle(page);
            await expect(overlay).toHaveAttribute('data-mode', mode);
            await expect(page.locator('.mustry-idle-canvas')).toHaveAttribute('data-renderer', renderer);
            await page.waitForTimeout(4_000);
            expect(await litShare(page, brightness)).toBeGreaterThan(minLit);
        });
    }

    // The verify guard shuffles lava (WebGL2) and ducks (2D) every 30 s: each swap needs a
    // fresh canvas, since one that held a GL context cannot give a 2D one.
    test('shuffle swaps between GL and 2D modes on fresh canvases', async ({ page }) => {
        test.setTimeout(150_000);
        await openGuarded(page, 'shuffle', 5);
        const overlay = await waitIdle(page);
        await expect(overlay).toHaveAttribute('data-shuffle', 'true');
        const first = await overlay.getAttribute('data-mode');
        expect(['lava', 'ducks']).toContain(first);
        const second = first === 'lava' ? 'ducks' : 'lava';
        const renderer = (m: string) => (m === 'lava' ? 'webgl2' : '2d');
        await expect(page.locator('.mustry-idle-canvas')).toHaveAttribute('data-renderer', renderer(first as string));
        for (const next of [second, first as string]) {
            await expect(overlay).toHaveAttribute('data-mode', next, { timeout: 40_000 });
            const canvas = page.locator('.mustry-idle-canvas');
            await expect(canvas).toHaveCount(1);
            await expect(canvas).toHaveAttribute('data-renderer', renderer(next));
            await page.waitForTimeout(3_000);
            expect(await litShare(page)).toBeGreaterThan(next === 'lava' ? 0.04 : 0.2);
        }
    });

    test('clock shows the time', async ({ page }) => {
        await openGuarded(page, 'clock', 5);
        await waitIdle(page);
        await expect(page.locator('.mustry-idle-clock__time')).toHaveText(/\d{1,2}:\d{2}/);
        await expect(page.locator('.mustry-idle-canvas')).toHaveCount(0);
    });

    // A fresh session per mode: the verify page sets the guard's mode once per session.
    test('blank shows nothing at all', async ({ page }) => {
        await openGuarded(page, 'blank', 5);
        const overlay = await waitIdle(page);
        await expect(overlay).toHaveAttribute('data-mode', 'blank');
        await expect(page.locator('.mustry-idle-hint')).toHaveCount(0);
        // Past the 600 ms fade-in: from then on, nothing but black.
        await page.waitForTimeout(1_500);
        expect(await litShare(page, 30)).toBeLessThan(0.001);
    });

    test('halo labels each line around the clock', async ({ page }) => {
        await openGuarded(page, 'halo', 5);
        await waitIdle(page);
        const labels = page.locator('.mustry-idle-halo__label');
        await expect(labels).toHaveCount(5);
        await expect(labels.first()).toContainText('Line 1');
        await expect(page.locator('.mustry-idle-halo__time')).toBeVisible();
    });

    test('external mode draws nothing but still reports idle', async ({ page }) => {
        await openGuarded(page, 'external', 5);
        await page.waitForTimeout(7_000);
        await expect(page.locator(OVERLAY)).toHaveCount(0);
        await expect(tile(page, 'screen')).toHaveText('idle');
        await page.mouse.move(100, 100);
        await page.mouse.move(400, 400, { steps: 3 });
        await expect(tile(page, 'screen')).toHaveText('awake');
    });
});

test.describe('without WebGL2', () => {
    // A browser (or a locked-down kiosk) without WebGL2: every GL mode must fall back to 2D,
    // still draw, and log no errors (the fallback announces itself with a console warning).
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            const real = HTMLCanvasElement.prototype.getContext;
            (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
                return type === 'webgl2' ? null : real.apply(this, [type, ...rest] as never);
            };
        });
    });

    for (const [mode] of CANVAS_MODES.filter(([, r]) => r === 'webgl2')) {
        test(`${mode} falls back to 2D`, async ({ page }) => {
            const warnings: string[] = [];
            page.on('console', (m) => {
                if (m.type() === 'warning') warnings.push(m.text());
            });
            await openGuarded(page, mode, 5);
            const overlay = await waitIdle(page);
            await expect(overlay).toHaveAttribute('data-mode', mode);
            await expect(page.locator('.mustry-idle-canvas')).toHaveAttribute('data-renderer', '2d');
            await page.waitForTimeout(4_000);
            // The 2D starfield is sparse (~0.25 %); 2D pipes is denser.
            expect(await litShare(page)).toBeGreaterThan(0.0008);
            expect(warnings.some((w) => w.includes('WebGL2 unavailable'))).toBe(true);
        });
    }
});

test.describe('night window', () => {
    // 1 a.m. in the browser: inside the default 22:00-06:00 window.
    test.use({ timezoneId: zoneWhereHourIs(1) });

    test('an idle screen rests at night: a dimmed clock, no canvas, never black, still wakes', async ({ page }) => {
        await openGuarded(page, 'pipes', 5);
        const overlay = await waitIdle(page);
        await expect(overlay).toHaveAttribute('data-mode', 'clock');
        await expect(overlay).toHaveAttribute('data-reason', 'night');
        // onIdle reports what is shown, not config.mode.
        await expect(guardStatus(page)).toContainText('showing: clock');
        await expect(page.locator('.mustry-idle-canvas')).toHaveCount(0);
        await expect(page.locator('.mustry-idle-clock__time')).toBeVisible();
        await expect(page.locator('.mustry-idle-hint')).toBeVisible();
        await expect(page.locator('.mustry-idle-dim')).toHaveCount(1);
        // Dark, but not black: the dim layer lets the default 40 % through.
        const shade = await page.locator('.mustry-idle-dim').evaluate((el) => Number(getComputedStyle(el).opacity));
        expect(shade).toBeCloseTo(0.6, 2);
        await page.mouse.move(10, 10);
        await page.mouse.move(300, 300, { steps: 3 });
        await expect(page.locator(OVERLAY)).toHaveCount(0);
    });
});

test.describe('reduced motion', () => {
    // Through contextOptions: under Playwright 1.61 the top-level reducedMotion option did not
    // reach the page (matchMedia reported no preference). From 1.64 both routes set the same
    // context option, so this is the explicit form rather than a workaround.
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('animated modes give way to the clock when the browser asks for less motion', async ({ page }) => {
        await openGuarded(page, 'flow', 5);
        const overlay = await waitIdle(page);
        await expect(overlay).toHaveAttribute('data-mode', 'clock');
        await expect(overlay).toHaveAttribute('data-reason', 'reduced-motion');
        await expect(overlay).toHaveClass(/mustry-idle-overlay--still/);
        await expect(guardStatus(page)).toContainText('showing: clock');
        await expect(page.locator('.mustry-idle-canvas')).toHaveCount(0);
        await expect(page.locator('.mustry-idle-clock__time')).toBeVisible();
    });
});
