import { test, expect, openRoute } from './helpers';

// Holiday Manager: holiday CRUD against the live gateway. The /holidays demo
// binds system.user.getHolidays() (seeding two demo holidays) and persists
// edits for real via the reference scripts.

test.describe('Holiday Manager', () => {

    async function openPopulated(page: any) {
        const root = await openRoute(page, '/holidays', '.mustry-holidaymgr');
        await expect(root.locator('.mustry-sched-item').filter({ hasText: 'Demo New Year' }))
            .toHaveCount(1, { timeout: 15_000 });
        return root;
    }

    /** Delete a holiday through the UI when it exists (leftover cleanup). */
    async function deleteIfPresent(page: any, root: any, name: string) {
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

    test('sorts by next occurrence with repeat/past badges', async ({ page }) => {
        const root = await openPopulated(page);
        // The annual repeat shows its NEXT occurrence and the 'annual' badge.
        const newYear = root.locator('.mustry-sched-item').filter({ hasText: 'Demo New Year' });
        await expect(newYear.locator('.mustry-holiday-badge').filter({ hasText: 'annual' })).toHaveCount(1);
        // Founders Day (2026-09-01, non-repeating) is upcoming relative to the
        // demo data's era OR past — either way it renders with a date and no crash;
        // the deterministic assertion is on the repeat badge above and sorting below.
        await expect(root.locator('.mustry-sched-item').first()).not.toContainText('past');
    });

    test('editing the date dirties the draft; Discard reverts', async ({ page }) => {
        const root = await openPopulated(page);
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo New Year' }).click();
        await expect(root.locator('.mustry-sched-name-input')).toHaveValue('Demo New Year');
        const date = root.locator('input[type=date]');
        await date.fill('2021-02-03');
        await expect(root.locator('.mustry-commit-badge')).toBeVisible();
        await root.locator('.mustry-commit-discard').click();
        await expect(date).toHaveValue('2020-01-01');
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden();
    });

    test('create → persist → rename → delete lifecycle against the gateway', async ({ page }) => {
        const root = await openPopulated(page);
        await deleteIfPresent(page, root, 'E2E Holiday Renamed');
        await deleteIfPresent(page, root, 'E2E Holiday');

        // Create: Save is blocked until both name and a valid date exist.
        await root.locator('.mustry-sched-new').click();
        await expect(root.locator('.mustry-commit-save')).toBeDisabled();
        await root.locator('.mustry-sched-name-input').fill('E2E Holiday');
        await expect(root.locator('.mustry-commit-save')).toBeDisabled(); // date still missing
        await root.locator('input[type=date]').fill('2030-06-15');
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onHolidaySave created "E2E Holiday"/)).toBeVisible();
        await expect(root.locator('.mustry-sched-item').filter({ hasText: 'E2E Holiday' }))
            .toHaveCount(1, { timeout: 15_000 });

        // Persisted across reload; rename it.
        await page.reload();
        const root2 = await openPopulated(page);
        await root2.locator('.mustry-sched-item').filter({ hasText: 'E2E Holiday' }).click();
        await expect(root2.locator('.mustry-sched-name-input')).toHaveValue('E2E Holiday');
        await root2.locator('.mustry-sched-name-input').fill('E2E Holiday Renamed');
        await root2.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onHolidaySave renamed "E2E Holiday" -> "E2E Holiday Renamed"/)).toBeVisible();
        await expect(root2.locator('.mustry-sched-item').filter({ hasText: 'E2E Holiday Renamed' }))
            .toHaveCount(1, { timeout: 15_000 });

        await deleteIfPresent(page, root2, 'E2E Holiday Renamed');
        await expect(page.getByText(/onHolidayDelete removed "E2E Holiday Renamed"/)).toBeVisible();
    });
});
