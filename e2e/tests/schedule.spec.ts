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

    /**
     * Select Demo Day Shift and guarantee its canonical shape (10 blocks:
     * 5 weekdays x 2 ranges). A failed earlier run may have SAVED an edited
     * copy to the gateway; deleting it makes the binding re-append the
     * synthetic canonical version.
     */
    async function selectCanonicalDayShift(page: any, root: any) {
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }).click();
        await expect(root.locator('.mustry-sched-name-input')).toHaveValue('Demo Day Shift');
        const blocks = root.locator('.mustry-sched-block');
        try {
            await expect(blocks).toHaveCount(10, { timeout: 3000 });
        } catch {
            const del = root.locator('.mustry-sched-delete');
            await del.click();
            await del.click();
            await expect(page.getByText(/onScheduleDelete /)).toBeVisible();
            await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' })
                .click({ timeout: 15_000 });
            await expect(blocks).toHaveCount(10, { timeout: 15_000 });
        }
    }

    test('selecting a schedule paints its availability and writes state back', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await selectCanonicalDayShift(page, root);
        await expect(root.locator('.mustry-sched-dayhead')).toHaveCount(7);
        await expect(root.locator('.mustry-sched-name-input')).toHaveValue('Demo Day Shift');
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
        await selectCanonicalDayShift(page, root);
        // Saturday (6th column, monday-first) is empty — paint 6:00→12:00.
        const saturday = root.locator('.mustry-sched-col').nth(5);
        await dragInColumn(page, saturday, 0.25, 0.5);
        await expect(root.locator('.mustry-sched-block')).toHaveCount(11);
        await expect(root.locator('.mustry-commit-badge')).toBeVisible();
        await expect(page.getByText(/^state\.selectedSchedule: /)).toContainText(/output\.isDirty: true/i);
        // Discard: the painted block and the dirty badge disappear.
        await root.locator('.mustry-commit-discard').click();
        await expect(root.locator('.mustry-sched-block')).toHaveCount(10);
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden();
    });

    test('removing a block, saving, and painting it back persist to the gateway', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }).click();
        await expect(root.locator('.mustry-sched-name-input')).toHaveValue('Demo Day Shift');
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
        // First save on a fresh gateway CREATES the demo schedule; later saves edit it.
        await expect(page.getByText(/onScheduleSave (persisted|created) "Demo Day Shift"/)).toBeVisible();
        // The refetch clears the dirty badge without discarding anything.
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });

        // Reload: the edit came back from the GATEWAY, not the draft.
        await page.reload();
        const root2 = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root2.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }).click();
        await expect(root2.locator('.mustry-sched-name-input')).toHaveValue('Demo Day Shift');
        await expect(root2.locator('.mustry-sched-block--editable')).toHaveCount(before - 1);

        // Restore: paint Monday 8:00→12:00 back (fractions of the 0-24 axis) and save,
        // so the demo schedule is back to its canonical shape for the next run.
        const monday = root2.locator('.mustry-sched-col').nth(0);
        await dragInColumn(page, monday, 8 / 24, 12 / 24);
        await expect(root2.locator('.mustry-sched-block--editable')).toHaveCount(before);
        await root2.locator('.mustry-commit-save').click();
        await expect(root2.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });
        await page.reload();
        const root3 = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root3.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }).click();
        await expect(root3.locator('.mustry-sched-name-input')).toHaveValue('Demo Day Shift');
        await expect(root3.locator('.mustry-sched-block--editable')).toHaveCount(before);
    });

    /** Delete a schedule through the UI when it exists (leftover cleanup). */
    async function deleteIfPresent(root: any, name: string) {
        const item = root.locator('.mustry-sched-item').filter({ hasText: name }).first();
        if (await item.count() === 0) {
            return;
        }
        await item.click();
        const del = root.locator('.mustry-sched-delete');
        await del.click();
        await del.click();
        await expect(root.locator('.mustry-sched-item').filter({ hasText: name }))
            .toHaveCount(0, { timeout: 15_000 });
    }

    test('create → persist → rename → delete lifecycle against the gateway', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        // The list populates when the data binding delivers — wait for a
        // schedule that always exists before trusting item counts.
        await expect(root.locator('.mustry-sched-item').filter({ hasText: 'Demo Day Shift' }))
            .toHaveCount(1, { timeout: 15_000 });

        // Self-heal: a previously failed run may have left the temp schedule
        // behind on the gateway, which would trip duplicate-name validation.
        await deleteIfPresent(root, 'E2E Temp Renamed');
        await deleteIfPresent(root, 'E2E Temp');

        // Create: '+ New schedule' opens a blank draft; Save is blocked until named.
        await root.locator('.mustry-sched-new').click();
        await expect(root.locator('.mustry-commit-save')).toBeDisabled();
        await expect(root.locator('.mustry-sched-name-error')).toHaveText('Name required');
        await root.locator('.mustry-sched-name-input').fill('E2E Temp');
        await expect(root.locator('.mustry-sched-name-error')).toHaveCount(0);
        // Paint Monday 6:00→12:00 on the blank grid, then save.
        await dragInColumn(page, root.locator('.mustry-sched-col').nth(0), 0.25, 0.5);
        await expect(root.locator('.mustry-sched-block')).toHaveCount(1);
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onScheduleSave created "E2E Temp"/)).toBeVisible();
        // The refetch delivers the new schedule, which stays selected.
        await expect(root.locator('.mustry-sched-item').filter({ hasText: 'E2E Temp' }))
            .toHaveCount(1, { timeout: 15_000 });
        await expect(root.locator('.mustry-sched-name-input')).toHaveValue('E2E Temp', { timeout: 15_000 });

        // Persisted: it survives a reload, block intact.
        await page.reload();
        const root2 = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root2.locator('.mustry-sched-item').filter({ hasText: 'E2E Temp' }).click();
        await expect(root2.locator('.mustry-sched-name-input')).toHaveValue('E2E Temp');
        await expect(root2.locator('.mustry-sched-block--editable')).toHaveCount(1);

        // Rename: edit the name field and save; oldName drives add-new + remove-old.
        await root2.locator('.mustry-sched-name-input').fill('E2E Temp Renamed');
        await root2.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onScheduleSave renamed "E2E Temp" -> "E2E Temp Renamed"/)).toBeVisible();
        await expect(root2.locator('.mustry-sched-item').filter({ hasText: 'E2E Temp Renamed' }))
            .toHaveCount(1, { timeout: 15_000 });

        // Delete (two-step) and confirm it leaves the gateway's list.
        await expect(root2.locator('.mustry-sched-name-input')).toHaveValue('E2E Temp Renamed', { timeout: 15_000 });
        const del = root2.locator('.mustry-sched-delete');
        await del.click();
        await del.click();
        await expect(page.getByText(/onScheduleDelete removed "E2E Temp Renamed"/)).toBeVisible();
        await expect(root2.locator('.mustry-sched-item').filter({ hasText: 'E2E Temp' }))
            .toHaveCount(0, { timeout: 15_000 });
    });

    test('deleting a schedule asks twice and fires onScheduleDelete', async ({ page }) => {
        const root = await openRoute(page, '/schedule', '.mustry-schedmgr');
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Night Shift' }).click();
        const del = root.locator('.mustry-sched-delete');
        await del.click();
        await expect(del).toHaveClass(/mustry-sched-delete--confirm/);
        await del.click();
        // The script reports the outcome either way; on a gateway where the
        // synthetic schedule was never saved, removeSchedule may legitimately
        // report a failure — the event contract is what this test pins.
        await expect(page.getByText(/onScheduleDelete /)).toBeVisible();
    });
});
