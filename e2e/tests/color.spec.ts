import { test, expect, openRoute } from './helpers';

// The ColorDemo view: an INLINE picker and a POPOVER picker, both editing the
// same view.custom.color via the controlled onChange-persist pattern; a preview
// box + readout are bound to the inline picker's output.* props. Tests avoid
// asserting the *initial* colour (custom.color is a persistent prop that earlier
// picks mutate) — they assert deltas or set their own colour.

test('color: all three presentations render with their surfaces', async ({ page }) => {
    await openRoute(page, '/color', '.mustry-colorpicker');
    // Three instances: v1 (button popover), v2 (swatch+code popover), v3 (inline).
    await expect(page.locator('.mustry-colorpicker')).toHaveCount(3);
    await expect(page.locator('.mustry-cp--popover')).toHaveCount(2);
    await expect(page.locator('.mustry-cp--inline')).toHaveCount(1);
    // The inline panel's three draggable surfaces.
    await expect(page.locator('.mustry-cp--inline .mustry-cp-sv')).toBeVisible();
    await expect(page.locator('.mustry-cp--inline .mustry-cp-hue')).toBeVisible();
    await expect(page.locator('.mustry-cp--inline .mustry-cp-alpha')).toBeVisible();
    // The bound swatch palette rendered its chips.
    await expect(page.locator('.mustry-cp--inline .mustry-cp-chip').first()).toBeVisible();
    // Every popover trigger carries the picker glyph (the click affordance), and
    // no panel is open yet.
    await expect(page.locator('.mustry-cp--popover .mustry-cp-swatch-pick')).toHaveCount(2);
    await expect(page.locator('.mustry-cp-popover')).toHaveCount(0);
});

test('color: clicking a swatch commits that colour to the bound value', async ({ page }) => {
    await openRoute(page, '/color', '.mustry-colorpicker');
    // Palette index 1 is #12b886 (green) — click it in the inline picker.
    await page.locator('.mustry-cp--inline .mustry-cp-chip').nth(1).click();
    // The readout is bound to the inline picker's output.rgb, proving the pick
    // reached the store and round-tripped through custom.color.
    await expect(page.getByText(/rgb: \(18, 184, 134\)/)).toBeVisible();
    await expect(page.locator('.mustry-cp--inline .mustry-cp-input')).toHaveValue('#12b886');
});

test('color: dragging the hue bar changes the committed value', async ({ page }) => {
    await openRoute(page, '/color', '.mustry-colorpicker');
    // Seed a known colour first so the drag has somewhere to move from.
    await page.locator('.mustry-cp--inline .mustry-cp-chip').nth(1).click(); // green
    const input = page.locator('.mustry-cp--inline .mustry-cp-input');
    const before = await input.inputValue();

    const hue = page.locator('.mustry-cp--inline .mustry-cp-hue');
    const box = (await hue.boundingBox())!;
    const cy = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 4, cy);
    await page.mouse.down();
    await page.mouse.move(box.x + 4, cy, { steps: 8 });
    await page.mouse.up();

    // Releasing the drag commits; the value must have moved off the seed.
    await expect(input).not.toHaveValue(before);
    await expect(page.getByText(/onChange \(v3 inline\) value=/)).toBeVisible();
});

test('color: the format toggle switches the input notation', async ({ page }) => {
    await openRoute(page, '/color', '.mustry-colorpicker');
    await page.locator('.mustry-cp--inline .mustry-cp-fmt-btn', { hasText: 'RGB' }).click();
    await expect(page.locator('.mustry-cp--inline .mustry-cp-input')).toHaveValue(/^rgba?\(/);
    await page.locator('.mustry-cp--inline .mustry-cp-fmt-btn', { hasText: 'HSL' }).click();
    await expect(page.locator('.mustry-cp--inline .mustry-cp-input')).toHaveValue(/^hsla?\(/);
});

test('color: typing an invalid colour flags it and reverts on commit', async ({ page }) => {
    await openRoute(page, '/color', '.mustry-colorpicker');
    const input = page.locator('.mustry-cp--inline .mustry-cp-input');
    await input.click();
    await input.fill('not-a-color');
    await expect(page.locator('.mustry-cp--inline .mustry-cp-input--invalid')).toBeVisible();
    // Committing an unparseable value discards it and snaps back to canonical.
    await input.press('Enter');
    await expect(page.locator('.mustry-cp--inline .mustry-cp-input--invalid')).toHaveCount(0);
    await expect(input).toHaveValue(/^#|^rgb|^hsl/);
});

test('color: the popover opens, a swatch commits, and Escape closes it', async ({ page }) => {
    await openRoute(page, '/color', '.mustry-colorpicker');
    // The version-1 icon button is the first popover trigger in the DOM.
    await page.locator('.mustry-cp--popover .mustry-cp-control--trigger .mustry-cp-swatch').first().click();
    const panel = page.locator('.mustry-cp-popover');
    await expect(panel).toBeVisible();

    // Palette index 3 is #e03131 (red) — pick it from the popover.
    await panel.locator('.mustry-cp-chip').nth(3).click();
    await expect(page.getByText(/onChange \(v1 button\) value=/)).toBeVisible();
    // The pick propagated to the inline picker's output readout as well.
    await expect(page.getByText(/rgb: \(224, 49, 49\)/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
});
