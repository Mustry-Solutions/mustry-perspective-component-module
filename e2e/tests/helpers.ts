import { test as base, expect, Page } from '@playwright/test';

/** Session-relative route of the committed "verify" Perspective project. */
const SESSION = '/data/perspective/client/verify';

/**
 * Test fixture that fails a test on any uncaught page error or console.error
 * emitted by the session. The components must render clean; Perspective itself
 * is quiet in a healthy session, so any error here is a finding.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
    consoleErrors: [
        async ({ page }, use) => {
            const errors: string[] = [];
            page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
            page.on('console', (msg) => {
                if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
            });
            await use(errors);
            expect(errors, 'the session must not log errors').toEqual([]);
        },
        { auto: true },
    ],
});

export { expect };

/**
 * Open a verify-project route and wait for the component root to mount.
 * Detects the Perspective trial-expired screen and fails with instructions
 * instead of a bare selector timeout.
 */
export async function openRoute(page: Page, route: string, rootSelector: string) {
    await page.goto(`${SESSION}${route}`);
    const root = page.locator(rootSelector).first();
    const trial = page.getByText('Trial Expired');
    await expect(root.or(trial).first()).toBeVisible({ timeout: 30_000 });
    if (await trial.isVisible().catch(() => false)) {
        throw new Error(
            'Perspective trial expired: log into the gateway (see ops/README.md) to start a fresh 2h trial, then re-run.'
        );
    }
    await expect(root).toBeVisible();
    return root;
}
