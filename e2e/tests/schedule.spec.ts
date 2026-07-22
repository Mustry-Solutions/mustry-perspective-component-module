import { test, expect, openRoute } from './helpers';

// Schedule Manager (M0, read-only): list + week grid against the live gateway.
// The /schedule demo binds data.schedules to system.user.getSchedules() and
// appends two synthetic demo schedules, so both real and known data render.

test.describe('Schedule Manager', () => {

    test('lists gateway and demo schedules with the count output', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        const items = root.locator('.mustry-sched-item');
        await expect(items.filter({ hasText: 'Demo Day Shift' })).toHaveCount(1);
        await expect(items.filter({ hasText: 'Demo Night Shift' })).toHaveCount(1);
        // The gateway's real schedules are in the same list (a fresh gateway
        // ships the built-in "Always"), so at least 3 rows total.
        expect(await items.count()).toBeGreaterThanOrEqual(3);
        // output.count is mirrored into the readout label under the component.
        await expect(page.locator('text=output.count')).toContainText(/output\.count: [3-9]/);
    });

    test('selecting a schedule paints its availability and writes state back', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }).click();
        // 5 weekdays x 2 ranges (8:00-12:00, 12:30-17:00) = 10 blocks.
        await expect(root.locator('.mustry-sched-block')).toHaveCount(10);
        await expect(root.locator('.mustry-sched-dayhead')).toHaveCount(7);
        await expect(root.locator('.mustry-sched-detail-name')).toHaveText('Demo Day Shift');
        // Two-way state: the demo readout reflects the selection. (Anchored so
        // it can't match the help paragraph, which also names the prop.)
        await expect(page.getByText(/^state\.selectedSchedule: /)).toContainText('"Demo Day Shift"');
        // Badge: Demo Day Shift observes holidays.
        await expect(root.locator('.mustry-sched-badge')).toContainText(['Observes holidays']);
    });

    test('alternating night shift shows its badge and clipped ranges', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Night Shift' }).click();
        await expect(root.locator('.mustry-sched-block')).toHaveCount(10);
        await expect(root.locator('.mustry-sched-badge').filter({ hasText: 'week A' })).toHaveCount(1);
    });
});
