import { test, expect, openRoute } from './helpers';

// The KeyboardDemo view: a numeric keypad (value.value, 0-100 psi, 1 decimal,
// enforceRange) and a QWERTY text keyboard (value.text). onCommit persists;
// readouts are bound to each keyboard's output.*. Both displays are <div>s.
type Page = import('@playwright/test').Page;
const numKey = (p: Page, name: string) => p.locator('.mustry-kbd--numpad').getByRole('button', { name, exact: true });
const numValue = (p: Page) => p.locator('.mustry-kbd--numpad .mustry-kbd-value');
const txtKey = (p: Page, name: string) => p.locator('.mustry-kbd--text').getByRole('button', { name, exact: true });
const txtValue = (p: Page) => p.locator('.mustry-kbd--text .mustry-kbd-value');

test('keyboard: both layouts render; the displays are divs, not inputs', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    await expect(page.locator('.mustry-keyboard')).toHaveCount(2);
    await expect(page.locator('.mustry-keyboard input')).toHaveCount(0);
    await expect(numKey(page, '7')).toBeVisible();
    await expect(txtKey(page, 'q')).toBeVisible();
});

test('numpad: typing builds a draft and Enter commits (write-back + onCommit)', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    for (const k of ['4', '2', '.', '5']) {
        await numKey(page, k).click();
    }
    await expect(numValue(page)).toHaveText('42.5 psi');
    await numKey(page, 'Enter').click();
    await expect(page.getByText('value: 42.5')).toBeVisible();
    await expect(page.getByText(/numpad onCommit value=42.5/)).toBeVisible();
});

test('numpad: over-max shows the out-of-range badge, Enter clamps', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    for (const k of ['1', '5', '0']) {
        await numKey(page, k).click();
    }
    await expect(page.getByText('Out of range')).toBeVisible();
    await numKey(page, 'Enter').click();
    await expect(page.getByText('value: 100')).toBeVisible();
});

test('numpad: decimal places are capped at config.decimals', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    for (const k of ['1', '.', '2', '3']) {
        await numKey(page, k).click();
    }
    await expect(numValue(page)).toHaveText('1.2 psi');
});

test('numpad: Clear empties the draft', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    for (const k of ['9', '9']) {
        await numKey(page, k).click();
    }
    await expect(numValue(page)).toHaveText('99 psi');
    await numKey(page, 'Clear').click();
    await expect(numValue(page)).toHaveText('psi');
});

test('text: shift types one upper-case letter then resets, Enter commits value.text', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    await txtKey(page, '⇧').click();          // shift on
    await txtKey(page, 'H').click();          // upper-case H (shift consumed)
    await txtKey(page, 'i').click();          // back to lower-case
    await expect(txtValue(page)).toHaveText('Hi');
    await txtKey(page, 'Enter').click();
    await expect(page.getByText('text: "Hi"')).toBeVisible();
    await expect(page.getByText(/text onCommit value="Hi"/)).toBeVisible();
});

test('text: the ?123 key switches to the symbols layer', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    await txtKey(page, '?123').click();
    await expect(txtKey(page, '1')).toBeVisible();
    await expect(txtKey(page, 'ABC')).toBeVisible();   // switch back is available
});

test('popover: tapping the field opens the keyboard; Enter commits and closes', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    await page.locator('.mustry-kbd-trigger').click();
    const panel = page.locator('.mustry-kbd-popover');
    await expect(panel).toBeVisible();
    // The portalled panel keeps its theme vars (the color-picker lesson): the
    // accent Enter key must have a real, non-transparent background.
    await expect(panel.locator('.mustry-kbd-key--enter'))
        .not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    await panel.getByRole('button', { name: 'a', exact: true }).click();
    await panel.getByRole('button', { name: 'b', exact: true }).click();
    await panel.getByRole('button', { name: 'Enter', exact: true }).click();

    // Enter commits value.text and closes the popover.
    await expect(panel).toHaveCount(0);
    await expect(page.locator('.mustry-kbd-trigger .mustry-kbd-trigger-text')).toContainText('ab');
    await expect(page.getByText(/popover onCommit value="[^"]*ab"/)).toBeVisible();
});
