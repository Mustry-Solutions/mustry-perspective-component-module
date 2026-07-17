import { test, expect, openRoute } from './helpers';

// The RteDemo view: an edit-mode instance whose onSave writes back to the
// shared view.custom.doc, and a display-mode instance bound to the same value.
// Together they exercise the full controlled loop: type -> dirty -> Save ->
// onSave -> write-back -> binding round-trip -> clean + display update.

test('richtext: edit and display render the bound document', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    await expect(page.locator('.mustry-rte')).toHaveCount(2);
    // Both instances show the seeded content.
    await expect(page.locator('.mustry-rte .ProseMirror').first()).toContainText('Pump P-101 weekly check');
    await expect(page.locator('.mustry-rte--display')).toContainText('Pump P-101 weekly check');
    // The display instance renders the seeded bold mark as real markup.
    await expect(page.locator('.mustry-rte--display strong')).toContainText('read before starting');
});

test('richtext: typing dirties, Save writes back, display updates', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End').catch(() => undefined);
    await editor.pressSequentially(' Wear gloves.');

    // Dirty badge + Save appear; the display instance does NOT have the text yet.
    await expect(page.locator('.mustry-rte-dirty-badge')).toBeVisible();
    await expect(page.locator('.mustry-rte--display')).not.toContainText('Wear gloves.');

    await page.locator('.mustry-rte-save-btn').click();
    // Write-back round-trip: badge clears, display now shows the addition.
    await expect(page.locator('.mustry-rte-dirty-badge')).toHaveCount(0);
    await expect(page.locator('.mustry-rte--display')).toContainText('Wear gloves.');
});

test('richtext: toolbar formatting produces real markup end-to-end', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.locator('.mustry-rte-btn[aria-label="Italic"]').click();
    await expect(page.locator('.mustry-rte-btn[aria-label="Italic"]')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.mustry-rte-save-btn').click();
    await expect(page.locator('.mustry-rte--display em').first()).toBeVisible();
});

test('richtext: discard reverts the draft', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.click();
    await editor.pressSequentially('TEMPORARY');
    await expect(page.locator('.mustry-rte-dirty-badge')).toBeVisible();

    await page.locator('.mustry-rte-discard-btn').click();
    await expect(page.locator('.mustry-rte-dirty-badge')).toHaveCount(0);
    await expect(editor).not.toContainText('TEMPORARY');
});
