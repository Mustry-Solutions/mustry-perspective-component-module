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
    await expect(page.locator('.mustry-commit-badge')).toBeVisible();
    await expect(page.locator('.mustry-rte--display')).not.toContainText('Wear gloves.');

    await page.locator('.mustry-commit-save').click();
    // Write-back round-trip: badge clears, display now shows the addition.
    await expect(page.locator('.mustry-commit-badge').first()).toBeHidden();
    await expect(page.locator('.mustry-rte--display')).toContainText('Wear gloves.');
});

test('richtext: toolbar formatting produces real markup end-to-end', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    // Select the intro paragraph (triple click — Perspective's session-level
    // keyboard handling intercepts select-all, so Ctrl/Cmd+A is unreliable here).
    await editor.getByText('read before starting').click({ clickCount: 3 });
    await page.locator('.mustry-rte-btn[aria-label="Italic"]').click();
    await expect(page.locator('.mustry-rte-btn[aria-label="Italic"]')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.mustry-commit-save').click();
    await expect(page.locator('.mustry-rte--display em').first()).toBeVisible();
});

test('richtext: discard reverts the draft', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.click();
    await editor.pressSequentially('TEMPORARY');
    await expect(page.locator('.mustry-commit-badge')).toBeVisible();

    await page.locator('.mustry-commit-discard').click();
    await expect(page.locator('.mustry-commit-badge').first()).toBeHidden();
    await expect(editor).not.toContainText('TEMPORARY');
});

test('richtext: insert table, edit it, and see it in the display instance', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.click();
    await page.locator('.mustry-rte-btn[aria-label="Table"]').click();
    // Cursor lands inside the new table: the contextual buttons appear.
    await expect(page.locator('.mustry-rte-btn[aria-label="Add row"]')).toBeVisible();
    await editor.pressSequentially('Step');
    await page.locator('.mustry-rte-btn[aria-label="Add row"]').click();

    await page.locator('.mustry-commit-save').click();
    const displayTable = page.locator('.mustry-rte--display table');
    await expect(displayTable).toBeVisible();
    await expect(displayTable.locator('tr')).toHaveCount(4);   // 3 inserted (incl. header) + 1 added
    await expect(displayTable).toContainText('Step');
});

test('richtext: image by URL renders in both instances', async ({ page }) => {
    const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.click();
    await page.locator('.mustry-rte-btn[aria-label="Image"]').click();
    await page.locator('.mustry-rte-imageinput').fill(PIXEL);
    await page.locator('.mustry-rte-linkrow .mustry-rte-save-btn').click();
    await expect(page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror img')).toBeVisible();

    // The main Save button (the linkrow one is gone once the popover closes).
    await page.locator('.mustry-commit-save').click();
    await expect(page.locator('.mustry-rte--display img')).toBeVisible();
});

test('richtext: display-mode checklist toggle fires write-back (onTaskToggle)', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const displayBox = page.locator('.mustry-rte--display input[type="checkbox"]').first();
    await expect(displayBox).toBeVisible();
    await expect(displayBox).not.toBeChecked();

    await displayBox.click();
    await expect(displayBox).toBeChecked();
    // The onTaskToggle script persisted it; the EDIT instance (clean) follows
    // the bound change — proof the round-trip reached the shared value.
    await expect(page.locator('.mustry-rte:not(.mustry-rte--display) input[type="checkbox"]').first())
        .toBeChecked();
});

test('richtext: undo button reverts typing, redo restores it', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    const undoBtn = page.locator('.mustry-rte-btn[aria-label="Undo"]');
    await expect(undoBtn).toBeDisabled();

    await editor.click();
    await editor.pressSequentially('UNDOME');
    await expect(undoBtn).toBeEnabled();
    // TipTap groups rapid keystrokes into one history step per pause; click
    // until the word is gone (bounded).
    for (let i = 0; i < 10 && (await editor.textContent())?.includes('UNDOME'); i++) {
        await undoBtn.click();
    }
    await expect(editor).not.toContainText('UNDOME');

    const redoBtn = page.locator('.mustry-rte-btn[aria-label="Redo"]');
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();
    await expect(editor).toContainText('UNDOME');
});

test('richtext: image library picker inserts a known image', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.click();
    await page.locator('.mustry-rte-btn[aria-label="Image"]').click();
    await page.locator('.mustry-rte-imagepick').selectOption({ label: 'Demo pixel' });
    await expect(editor.locator('img')).toBeVisible();
});

test('richtext: font picker applies an allowlisted family end-to-end', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.getByText('read before starting').click({ clickCount: 3 });
    await page.locator('.mustry-rte-toolbar > .mustry-rte-select').selectOption('Courier New');

    await page.locator('.mustry-commit-save').click();
    const styled = page.locator('.mustry-rte--display [style*="Courier New"]').first();
    await expect(styled).toBeVisible();
});

// --- link URL policy (#76) -------------------------------------------------
// The controller hands `sanitizeUrl` to TipTap's Link extension. It used to do
// that via `validate`, which extension-link only forwards to `shouldAutoLink`
// when that option is unset — and it defaults to a function, so the forward
// never happened. Our policy was wired to nothing: both parsed hrefs and
// autolinks fell back to TipTap's own allowlist, which adds ftp, ftps, callto,
// sms, cid and xmpp to ours. Both tests below fail against that wiring, and
// neither can be expressed in the node-env jest suite, which has no DOM to
// mount TipTap in.

test('richtext: pasted HTML with a disallowed scheme keeps the text, drops the link', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.click();

    // Paste goes through ProseMirror's parseHTML — the path `isAllowedUri`
    // gates and `validate` never did.
    await editor.evaluate((el) => {
        const dt = new DataTransfer();
        dt.setData('text/html',
            '<p><a href="ftp://files.example/report.pdf">ftp doc</a> '
            + '<a href="https://example.com/ok">https doc</a></p>');
        el.dispatchEvent(new ClipboardEvent('paste', {
            clipboardData: dt, bubbles: true, cancelable: true
        }));
    });

    // Text survives either way; the mark is what must not.
    await expect(editor).toContainText('ftp doc');
    await expect(editor.locator('a[href^="ftp:"]')).toHaveCount(0);
    // The allowlisted sibling in the same paste still links, so this is the
    // policy at work and not the paste being dropped wholesale.
    await expect(editor.locator('a[href="https://example.com/ok"]')).toHaveCount(1);
});

test('richtext: typing a disallowed scheme does not autolink', async ({ page }) => {
    await openRoute(page, '/rte', '.mustry-rte');
    const editor = page.locator('.mustry-rte:not(.mustry-rte--display) .ProseMirror');
    await editor.click();
    await page.keyboard.press('End');

    // autolink fires on the word boundary after a URL-shaped token.
    await page.keyboard.type(' ftp://files.example/report.pdf ');
    await expect(editor.locator('a[href^="ftp:"]')).toHaveCount(0);

    // Same gesture with an allowlisted scheme still autolinks, so the
    // assertion above is the policy and not autolink being off.
    await page.keyboard.type('https://example.com/ok ');
    await expect(editor.locator('a[href^="https://example.com/ok"]')).toHaveCount(1);
});
