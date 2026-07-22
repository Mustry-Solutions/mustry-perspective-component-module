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
        await root.locator('.mustry-users-add-contact').click();
        await expect(root.locator('.mustry-users-contact-row')).toHaveCount(2);
        await expect(root.locator('.mustry-commit-badge')).toBeVisible();
        await expect(page.getByText(/^state\.selectedUser: /)).toContainText(/output\.isDirty: true/i);
        await root.locator('.mustry-commit-discard').click();
        await expect(root.locator('.mustry-users-contact-row')).toHaveCount(1);
        await expect(root.locator('.mustry-commit-badge')).toHaveCount(0);
    });

    test('role toggle persists to the gateway and restores', async ({ page }) => {
        const root = await openPopulated(page);
        await selectUser(root, 'Jane Doe', 'jdoe');
        const adminRole = root.locator('.mustry-sched-toggle').filter({ hasText: 'Administrator' }).locator('input');
        const wasChecked = await adminRole.isChecked();

        await adminRole.click();
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onUserSave persisted "jdoe"/)).toBeVisible();
        await expect(root.locator('.mustry-commit-badge')).toHaveCount(0, { timeout: 15_000 });
        await page.reload();
        const root2 = await openPopulated(page);
        await selectUser(root2, 'Jane Doe', 'jdoe');
        const adminRole2 = root2.locator('.mustry-sched-toggle').filter({ hasText: 'Administrator' }).locator('input');
        await expect(adminRole2).toBeChecked({ checked: !wasChecked });

        // Restore the original state so runs stay idempotent.
        await adminRole2.click();
        await root2.locator('.mustry-commit-save').click();
        await expect(root2.locator('.mustry-commit-badge')).toHaveCount(0, { timeout: 15_000 });
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
