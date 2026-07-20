import { test, expect, openRoute } from './helpers';

// The KeyboardDemo view: a numeric keypad editing view.custom.setpoint (0-100
// psi, 1 decimal, enforceRange). onCommit persists; a readout is bound to the
// keypad's output.* props. The value display is a <div>, not an <input>.

const key = (page: import('@playwright/test').Page, name: string) =>
    page.locator('.mustry-keyboard').getByRole('button', { name, exact: true });

test('keyboard: keypad, display and keys render', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    await expect(page.locator('.mustry-kbd-display')).toBeVisible();
    // The value surface is a div (role=textbox), never an <input>.
    await expect(page.locator('.mustry-keyboard input')).toHaveCount(0);
    await expect(key(page, '7')).toBeVisible();
    await expect(key(page, 'Enter')).toBeVisible();
});

test('keyboard: typing builds a draft and Enter commits (write-back + onCommit)', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    for (const k of ['4', '2', '.', '5']) {
        await key(page, k).click();
    }
    // While editing, the display shows the draft + units.
    await expect(page.locator('.mustry-kbd-value')).toHaveText('42.5 psi');

    await key(page, 'Enter').click();
    // The readout is bound to output.*, proving the write-back reached the store.
    await expect(page.getByText('output.value: 42.5')).toBeVisible();
    await expect(page.getByText(/onCommit value=42.5/)).toBeVisible();
});

test('keyboard: over-max shows the out-of-range badge, Enter clamps', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    for (const k of ['1', '5', '0']) {
        await key(page, k).click();
    }
    // 150 > max 100 while typing — warn before commit.
    await expect(page.getByText('Out of range')).toBeVisible();

    await key(page, 'Enter').click();
    // enforceRange clamps the committed value to 100.
    await expect(page.getByText('output.value: 100')).toBeVisible();
    await expect(page.getByText('output.isValid: True')).toBeVisible();
});

test('keyboard: decimal places are capped at config.decimals', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    for (const k of ['1', '.', '2', '3']) {
        await key(page, k).click();
    }
    // decimals: 1 — the trailing '3' is ignored.
    await expect(page.locator('.mustry-kbd-value')).toHaveText('1.2 psi');
});

test('keyboard: Clear empties the draft', async ({ page }) => {
    await openRoute(page, '/keyboard', '.mustry-keyboard');
    for (const k of ['9', '9']) {
        await key(page, k).click();
    }
    await expect(page.locator('.mustry-kbd-value')).toHaveText('99 psi');
    await key(page, 'Clear').click();
    await expect(page.locator('.mustry-kbd-value')).toHaveText('psi');
});
