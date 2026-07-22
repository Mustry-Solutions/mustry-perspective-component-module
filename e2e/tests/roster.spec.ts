import { test, expect, openRoute } from './helpers';

// Roster Manager: ordered escalation list against the live gateway. The
// /roster demo binds system.roster + the default user source (seeding three
// demo users) and persists edits for real via the reference scripts.

test.describe('Roster Manager', () => {

    /** Wait for the list to be populated (the data binding is async). */
    async function openPopulated(page: any) {
        const root = await openRoute(page, '/roster', '.mustry-rostermgr');
        await expect(root.locator('.mustry-sched-item').filter({ hasText: 'Demo Escalation' }))
            .toHaveCount(1, { timeout: 15_000 });
        return root;
    }

    /** Delete a roster through the UI when it exists (leftover cleanup). */
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

    test('renders the escalation order with names, ordinals and contact warnings', async ({ page }) => {
        const root = await openPopulated(page);
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Escalation' }).click();
        const rows = root.locator('.mustry-roster-row');
        await expect(rows).toHaveCount(3);
        // Ordinals are the escalation sequence; the directory resolves names.
        await expect(rows.nth(0)).toContainText('Contact 1');
        await expect(rows.nth(0)).toContainText('Jane Doe');
        await expect(rows.nth(0)).toContainText('email: jane.doe@example.com');
        await expect(rows.nth(1)).toContainText('Mia Vermeer');
        // admin has no contact info → the warning shows on exactly that row.
        await expect(rows.nth(2).locator('.mustry-roster-warn')).toBeVisible();
        await expect(rows.nth(0).locator('.mustry-roster-warn')).toHaveCount(0);
    });

    test('picker adds a user, dirty badge shows, Discard reverts', async ({ page }) => {
        const root = await openPopulated(page);
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Escalation' }).click();
        await root.locator('.mustry-roster-add').click();
        const picker = root.locator('.mustry-roster-picker');
        await picker.locator('.mustry-roster-picker-search').fill('kiran');
        await picker.locator('.mustry-roster-picker-item').filter({ hasText: 'Kiran Patel' }).click();
        const rows = root.locator('.mustry-roster-row');
        await expect(rows).toHaveCount(4);
        await expect(rows.nth(3)).toContainText('Contact 4');
        await expect(rows.nth(3).locator('.mustry-roster-warn')).toBeVisible(); // kpatel: no contact
        await expect(root.locator('.mustry-commit-badge')).toBeVisible();
        await root.locator('.mustry-commit-discard').click();
        await expect(rows).toHaveCount(3);
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden();
    });

    test('drag-to-reorder persists to the gateway and restores', async ({ page }) => {
        const root = await openPopulated(page);
        await root.locator('.mustry-sched-item').filter({ hasText: 'Demo Escalation' }).click();
        const rows = root.locator('.mustry-roster-row');
        await expect(rows.nth(0)).toContainText('Jane Doe');

        // Drag row 0's grip down one row: Jane and Mia swap.
        const grip = rows.nth(0).locator('.mustry-roster-grip');
        const box = (await grip.boundingBox())!;
        const rowBox = (await rows.nth(0).boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + rowBox.height * 1.1, { steps: 5 });
        await page.mouse.up();
        await expect(rows.nth(0)).toContainText('Mia Vermeer');
        await expect(rows.nth(1)).toContainText('Jane Doe');

        // Save → the roster now REALLY exists on the gateway in this order.
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onRosterSave persisted "Demo Escalation"/)).toBeVisible();
        await expect(root.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });
        await page.reload();
        const root2 = await openPopulated(page);
        await root2.locator('.mustry-sched-item').filter({ hasText: 'Demo Escalation' }).click();
        const rows2 = root2.locator('.mustry-roster-row');
        await expect(rows2.nth(0)).toContainText('Mia Vermeer');

        // Restore the canonical order (Jane first) so runs stay idempotent.
        const grip2 = rows2.nth(0).locator('.mustry-roster-grip');
        const box2 = (await grip2.boundingBox())!;
        const rowBox2 = (await rows2.nth(0).boundingBox())!;
        await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
        await page.mouse.down();
        await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2 + rowBox2.height * 1.1, { steps: 5 });
        await page.mouse.up();
        await expect(rows2.nth(0)).toContainText('Jane Doe');
        await root2.locator('.mustry-commit-save').click();
        await expect(root2.locator('.mustry-commit-badge').first()).toBeHidden({ timeout: 15_000 });
    });

    test('create → persist → delete lifecycle against the gateway', async ({ page }) => {
        const root = await openPopulated(page);
        await deleteIfPresent(root, 'E2E Roster');

        await root.locator('.mustry-sched-new').click();
        await expect(root.locator('.mustry-commit-save')).toBeDisabled();
        await root.locator('.mustry-sched-name-input').fill('E2E Roster');
        await root.locator('.mustry-roster-add').click();
        await root.locator('.mustry-roster-picker-item').filter({ hasText: 'admin' }).click();
        await expect(root.locator('.mustry-roster-row')).toHaveCount(1);
        await root.locator('.mustry-commit-save').click();
        await expect(page.getByText(/onRosterSave persisted "E2E Roster" \(1 users, isNew=True\)/)).toBeVisible();
        await expect(root.locator('.mustry-sched-item').filter({ hasText: 'E2E Roster' }))
            .toHaveCount(1, { timeout: 15_000 });

        // Persisted: survives a reload; then delete and confirm it's gone.
        await page.reload();
        const root2 = await openPopulated(page);
        await expect(root2.locator('.mustry-sched-item').filter({ hasText: 'E2E Roster' })).toHaveCount(1);
        await deleteIfPresent(root2, 'E2E Roster');
        await expect(page.getByText(/onRosterDelete removed "E2E Roster"/)).toBeVisible();
    });
});
