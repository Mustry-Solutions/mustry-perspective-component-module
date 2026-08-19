import { Page } from '@playwright/test';
import { test, expect } from './helpers';

/**
 * Smoke tour of the SALES DEMO project (ops/demo/project — "Mustry Bottling
 * Co."). Each page must mount its component and show its seeded story data;
 * the console-error fixture from helpers applies, so any session error fails.
 *
 * The demo seeds session.custom.demo relative to "today" from the docked Nav
 * view, so asserting on seeded content (e.g. a brew order title) verifies the
 * whole pipeline: session-props resource → seeder transform → bindings.
 */
const SESSION = '/data/perspective/client/demo';

async function openDemo(page: Page, route: string, rootSelector: string) {
    await page.goto(`${SESSION}${route}`);
    const root = page.locator(rootSelector).first();
    const trial = page.getByText('Trial Expired');
    await expect(root.or(trial).first()).toBeVisible({ timeout: 30_000 });
    if (await trial.isVisible().catch(() => false)) {
        throw new Error(
            'Perspective trial expired: run ops/demo.sh --fresh (or ops/e2e.sh --fresh), then re-run.'
        );
    }
    await expect(root).toBeVisible();
    await expect(page.locator('.connection-banner.banner-active')).toHaveCount(0, { timeout: 30_000 });
    return root;
}

test('demo overview: nav bar, KPI cards and the live plant floor', async ({ page }) => {
    await openDemo(page, '/', '.mustry-panzoom');
    // Docked nav (brand + pages) renders on every route.
    await expect(page.getByText('MUSTRY BOTTLING CO.', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset demo' })).toBeVisible();
    // KPI row + the embedded PlantLayout view inside the pan & zoom.
    await expect(page.getByText('OEE — PLANT')).toBeVisible();
    await expect(page.getByText('PLANT FLOOR', { exact: false }).first()).toBeVisible();
    await expect(page.locator('.mustry-pz-zoom-badge')).toHaveText(/%$/);
});

test('demo schedule: timeline mounts with seeded production orders', async ({ page }) => {
    await openDemo(page, '/schedule', '.mustry-timeline');
    // Seeded relative to today, so today's day window must show these bars.
    await expect(page.getByText('Brew 4711 - Pils').first()).toBeVisible();
    await expect(page.locator('.mustry-tml-label--group').first()).toBeVisible();
});

test('demo maintenance: calendar mounts with the seeded PM work order', async ({ page }) => {
    await openDemo(page, '/maintenance', '.mustry-calendar');
    // Seeded ON today, so it is in the current month view regardless of date.
    await expect(page.getByText('PM - Filler 2 bearing swap').first()).toBeVisible();
});

test('demo quality: grid shows windowed samples and the live picker', async ({ page }) => {
    await openDemo(page, '/quality', '.mustry-datagrid');
    // Popover display mode renders the trigger field, not the inline panel.
    await expect(page.locator('.mustry-dtrp-trigger-root').first()).toBeVisible();
    // Seeded samples inside the default 24h window.
    await expect(page.getByText('Pils 33cl').first()).toBeVisible();
    // avg aggregate footer over Fill (ml).
    await expect(page.locator('.mustry-dg-foot').first()).toBeVisible();
});

test('demo triage: decision tree renders and node click loads the SOP', async ({ page }) => {
    await openDemo(page, '/triage', '.mustry-branching');
    await expect(page.locator('.mustry-branch-node')).toHaveCount(10);
    await page.getByText('Clear jam', { exact: false }).first().click();
    await expect(page.getByText('LOCK-OUT / TAG-OUT', { exact: false })).toBeVisible();
});

test('demo handover: editor and display instance share the seeded note', async ({ page }) => {
    await openDemo(page, '/handover', '.mustry-rte');
    // The heading exists in BOTH the editor and the display-mode instance.
    await expect(page.getByText('Shift handover - Early to Late')).toHaveCount(2);
    await expect(page.locator('.mustry-kbd--numpad').first()).toBeVisible();
});

test('demo triage: escalate creates a WO on the schedule board (cross-component)', async ({ page }) => {
    await openDemo(page, '/triage', '.mustry-branching');
    await page.getByRole('button', { name: 'Escalate → create work order' }).click();
    await expect(page.getByText('created - now on the Schedule board', { exact: false })).toBeVisible();
    // Same session, other page: the WO must be on the timeline's Maintenance row.
    await openDemo(page, '/schedule', '.mustry-timeline');
    await expect(page.getByText('Downtime escalation', { exact: false }).first()).toBeVisible();
});

test('demo nav: language switcher relocalizes the components', async ({ page }) => {
    await openDemo(page, '/maintenance', '.mustry-calendar');
    await expect(page.getByText('Today', { exact: true })).toBeVisible();
    // The Nav dropdown writes session.custom.demo.locale; every component
    // binds config.locale to it.
    await page.locator('.ia_dropdown').first().click();
    await page.getByText('FR', { exact: true }).click();
    await expect(page.getByText("Aujourd'hui", { exact: true })).toBeVisible();
});

test('demo quality: batch toggle switches the grid edit mode', async ({ page }) => {
    await openDemo(page, '/quality', '.mustry-datagrid');
    const toggle = page.getByRole('button', { name: 'Batch edit: OFF' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Batch edit: ON' })).toBeVisible();
});

test('demo admin: all four managers plus the Line config tab', async ({ page }) => {
    await openDemo(page, '/admin', '.mustry-schedmgr');
    for (const tab of ['Rosters', 'Users', 'Holidays', 'Line config']) {
        await page.getByText(tab, { exact: true }).first().click();
    }
    // The seeded JSON document must parse: the validity readout is green.
    await expect(page.locator('.mustry-code').first()).toBeVisible();
    await expect(page.getByText('✓ Valid JSON')).toBeVisible();
});
