import { test, expect, openRoute } from './helpers';

// The ToastDemo view: buttons that call system.mustry.toast() from component
// scripts, from a gateway background thread (with and without explicit
// session/page ids) and with invalid input. The view holds only standard
// Perspective components, so a rendered toast also proves the toast bundle
// loads on a page without any Mustry component.

const toasts = '.mustry-toasts .mustry-toast';

test('toast: the four types render top-right with role, title and message', async ({ page }) => {
    await openRoute(page, '/toast', '.ia_button--primary, button');
    expect(await page.locator('[data-component^="mustrysolutions"]').count()).toBe(0);

    for (const type of ['info', 'success', 'warning', 'error']) {
        await page.getByRole('button', { name: `Show ${type}`, exact: true }).click();
        await expect(page.locator(`.mustry-toast--${type}`)).toHaveCount(1);
    }
    await expect(page.getByText('sent to 1 page(s)')).toBeVisible();

    await expect(page.locator('.mustry-toast--error')).toHaveAttribute('role', 'alert');
    await expect(page.locator('.mustry-toast--warning')).toHaveAttribute('role', 'alert');
    await expect(page.locator('.mustry-toast--success')).toHaveAttribute('role', 'status');
    await expect(page.locator('.mustry-toast--success .mustry-toast__title')).toHaveText('Saved');
    await expect(page.locator('.mustry-toast--success .mustry-toast__message')).toHaveText('Order 1042 was saved.');
    // Line breaks in the message survive (white-space: pre-line).
    await expect(page.locator('.mustry-toast--error .mustry-toast__message'))
        .toHaveText('Traceback (most recent call last):\nValueError: broken');

    // Stacked in the top-right corner, newest last.
    const region = (await page.locator('.mustry-toasts').boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(viewport.width - (region.x + region.width)).toBeLessThan(40);
    expect(region.y).toBeLessThan(40);
    await expect(page.locator(toasts).last()).toHaveClass(/mustry-toast--error/);
});

test('toast: title and message are text, never HTML', async ({ page }) => {
    await openRoute(page, '/toast', 'button');
    await page.getByRole('button', { name: 'Show markup as text' }).click();
    const message = page.locator('.mustry-toast .mustry-toast__message');
    await expect(message).toHaveText('<b>not bold</b> <img src=x onerror=alert(1)>');
    await expect(page.locator('.mustry-toast b, .mustry-toast__message img')).toHaveCount(0);
});

test('toast: closes by button, by Escape and after its duration', async ({ page }) => {
    await openRoute(page, '/toast', 'button');

    await page.getByRole('button', { name: 'Show sticky toast' }).click();
    const sticky = page.locator('.mustry-toast.demo-sticky');
    await expect(sticky).toHaveCount(1);
    await expect(sticky.locator('.mustry-toast__progress')).toHaveCount(0);
    await sticky.getByRole('button', { name: 'Close notification' }).click();
    await expect(sticky).toHaveCount(0);

    await page.getByRole('button', { name: 'Show sticky toast' }).click();
    await page.locator('.mustry-toast.demo-sticky .mustry-toast__close').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mustry-toast.demo-sticky')).toHaveCount(0);

    await page.getByRole('button', { name: 'Show 1 s toast' }).click();
    const short = page.locator('.mustry-toast', { hasText: 'Closes after one second.' });
    await expect(short).toHaveCount(1);
    await page.mouse.move(5, 5);
    await expect(short).toHaveCount(0, { timeout: 5_000 });
});

test('toast: keeps at most five toasts, dropping the oldest', async ({ page }) => {
    await openRoute(page, '/toast', 'button');
    const info = page.getByRole('button', { name: 'Show info', exact: true });
    const error = page.getByRole('button', { name: 'Show error', exact: true });
    await info.click();
    await expect(page.locator(toasts)).toHaveCount(1);
    for (let i = 0; i < 5; i++) {
        await error.click();
        await expect(page.locator('.mustry-toast--error')).toHaveCount(i + 1);
    }
    await expect(page.locator(toasts)).toHaveCount(5);
    await expect(page.locator('.mustry-toast--info')).toHaveCount(0);
});

test('toast: a gateway thread reaches the page with explicit ids, and fails clearly without', async ({ page }) => {
    await openRoute(page, '/toast', 'button');

    await page.getByRole('button', { name: 'Gateway thread with ids' }).click();
    await expect(page.getByText('gateway thread: sent to 1 page(s)')).toBeVisible();
    await expect(page.locator('.mustry-toast--success', { hasText: 'Sent from a background thread.' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Gateway thread without ids' }).click();
    await expect(page.getByText(/gateway thread error: .*pass sessionId/)).toBeVisible();
});

test('toast: an unknown type raises an error in the calling script', async ({ page }) => {
    await openRoute(page, '/toast', 'button');
    await page.getByRole('button', { name: 'Unknown type' }).click();
    await expect(page.getByText(/error: .*Unknown toast type 'nope'/)).toBeVisible();
    await expect(page.locator(toasts)).toHaveCount(0);
});

test('toast: follows the theme (light and dark backgrounds differ)', async ({ page }) => {
    await openRoute(page, '/toast', 'button');
    const background = async (): Promise<string> => {
        await page.getByRole('button', { name: 'Show info', exact: true }).click();
        const toast = page.locator('.mustry-toast--info').last();
        await expect(toast).toBeVisible();
        const value = await toast.evaluate((el) => getComputedStyle(el).backgroundColor);
        await toast.getByRole('button', { name: 'Close notification' }).click();
        return value;
    };

    await page.getByRole('button', { name: 'Light theme' }).click();
    await page.waitForTimeout(1_000);
    const light = await background();
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await page.waitForTimeout(1_000);
    const dark = await background();
    expect(dark).not.toBe(light);
});
