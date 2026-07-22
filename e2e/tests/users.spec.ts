import { test, expect, openRoute } from './helpers';

// User Manager: user-source CRUD against the live gateway. The /users demo
// binds the 'default' source (seeding the same demo users as /roster) and
// persists edits for real via the reference scripts.

test.describe('User Manager', () => {

    async function openPopulated(page: any) {
        const root = await openRoute(page, '/users', '.mustry-usermgr');
        await expect(root.locator('.mustry-sched-item').filter({ hasText: 'Jane Doe' }))
            .toHaveCount(1, { timeout: 15_000 });
        return root;
    }

    /**
     * Select a user and WAIT for their detail to render — selection round-trips
     * through the gateway, so reading the form before it settles would show the
     * previously selected user's values.
     */
    async function selectUser(root: any, displayText: string, username: string) {
        await root.locator('.mustry-sched-item').filter({ hasText: displayText }).click();
        await expect(root.locator('.mustry-roster-detail-head')).toContainText(username);
    }

    /** Delete a user through the UI when it exists (leftover cleanup). */
    async function deleteIfPresent(root: any, username: string) {
        const item = root.locator('.mustry-sched-item').filter({ hasText: username }).first();
        if (await item.count() === 0) {
            return;
        }
        await item.click();
        const del = root.locator('.mustry-sched-delete');
        await del.click();
        await del.click();
        await expect(root.locator('.mustry-sched-item').filter({ hasText: username }))
            .toHaveCount(0, { timeout: 15_000 });
    }

    test('renders the directory with names, roles and a working filter', async ({ page }) => {
        const root = await openPopulated(page);
        const items = root.locator('.mustry-sched-item');
        expect(await items.count()).toBeGreaterThanOrEqual(4); // admin + 3 seeded
        await root.locator('.mustry-users-filter').fill('vermeer');
        await expect(items).toHaveCount(1);
        await expect(items.first()).toContainText('Mia Vermeer');
        await root.locator('.mustry-users-filter').fill('');
        expect(await items.count()).toBeGreaterThanOrEqual(4);
    });

    test('editing contact info dirties the draft; Discard reverts', async ({ page }) => {
        const root = await openPopulated(page);
        await selectUser(root, 'Jane Doe', 'jdoe');
        await expect(root.locator('.mustry-users-contact-value')).toHaveValue('jane.doe@example.com');
        await root.locator('.mustry-users-add-contact:not(.mustry-users-add-adj)').click();
        await expect(root.locator('.mustry-users-contact-row')).toHaveCount(2);
        await expect(root.locator('.mustry-commit-badge')).toBeVisible();
        await expect(page.getByText(/^state\.selectedUser: /)).toContainText(/output\.isDirty: true/i);
        await root.locator('.mustry-commit-discard').click();
        await expect(root.locator('.mustry-users-contact-row')).toHaveCount(1);
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden();
    });

    test('role toggle persists to the gateway and restores', async ({ page }) => {
        const root = await openPopulated(page);
        await selectUser(root, 'Jane Doe', 'jdoe');
        const adminRole = root.locator('.mustry-sched-toggle').filter({ hasText: 'Administrator' }).locator('input');
        const wasChecked = await adminRole.isChecked();

        await adminRole.click();
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onUserSave persisted "jdoe"/)).toBeVisible();
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });
        await page.reload();
        const root2 = await openPopulated(page);
        await selectUser(root2, 'Jane Doe', 'jdoe');
        const adminRole2 = root2.locator('.mustry-sched-toggle').filter({ hasText: 'Administrator' }).locator('input');
        await expect(adminRole2).toBeChecked({ checked: !wasChecked });

        // Restore the original state so runs stay idempotent.
        await adminRole2.click();
        await root2.locator('.mustry-commit-save').click();
        await expect(root2.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });
    });

    test('create → persist (with password) → edit → delete lifecycle', async ({ page }) => {
        const root = await openPopulated(page);
        await deleteIfPresent(root, 'e2etemp');

        await root.locator('.mustry-sched-new').click();
        await expect(root.locator('.mustry-commit-save')).toBeDisabled();
        await root.locator('.mustry-sched-name-input').fill('e2etemp');
        await root.locator('.mustry-users-input').first().fill('Temp'); // first name
        await root.locator('.mustry-users-password').fill('E2E-Secr3t!');
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onUserSave persisted "e2etemp" \(isNew=True, password set\)/)).toBeVisible();
        await expect(root.locator('.mustry-sched-item').filter({ hasText: 'e2etemp' }))
            .toHaveCount(1, { timeout: 15_000 });

        // Persisted: survives a reload; edit the last name and save again.
        await page.reload();
        const root2 = await openPopulated(page);
        await selectUser(root2, 'e2etemp', 'e2etemp');
        const lastName = root2.locator('.mustry-users-field').filter({ hasText: 'Last name' }).locator('input');
        await lastName.fill('User');
        await root2.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onUserSave persisted "e2etemp" \(isNew=False\)/)).toBeVisible();
        await expect(root2.locator('.mustry-sched-item').filter({ hasText: 'Temp User' }))
            .toHaveCount(1, { timeout: 15_000 });

        await deleteIfPresent(root2, 'e2etemp');
        await expect(page.getByText(/onUserDelete removed "e2etemp"/)).toBeVisible();
    });

    /** In manage mode: delete a role when it exists (leftover cleanup). */
    async function deleteRoleIfPresent(page: any, root: any, role: string) {
        const row = root.locator('.mustry-users-role-row').filter({ hasText: role }).first();
        if (await row.count() === 0) {
            return;
        }
        await row.getByRole('button', { name: /Delete role/ }).click();
        await row.getByRole('button', { name: /Confirm/ }).click();
        await expect(page.getByText(new RegExp(`onRoleDelete removed "${role}"`))).toBeVisible();
        await expect(root.locator('.mustry-users-role-row').filter({ hasText: role }))
            .toHaveCount(0, { timeout: 15_000 });
    }

    test('role catalog: add → rename keeps assignments → delete', async ({ page }) => {
        const root = await openPopulated(page);
        await selectUser(root, 'Kiran Patel', 'kpatel');

        // Enter manage mode; self-heal leftovers from a previously failed run.
        await root.locator('.mustry-users-manage-btn').click();
        await deleteRoleIfPresent(page, root, 'E2E Role X');
        await deleteRoleIfPresent(page, root, 'E2E Role');
        await expect(root.getByText(/Security policies reference roles by name/)).toBeVisible();
        await root.locator('.mustry-users-role-input').last().fill('E2E Role');
        await root.getByRole('button', { name: '+ Add role' }).click();
        await expect(page.getByText(/onRoleSave added "E2E Role"/)).toBeVisible();
        // The refetched catalog lists it as a manage row.
        await expect(root.locator('.mustry-users-role-row').filter({ hasText: 'E2E Role' }))
            .toHaveCount(1, { timeout: 15_000 });

        // Leave manage mode. If the leftover cleanup deleted a role kpatel
        // still had assigned, the draft is now stale-dirty — resync it first.
        await root.locator('.mustry-users-manage-btn').click();
        if (await root.locator('.mustry-commit-discard').isVisible()) {
            await root.locator('.mustry-commit-discard').click();
        }
        await root.locator('.mustry-sched-toggle').filter({ hasText: 'E2E Role' }).locator('input').click();
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onUserSave persisted "kpatel"/)).toBeVisible();
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });

        // Rename the role; the assignment must survive (the source stores ids).
        await root.locator('.mustry-users-manage-btn').click();
        const row = root.locator('.mustry-users-role-row').filter({ hasText: 'E2E Role' });
        await row.getByRole('button', { name: /Rename/ }).click();
        await root.locator('.mustry-users-role-input').first().fill('E2E Role X');
        await root.getByRole('button', { name: '✓' }).click();
        await expect(page.getByText(/onRoleSave renamed "E2E Role" -> "E2E Role X"/)).toBeVisible();
        await root.locator('.mustry-users-manage-btn').click(); // done managing
        // The rename made the bound user data change under a clean-but-stale
        // draft, which reads as dirty (the component protects in-progress
        // edits); Discard resyncs from the refetched truth.
        await expect(root.locator('.mustry-commit-discard')).toBeVisible({ timeout: 15_000 });
        await root.locator('.mustry-commit-discard').click();
        await expect(root.locator('.mustry-sched-toggle').filter({ hasText: 'E2E Role X' }).locator('input'))
            .toBeChecked({ timeout: 15_000 });

        // Unassign, save, then delete the role from the catalog.
        await root.locator('.mustry-sched-toggle').filter({ hasText: 'E2E Role X' }).locator('input').click();
        await root.locator('.mustry-commit-save').click();
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });
        await root.locator('.mustry-users-manage-btn').click();
        const rowX = root.locator('.mustry-users-role-row').filter({ hasText: 'E2E Role X' });
        await rowX.getByRole('button', { name: /Delete role/ }).click();
        await rowX.getByRole('button', { name: /Confirm/ }).click();
        await expect(page.getByText(/onRoleDelete removed "E2E Role X"/)).toBeVisible();
        await expect(root.locator('.mustry-users-role-row').filter({ hasText: 'E2E Role X' }))
            .toHaveCount(0, { timeout: 15_000 });
    });

    test('availability adjustment round-trips to the gateway', async ({ page }) => {
        const root = await openPopulated(page);
        await selectUser(root, 'Mia Vermeer', 'mvermeer');

        // Self-heal: drop leftover adjustment rows from a failed run.
        while (await root.locator('.mustry-users-adj-row').count() > 0) {
            await root.locator('.mustry-users-adj-row .mustry-roster-remove').first().click();
        }
        if (await root.locator('.mustry-commit-badge').isVisible()) {
            await root.locator('.mustry-commit-save').click();
            await expect(root.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });
        }

        // A partially filled row blocks Save with the inline message.
        await root.getByRole('button', { name: '+ Add adjustment' }).click();
        await root.locator('.mustry-users-adj-note').fill('vacation');
        await expect(root.locator('.mustry-commit-save')).toBeDisabled();
        await expect(root.getByText('Both instants required, end after start')).toBeVisible();

        // Fill valid instants and save — the adjustment persists for real.
        await root.locator('.mustry-users-adj-instant input').nth(0).fill('2030-08-01T08:00');
        await root.locator('.mustry-users-adj-instant input').nth(1).fill('2030-08-05T17:00');
        await expect(root.locator('.mustry-commit-save')).toBeEnabled();
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onUserSave persisted "mvermeer"/)).toBeVisible();
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });

        await page.reload();
        const root2 = await openPopulated(page);
        await selectUser(root2, 'Mia Vermeer', 'mvermeer');
        await expect(root2.locator('.mustry-users-adj-row')).toHaveCount(1);
        await expect(root2.locator('.mustry-users-adj-note')).toHaveValue('vacation');
        await expect(root2.locator('.mustry-users-adj-instant input').nth(0)).toHaveValue('2030-08-01T08:00');

        // Restore: remove it and save so runs stay idempotent.
        await root2.locator('.mustry-users-adj-row .mustry-roster-remove').click();
        await root2.locator('.mustry-commit-save').click();
        await expect(root2.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });
    });

    test('the demo refuses to delete the Administrator role', async ({ page }) => {
        const root = await openPopulated(page);
        await selectUser(root, 'Jane Doe', 'jdoe');
        await root.locator('.mustry-users-manage-btn').click();
        const row = root.locator('.mustry-users-role-row').filter({ hasText: 'Administrator' });
        await row.getByRole('button', { name: /Delete role/ }).click();
        await row.getByRole('button', { name: /Confirm/ }).click();
        await expect(page.getByText(/onRoleDelete REFUSED/)).toBeVisible();
        await expect(root.locator('.mustry-users-role-row').filter({ hasText: 'Administrator' }))
            .toHaveCount(1, { timeout: 15_000 });
    });

    test('the demo refuses to delete the admin account', async ({ page }) => {
        const root = await openPopulated(page);
        await root.locator('.mustry-sched-item').filter({ hasText: 'admin' }).first().click();
        const del = root.locator('.mustry-sched-delete');
        await del.click();
        await del.click();
        await expect(page.getByText(/onUserDelete REFUSED/)).toBeVisible();
        await page.reload();
        const root2 = await openPopulated(page);
        await expect(root2.locator('.mustry-sched-item').filter({ hasText: 'admin' }).first()).toBeVisible();
    });
});
