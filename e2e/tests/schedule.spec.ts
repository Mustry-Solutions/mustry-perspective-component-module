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
        // While editable, observeHolidays is a toggle (checked for this schedule).
        await expect(root.locator('.mustry-sched-toggle')
            .filter({ hasText: 'Observes holidays' }).locator('input')).toBeChecked();
    });

    test('alternating night shift shows its badge and clipped ranges', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Night Shift' }).click();
        await expect(root.locator('.mustry-sched-block')).toHaveCount(10);
        await expect(root.locator('.mustry-sched-badge').filter({ hasText: 'week A' })).toHaveCount(1);
    });

    // --- M1: editing --------------------------------------------------------

    /** Drag vertically inside a day column between two fractions of its height. */
    async function dragInColumn(page: any, col: any, fromFraction: number, toFraction: number) {
        const box = await col.boundingBox();
        const x = box.x + box.width / 2;
        await page.mouse.move(x, box.y + box.height * fromFraction);
        await page.mouse.down();
        await page.mouse.move(x, box.y + box.height * (fromFraction + toFraction) / 2, { steps: 3 });
        await page.mouse.move(x, box.y + box.height * toFraction, { steps: 3 });
        await page.mouse.up();
    }

    test('painting availability dirties the draft and Discard reverts it', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }).click();
        await expect(root.locator('.mustry-sched-block')).toHaveCount(10);
        // Saturday (6th column, monday-first) is empty — paint 6:00→12:00.
        const saturday = root.locator('.mustry-sched-col').nth(5);
        await dragInColumn(page, saturday, 0.25, 0.5);
        await expect(root.locator('.mustry-sched-block')).toHaveCount(11);
        await expect(root.locator('.mustry-commit-badge')).toBeVisible();
        await expect(page.getByText(/^state\.selectedSchedule: /)).toContainText(/output\.isDirty: true/i);
        // Discard: the painted block and the dirty badge disappear.
        await root.locator('.mustry-commit-discard').click();
        await expect(root.locator('.mustry-sched-block')).toHaveCount(10);
        await expect(root.locator('.mustry-commit-badge')).toHaveCount(0);
    });

    test('removing a block, saving, and painting it back persist to the gateway', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }).click();
        await expect(root.locator('.mustry-sched-detail-name')).toHaveText('Demo Day Shift');
        // Only the selected (non-allDays) schedule renders editable blocks, so
        // waiting for them guarantees the selection re-render has settled.
        const blocks = root.locator('.mustry-sched-block--editable');
        await expect(blocks.first()).toBeVisible();
        const before = await blocks.count();
        expect(before).toBeGreaterThanOrEqual(2);

        // Remove Monday's first block (8:00-12:00) and save.
        await blocks.first().click();
        await expect(blocks).toHaveCount(before - 1);
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onScheduleSave persisted "Demo Day Shift"/)).toBeVisible();
        // The refetch clears the dirty badge without discarding anything.
        await expect(root.locator('.mustry-commit-badge')).toHaveCount(0, { timeout: 15_000 });

        // Reload: the edit came back from the GATEWAY, not the draft.
        await page.reload();
        const root2 = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root2.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }).click();
        await expect(root2.locator('.mustry-sched-detail-name')).toHaveText('Demo Day Shift');
        await expect(root2.locator('.mustry-sched-block--editable')).toHaveCount(before - 1);

        // Restore: paint Monday 8:00→12:00 back (fractions of the 0-24 axis) and save,
        // so the demo schedule is back to its canonical shape for the next run.
        const monday = root2.locator('.mustry-sched-col').nth(0);
        await dragInColumn(page, monday, 8 / 24, 12 / 24);
        await expect(root2.locator('.mustry-sched-block--editable')).toHaveCount(before);
        await root2.locator('.mustry-commit-save').click();
        await expect(root2.locator('.mustry-commit-badge')).toHaveCount(0, { timeout: 15_000 });
        await page.reload();
        const root3 = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root3.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }).click();
        await expect(root3.locator('.mustry-sched-detail-name')).toHaveText('Demo Day Shift');
        await expect(root3.locator('.mustry-sched-block--editable')).toHaveCount(before);
    });

    test('deleting a schedule asks twice and fires onScheduleDelete', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Night Shift' }).click();
        const del = root.locator('.mustry-sched-delete');
        await del.click();
        await expect(del).toHaveText('Confirm delete?');
        await del.click();
        // The script reports the outcome either way; on a gateway where the
        // synthetic schedule was never saved, removeSchedule may legitimately
        // report a failure — the event contract is what this test pins.
        await expect(page.getByText(/onScheduleDelete /)).toBeVisible();
    });
});
