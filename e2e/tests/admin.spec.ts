import { test, expect, openRoute } from './helpers';

// Admin Console (/admin): the composition recipe — the three admin components
// in a NATIVE tab container. Deep flows are covered by the per-component
// specs; this smoke-tests that the composition mounts, populates, and
// switches, and that per-tab capability flags hold.

test.describe('Admin Console (composed view)', () => {

    test('all three tabs mount their component with live gateway data', async ({ page }) => {
        const root = await openRoute(page, '/admin', '.mustry-schedmgr');
        // Tab 1: Schedule Manager, populated from the gateway.
        await expect(root.locator('.mustry-sched-item').filter({ hasText: 'Always' }))
            .toHaveCount(1, { timeout: 15_000 });

        // Tab 2: Roster Manager.
        await page.getByText('Rosters', { exact: true }).click();
        const roster = page.locator('.mustry-rostermgr');
        await expect(roster).toBeVisible();
        await expect(roster.locator('.mustry-sched-item').filter({ hasText: 'Demo Escalation' }))
            .toHaveCount(1, { timeout: 15_000 });

        // Tab 3: User Manager, with the demo's capability flags active.
        await page.getByText('Users', { exact: true }).click();
        const users = page.locator('.mustry-usermgr');
        await expect(users).toBeVisible();
        await expect(users.locator('.mustry-sched-item').filter({ hasText: 'Jane Doe' }))
            .toHaveCount(1, { timeout: 15_000 });
        await expect(users.locator('.mustry-users-manage-btn')).toBeVisible();

        // Tab 4: Holiday Manager.
        await page.getByText('Holidays', { exact: true }).click();
        const holidays = page.locator('.mustry-holidaymgr');
        await expect(holidays).toBeVisible();
        await expect(holidays.locator('.mustry-sched-item').filter({ hasText: 'Demo New Year' }))
            .toHaveCount(1, { timeout: 15_000 });

        // Back to tab 1: the schedule component remounts cleanly.
        await page.getByText('Schedules', { exact: true }).click();
        await expect(page.locator('.mustry-schedmgr')).toBeVisible();
        await expect(page.locator('.mustry-sched-dayhead')).toHaveCount(7, { timeout: 15_000 });
    });
});
