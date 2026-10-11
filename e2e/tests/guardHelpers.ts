// Helpers for the Idle Guard suite (guard.spec.ts): the GuardDemo verify page
// (ops/verify/tools/build_guard_views.py), the overlay, pixel checks and the
// browser time zone the night window runs on.
import { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from './helpers';

export { expect, test };

/** Session-relative route of the committed "verify" Perspective project. */
const SESSION = '/data/perspective/client/verify';

/** The idle overlay the guard portals onto document.body. */
export const OVERLAY = '.mustry-idle-overlay';


/**
 * Open the GuardDemo page with the guard configured from the URL
 * (/guard/<mode>/<timeoutSec>[/<wakePriority>[/<quality>]]) and wait until the
 * session is connected and the guard is mounted. Detects the Perspective
 * trial-expired screen and fails with instructions.
 */
export async function openGuarded(page: Page, mode: string, timeoutSec: number, wake?: string, quality?: string): Promise<void> {
    const route = `/guard/${mode}/${timeoutSec}${wake || quality ? `/${wake || 'High'}` : ''}${quality ? `/${quality}` : ''}`;
    await page.goto(`${SESSION}${route}`);
    const heading = page.getByText('Packaging hall · overview');
    const trial = page.getByText('Trial Expired');
    await expect(heading.or(trial).first()).toBeVisible({ timeout: 30_000 });
    if (await trial.isVisible().catch(() => false)) {
        throw new Error('Perspective trial expired: log into the gateway (see ops/README.md) to start a fresh 2h trial, then re-run.');
    }
    await expect(page.locator('.mustry-idle-guard')).toHaveCount(1);
    await expect(page.locator('.connection-banner.banner-active')).toHaveCount(0, { timeout: 30_000 });
    // The header shows the bound config once session.custom.guard is set.
    await expect(page.getByText(`Idle Guard: ${mode} after ${timeoutSec} s`)).toBeVisible();
}

/** The value label of one GuardDemo tile (meta.domId "tile-<name>"). */
export function tile(page: Page, name: 'presses' | 'screen' | 'rate' | 'state'): Locator {
    return page.locator(`#tile-${name}`);
}

/** The header's status line (meta.domId "guard-status"): mode, timeout and the last wake cause. */
export function guardStatus(page: Page): Locator {
    return page.locator('#guard-status');
}

/** Wait until the overlay is up. */
export async function waitIdle(page: Page, timeoutMs = 15_000): Promise<Locator> {
    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeVisible({ timeout: timeoutMs });
    return overlay;
}

/** Clear every demo alarm (a button click: it is input, so call it before waiting for idle). */
export async function clearAlarms(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Clear all alarms' }).click();
}

/**
 * Share of sampled screen pixels brighter than `threshold` (sum of R+G+B),
 * from a screenshot with the overlay's text hidden, so only the canvas counts.
 */
export async function litShare(page: Page, threshold = 300): Promise<number> {
    const style = await page.addStyleTag({ content: '.mustry-idle-overlay > :not(canvas) { visibility: hidden !important; }' });
    const shot = await page.screenshot();
    await style.evaluate((el) => el.remove());
    const png = PNG.sync.read(shot);
    let lit = 0;
    let seen = 0;
    for (let y = 0; y < png.height; y += 6) {
        for (let x = 0; x < png.width; x += 6) {
            const i = (y * png.width + x) * 4;
            seen++;
            if (png.data[i] + png.data[i + 1] + png.data[i + 2] > threshold) {
                lit++;
            }
        }
    }
    return lit / seen;
}

/**
 * An IANA time zone in which the local hour is `hour` right now. The guard's
 * night window runs on the browser's local time, so the suite pins a midday
 * zone (no test is surprised by the default 22:00-06:00 window, whenever CI
 * runs) and the night test picks a zone where it is 1 a.m.
 * Etc/GMT zones have inverted signs: Etc/GMT-2 is UTC+2.
 */
export function zoneWhereHourIs(hour: number, now = new Date()): string {
    let offset = (((hour - now.getUTCHours()) % 24) + 24) % 24;
    if (offset > 14) {
        offset -= 24;
    }
    return offset === 0 ? 'Etc/UTC' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}
