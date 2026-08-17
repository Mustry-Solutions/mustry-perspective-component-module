import { test, expect, openRoute } from './helpers';

// Main view: the picker in three layouts (oneMonth / compact / twoMonths),
// a popover instance, and live output readouts bound to the demo instance.
test('picker: all layouts render', async ({ page }) => {
    await openRoute(page, '/', '.mustry-datetime-range-picker');
    await expect(page.locator('.mustry-datetime-range-picker')).toHaveCount(3);
    await expect(page.locator('.mustry-dtrp-trigger-root')).toBeVisible();
    // Preset rows on the demo instance prove labels/config made it through props.
    await expect(page.locator('.mustry-dtrp-preset').first()).toBeVisible();
});

test('picker: preset click arms the realtime window (two-way state)', async ({ page }) => {
    await openRoute(page, '/', '.mustry-datetime-range-picker');
    // Scope to the Demo instance (first in the view): since disableDates
    // defaults to 'none', the unconfigured instances also label their presets
    // "Last …" (backward) instead of the old forward-mode "Next …".
    await page.locator('.mustry-datetime-range-picker').first()
        .getByText('Last 7 days', { exact: true }).click();
    // The view binds labels to the component's output props; "7 days" +
    // isRealtime true proves the write-back reached the Perspective store.
    await expect(page.getByText('7 days', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('true', { exact: true })).toBeVisible();
});
