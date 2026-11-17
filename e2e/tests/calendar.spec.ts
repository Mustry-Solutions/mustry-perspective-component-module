import { Page } from '@playwright/test';
import { test, expect, openRoute } from './helpers';

// Evergreen demo: events are seeded relative to today on view load. The exact
// titles/positions vary by weekday, so assert on stable structure — that timed
// event chips render and the category legend (config) mapped through.
test('calendar: week view renders seeded events', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    await expect(page.locator('.mustry-cal-tg-event').first()).toBeVisible();
    expect(await page.locator('.mustry-cal-tg-event').count()).toBeGreaterThan(3);
    // Category legend proves categories/config props mapped through.
    await expect(page.getByText('Maintenance', { exact: true })).toBeVisible();
});

test('calendar: hovering an event shows only the detail popover (issue #205)', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    const chip = page.locator('.mustry-cal-tg-event').first();
    // Scroll first and let the scroll event land: the time grid hides the hover
    // popover on scroll, so a hover() that scrolls would cancel its own popover.
    await chip.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await chip.hover();
    await expect(page.locator('.mustry-cal-popover')).toBeVisible();
    // No native title: the browser's own tooltip would pop up over the popover.
    await expect(chip).not.toHaveAttribute('title', /.*/);
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(page.locator('.mustry-cal-mbar').first()).not.toHaveAttribute('title', /.*/);
});

test('calendar: view switch to Month re-renders', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    // The month grid renders its day cells and at least one event chip.
    await expect(page.locator('.mustry-cal-day').first()).toBeVisible();
    await expect(page.locator('.mustry-cal-mbar, .mustry-cal-day-event, [class*="cal-m"]').first()).toBeVisible();
});

test('calendar: empty state shows the badge', async ({ page }) => {
    await openRoute(page, '/calendar-empty', '.mustry-calendar');
    await expect(page.locator('.mustry-cal-empty-badge')).toBeVisible();
});

/** Count every enter-animation class the page ever shows, from first paint. */
async function countEnterAnimations(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as { enterSeen: number };
        w.enterSeen = 0;
        const watch = () => new MutationObserver(() => {
            w.enterSeen += document.querySelectorAll('.mustry-cal-anim-enter').length;
        }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        if (document.documentElement) {
            watch();
        } else {
            document.addEventListener('readystatechange', watch, { once: true });
        }
    });
}

const enterSeen = (page: Page) => page.evaluate(() => (window as unknown as { enterSeen: number }).enterSeen);

test('calendar: events and recurring series do not fade in on page load', async ({ page }) => {
    await countEnterAnimations(page);
    await openRoute(page, '/calendar', '.mustry-calendar');
    await page.waitForTimeout(1000);
    expect(await enterSeen(page)).toBe(0);
});

test('calendar: a windowed binding\'s new page does not fade in', async ({ page }) => {
    // /calendar-db refetches per visible range; its one-off events sit in
    // May-August 2026. Paging back into them loads new ids, which are loaded
    // data, not newly created events.
    await countEnterAnimations(page);
    await openRoute(page, '/calendar-db', '.mustry-calendar');
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    const oneOff = page.locator('.mustry-cal-mbar:not(:has(.mustry-cal-ev-recur))');
    for (let i = 0; i < 36 && !(await oneOff.count()); i++) {
        await page.getByRole('button', { name: 'Previous', exact: true }).click();
        await page.waitForTimeout(400);
    }
    await expect(oneOff.first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(await enterSeen(page)).toBe(0);
});

// --- month view keyboard path to the day-cell click (issue #90) --------------
// Pinned to the browser's local noon on a mid-grid Wednesday, so an arrow always has
// somewhere to go and the assertions can name exact dates. Nothing here needs the gateway
// to agree: "today" is the browser's, and the fixture's one bar is on a fixed date.
const PINNED_NOW = new Date(2026, 5, 17, 12);
const TODAY = '2026-06-17';
const TODAY_LONG = 'Wednesday, June 17, 2026';
const DAY_KEYS = '/calendar-day-keys';   // read-only calendar; echoes each onDateClick date
const WITH_EDITOR = '/calendar-empty';   // built-in editor on, no events
const dayButton = '.mustry-cal-daycreate';

const echoed = (page: Page) => page.getByText(/^onDateClick: /);

async function openPinned(page: Page, route: string) {
    await page.clock.setFixedTime(PINNED_NOW);
    await openRoute(page, route, '.mustry-calendar');
}

/** Tab from the toolbar until a day create button has focus; returns its day. */
async function tabToDayButton(page: Page): Promise<string> {
    await page.getByRole('button', { name: 'Month', exact: true }).focus();
    for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const day = await page.evaluate((sel) => {
            const a = document.activeElement;
            return a && a.matches(sel) ? a.closest<HTMLElement>('.mustry-cal-day')!.dataset.day! : '';
        }, dayButton);
        if (day) {
            return day;
        }
    }
    throw new Error('Tab never reached a day create button');
}

const focusedDay = (page: Page) => page.evaluate(() => {
    const cell = document.activeElement && document.activeElement.closest<HTMLElement>('.mustry-cal-day');
    return cell ? cell.dataset.day! : '';
});

for (const [name, key] of [['Enter', 'Enter'], ['Space', ' ']]) {
    test(`calendar: ${name} on a focused month day fires onDateClick once, with that date`, async ({ page }) => {
        await openPinned(page, DAY_KEYS);
        expect(await tabToDayButton(page)).toBe(TODAY);
        await page.keyboard.press(key);
        await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
        await page.waitForTimeout(500);   // a duplicate would arrive just after the first
        await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
    });

    test(`calendar: holding ${name} on a month day fires onDateClick once`, async ({ page }) => {
        await openPinned(page, DAY_KEYS);
        await tabToDayButton(page);
        for (let i = 0; i < 4; i++) {
            await page.keyboard.down(key);   // after the first, these are auto-repeats
        }
        await page.keyboard.up(key);
        await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
        await page.waitForTimeout(500);
        await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
    });
}

for (const action of ['Cancel', 'Create']) {
    test(`calendar: Enter held on the editor's ${action} doesn't reopen it`, async ({ page }) => {
        await openPinned(page, WITH_EDITOR);
        await tabToDayButton(page);
        await page.keyboard.press('Enter');
        const editor = page.locator('.mustry-cal-editor');
        await expect(editor).toBeVisible();

        await editor.getByRole('button', { name: action, exact: true }).focus();
        await page.keyboard.down('Enter');
        await expect(editor).toHaveCount(0);
        await expect(page.locator(`[data-day="${TODAY}"] ${dayButton}`)).toBeFocused();
        await page.keyboard.down('Enter');   // an auto-repeat, now landing on the day button
        await page.keyboard.down('Enter');
        await page.keyboard.up('Enter');
        await page.waitForTimeout(300);
        await expect(editor).toHaveCount(0);
    });
}

test('calendar: Enter held on a month day opens the editor and leaves it open', async ({ page }) => {
    await openPinned(page, WITH_EDITOR);
    await tabToDayButton(page);
    await page.keyboard.down('Enter');
    const editor = page.locator('.mustry-cal-editor');
    await expect(editor).toBeVisible();
    await page.keyboard.down('Enter');   // an auto-repeat, now landing on the focused title
    await page.keyboard.up('Enter');
    await page.waitForTimeout(300);
    await expect(editor).toBeVisible();
});

test('calendar: the month day buttons are one Tab stop, and arrows move it', async ({ page }) => {
    await openPinned(page, DAY_KEYS);
    await expect(page.locator(`${dayButton}[tabindex="0"]`)).toHaveCount(1);
    expect(await tabToDayButton(page)).toBe(TODAY);

    await page.keyboard.press('ArrowDown');
    const moved = '2026-06-24';
    expect(await focusedDay(page)).toBe(moved);
    await expect(page.locator(`[data-day="${moved}"] ${dayButton}`)).toHaveAttribute('tabindex', '0');
    await expect(page.locator(`${dayButton}[tabindex="0"]`)).toHaveCount(1);

    await page.keyboard.press('Enter');
    await expect(echoed(page)).toHaveText(`onDateClick: ${moved};`);

    // Walk the rest of the grid: the only other stops are date numbers, bars and "+N more".
    let stops = 0;
    for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const inGrid = await page.evaluate((sel) => {
            const a = document.activeElement;
            return { grid: !!(a && a.closest('.mustry-cal-weeks')), day: !!(a && a.matches(sel)) };
        }, dayButton);
        if (!inGrid.grid) { break; }
        if (inGrid.day) { stops++; }
    }
    expect(stops, 'no second day button in the Tab order').toBe(0);
});

test('calendar: an arrow with a modifier stays with the browser', async ({ page }) => {
    await openPinned(page, DAY_KEYS);
    await tabToDayButton(page);
    // On window, so it runs after React's document-level handler has had its say.
    await page.evaluate(() => {
        const w = window as unknown as { prevented: boolean[] };
        w.prevented = [];
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') { w.prevented.push(e.defaultPrevented); }
        });
    });
    const prevented = () => page.evaluate(() => (window as unknown as { prevented: boolean[] }).prevented);

    for (const modifier of ['Alt', 'Control', 'Meta', 'Shift']) {
        await page.keyboard.press(`${modifier}+ArrowRight`);
        expect(await focusedDay(page), `${modifier}+ArrowRight`).toBe(TODAY);
    }
    expect(await prevented()).toEqual([false, false, false, false]);

    await page.keyboard.press('ArrowRight');   // and the plain key is still ours
    expect(await focusedDay(page)).toBe('2026-06-18');
    expect(await prevented()).toEqual([false, false, false, false, true]);
});

test('calendar: with the editor, a focused month day button says it creates, and shows a ring', async ({ page }) => {
    await openPinned(page, WITH_EDITOR);
    const button = page.locator(`${dayButton}[tabindex="0"]`);
    await expect(button).toHaveCSS('opacity', '0');
    await tabToDayButton(page);
    await expect(page.getByRole('button', { name: `New event on ${TODAY_LONG}`, exact: true })).toBeFocused();
    await expect(button).toHaveCSS('opacity', '1');
    await expect(button).toHaveCSS('outline-style', 'solid');
    await expect(button).toHaveText('+');
    // Off the button again, it's gone: nothing shows without focus.
    await page.keyboard.press('Tab');
    await expect(page.locator(`[data-day="${TODAY}"] ${dayButton}`)).toHaveCSS('opacity', '0');
});

test('calendar: without the editor, a month day button names the date alone and claims nothing', async ({ page }) => {
    await openPinned(page, DAY_KEYS);
    const button = page.locator(`${dayButton}[tabindex="0"]`);
    await tabToDayButton(page);
    await expect(page.getByRole('button', { name: TODAY_LONG, exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: /^New event on/ })).toHaveCount(0);
    await expect(button).toHaveText('');
    await expect(button).toHaveCSS('outline-style', 'solid');
    // It's still a real path to the click, which is why it's offered at all.
    await page.keyboard.press('Enter');
    await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
});

test('calendar: only the day button undims an out-of-month cell, not its date number', async ({ page }) => {
    await openPinned(page, DAY_KEYS);
    const cell = page.locator('.mustry-cal-day--other').first();
    await expect(cell).toHaveCSS('opacity', '0.45');
    const number = cell.locator('.mustry-cal-daynum');
    await number.click();
    await expect(number).toBeFocused();
    await expect(cell).toHaveCSS('opacity', '0.45');
    await cell.locator(dayButton).focus();
    await expect(cell).toHaveCSS('opacity', '1');
});

test('calendar: pointer behaviour in month cells is unchanged by the day buttons', async ({ page }) => {
    await openPinned(page, DAY_KEYS);
    await expect(page.locator('.mustry-cal-mbar').first()).toBeVisible();
    const days = page.locator('.mustry-cal-day:not(.mustry-cal-day--today)');

    // Background click, right where the (invisible, full-cell) button sits: fires once.
    const cell = days.nth(10);
    const iso = await cell.getAttribute('data-day');
    const box = (await cell.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);
    await expect(echoed(page)).toHaveText(`onDateClick: ${iso};`);
    await page.waitForTimeout(500);
    await expect(echoed(page)).toHaveText(`onDateClick: ${iso};`);

    // A drag across cell backgrounds selects nothing in month view, and fires nothing.
    const other = (await days.nth(12).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
    await page.mouse.down();
    await page.mouse.move(other.x + other.width / 2, other.y + other.height - 8, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await expect(echoed(page)).toHaveText(`onDateClick: ${iso};`);

    // The date number opens the popover, and an event bar opens nothing of the cell's.
    await cell.locator('.mustry-cal-daynum').click();
    await expect(page.locator('.mustry-cal-daypop')).toBeVisible();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);   // dismiss = a cell click
    await expect(page.locator('.mustry-cal-daypop')).toHaveCount(0);
    await expect(echoed(page)).toHaveText(`onDateClick: ${iso};${iso};`);
    await page.locator('.mustry-cal-mbar').first().click();
    await page.waitForTimeout(500);
    await expect(echoed(page)).toHaveText(`onDateClick: ${iso};${iso};`);
});

test('calendar: Enter on a month day closes an open day popover', async ({ page }) => {
    await openPinned(page, DAY_KEYS);
    await tabToDayButton(page);
    await page.keyboard.press('Tab');   // the same day's date number
    await page.keyboard.press('Enter');
    await expect(page.locator('.mustry-cal-daypop')).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mustry-cal-daypop')).toHaveCount(0);
    await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
});

test('calendar: Enter on a month day closes an open mini-month', async ({ page }) => {
    await openPinned(page, DAY_KEYS);
    await page.locator('.mustry-cal-title--btn').click();
    await expect(page.locator('.mustry-cal-mini')).toBeVisible();
    await tabToDayButton(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('.mustry-cal-mini')).toHaveCount(0);
    await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
});

test('calendar: with the built-in editor, a month day key opens it and focus comes back', async ({ page }) => {
    await openPinned(page, WITH_EDITOR);
    await tabToDayButton(page);
    await page.keyboard.press('Enter');
    const editor = page.locator('.mustry-cal-editor');
    await expect(editor).toBeVisible();
    await expect(editor.locator('input[type="date"]').first()).toHaveValue(TODAY);
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(page.locator(`[data-day="${TODAY}"] ${dayButton}`)).toBeFocused();

    await page.keyboard.press(' ');
    await expect(editor).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
});

// Real clock: this fixture's events are seeded from the gateway's today. Nothing below
// needs a particular date: it takes whichever bar comes first and any cell outside its row.
test('calendar: dragging a month bar still hit-tests the day cells', async ({ page }) => {
    await openRoute(page, '/calendar', '.mustry-calendar');
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    const bar = page.locator('.mustry-cal-mbar--draggable:not(:has(.mustry-cal-ev-recur))').first();
    await expect(bar).toBeVisible();
    const from = (await bar.boundingBox())!;
    const cx = from.x + 6;
    const cy = from.y + from.height / 2;
    // Any cell outside the bar's own row is a real move.
    let cell = page.locator('.mustry-cal-day').nth(17);
    let target = (await cell.boundingBox())!;
    if (cy >= target.y && cy <= target.y + target.height) {
        cell = page.locator('.mustry-cal-day').nth(31);
        target = (await cell.boundingBox())!;
    }
    const iso = await cell.getAttribute('data-day');

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height - 8, { steps: 8 });
    await expect(page.locator('.mustry-cal-day--drop')).toHaveAttribute('data-day', iso!);
    await page.mouse.up();
    await expect(page.locator('.mustry-cal-editor')).toHaveCount(0);
    await expect(page.locator('.mustry-cal-day--drop')).toHaveCount(0);
});

test('calendar: dragging empty time in week view still creates', async ({ page }) => {
    await openPinned(page, WITH_EDITOR);
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    const col = page.locator('.mustry-cal-tg-col').first();
    await expect(col).toBeVisible();
    const box = (await col.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = Math.max(box.y, 200) + 40;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 80, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.mustry-cal-editor')).toBeVisible();
});

// --- #250: week/day view keyboard path to a column's empty-time click ---------------
const colButton = '.mustry-cal-tg-daycreate';

async function openPinnedView(page: Page, route: string, view: 'Week' | 'Day') {
    await openPinned(page, route);
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(page.locator(colButton).first()).toBeVisible();
}

/** Tab from the view switcher until a column create button has focus; returns its day. */
async function tabToColButton(page: Page): Promise<string> {
    await page.getByRole('button', { name: 'Day', exact: true }).focus();
    for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const day = await page.evaluate((sel) => {
            const a = document.activeElement as HTMLElement | null;
            return a && a.matches(sel) ? a.dataset.headDay! : '';
        }, colButton);
        if (day) {
            return day;
        }
    }
    throw new Error('Tab never reached a column create button');
}

const focusedCol = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement).dataset.headDay || '');

for (const [name, key] of [['Enter', 'Enter'], ['Space', ' ']]) {
    test(`calendar: ${name} on a week column fires onDateClick once, with that date (#250)`, async ({ page }) => {
        await openPinnedView(page, DAY_KEYS, 'Week');
        expect(await tabToColButton(page)).toBe(TODAY);
        await page.keyboard.press(key);
        await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
        await page.waitForTimeout(500);
        await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
    });
}

test('calendar: holding Enter on a week column fires onDateClick once (#250)', async ({ page }) => {
    await openPinnedView(page, DAY_KEYS, 'Week');
    await tabToColButton(page);
    for (let i = 0; i < 4; i++) {
        await page.keyboard.down('Enter');
    }
    await page.keyboard.up('Enter');
    await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
    await page.waitForTimeout(500);
    await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
});

test('calendar: the week column buttons are one Tab stop, and Left/Right move it (#250)', async ({ page }) => {
    await openPinnedView(page, DAY_KEYS, 'Week');
    await expect(page.locator(`${colButton}[tabindex="0"]`)).toHaveCount(1);
    await tabToColButton(page);
    await page.keyboard.press('ArrowRight');
    expect(await focusedCol(page)).toBe('2026-06-18');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedCol(page)).toBe('2026-06-16');
    await page.keyboard.press('ArrowDown');   // not a column key: focus stays
    expect(await focusedCol(page)).toBe('2026-06-16');
    await page.keyboard.press('Alt+ArrowLeft');   // the browser's, not ours
    expect(await focusedCol(page)).toBe('2026-06-16');
    // The last focused column is the Tab stop now; Shift+Tab out and back returns to it.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    expect(await focusedCol(page)).toBe('2026-06-16');
    await expect(page.locator(`${colButton}[tabindex="0"]`)).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(echoed(page)).toHaveText('onDateClick: 2026-06-16;');
});

test('calendar: a week column button names the date, or says it creates with the editor (#250)', async ({ page }) => {
    // The name starts with the head's visible text, then the full date (WCAG 2.5.3).
    await openPinnedView(page, DAY_KEYS, 'Week');
    const shown = (await page.locator(`${colButton}[data-head-day="${TODAY}"]`).innerText()).trim();
    await expect(page.getByRole('button', { name: `${shown}, ${TODAY_LONG}`, exact: true })).toHaveCount(1);
    await openPinnedView(page, WITH_EDITOR, 'Week');
    await expect(page.getByRole('button', { name: `${shown}, New event on ${TODAY_LONG}`, exact: true })).toHaveCount(1);
});

test('calendar: with the editor, a week column key opens a 09:00-10:00 slot and focus comes back (#250)', async ({ page }) => {
    await openPinnedView(page, WITH_EDITOR, 'Week');
    await tabToColButton(page);
    await page.keyboard.press('Enter');
    const editor = page.locator('.mustry-cal-editor');
    await expect(editor).toBeVisible();
    const times = editor.locator('input[type="datetime-local"]');
    await expect(times.nth(0)).toHaveValue(`${TODAY}T09:00`);
    await expect(times.nth(1)).toHaveValue(`${TODAY}T10:00`);
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(page.locator(`${colButton}[data-head-day="${TODAY}"]`)).toBeFocused();
});

test('calendar: the day view has its one column button too (#250)', async ({ page }) => {
    await openPinnedView(page, DAY_KEYS, 'Day');
    await expect(page.locator(colButton)).toHaveCount(1);
    expect(await tabToColButton(page)).toBe(TODAY);
    await page.keyboard.press('Enter');
    await expect(echoed(page)).toHaveText(`onDateClick: ${TODAY};`);
});

test('calendar: a pointer on a week day head still does nothing (#250)', async ({ page }) => {
    // A guard: it holds with and without the column buttons, so it doesn't wait for one.
    await openPinned(page, DAY_KEYS);
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await page.locator('.mustry-cal-tg-dayhead').nth(2).click();
    await page.waitForTimeout(500);
    await expect(echoed(page)).toHaveText('onDateClick: ');
});

// --- #249: drags on a DST gap day, in a real browser --------------------------------
// New York skips 02:00-03:00 on 2026-03-08, so 02:30-03:00 is really 03:30-03:00.
const GAP_NOW = new Date('2026-03-08T17:00:00Z');   // 13:00 EDT in New York
const HOUR_PX = 56;                                  // hourHeightPx(15)

async function openGap(page: Page) {
    await page.clock.setFixedTime(GAP_NOW);
    const root = await openRoute(page, '/calendar-gap-drag', '.mustry-calendar');
    await expect(root.locator('.mustry-cal-tg-col')).toHaveCount(1);
    return root;
}
const gapLog = (page: Page) => page.locator('#gap-log');

/** The viewport y of a wall time in the day column. */
async function yAt(page: Page, minutes: number): Promise<{ x: number; y: number }> {
    const box = (await page.locator('.mustry-cal-tg-col').boundingBox())!;
    return { x: box.x + box.width * 0.75, y: box.y + (minutes / 60) * HOUR_PX };
}

async function drag(page: Page, from: { x: number; y: number }, toY: number) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, toY, { steps: 8 });
    await page.mouse.up();
}

test('calendar: a selection the DST gap reverses fires no onSelect; a normal one does (#249)', async ({ page }) => {
    await openGap(page);
    const a = await yAt(page, 150);   // 02:30
    await drag(page, a, (await yAt(page, 180)).y);   // to 03:00
    await page.waitForTimeout(500);
    await expect(gapLog(page)).toHaveText('log: ');
    const b = await yAt(page, 240);   // 04:00
    await drag(page, b, (await yAt(page, 300)).y);   // to 05:00
    await expect(gapLog(page)).toHaveText('log: select 2026-03-08T04:00:00-04:00 2026-03-08T05:00:00-04:00;');
});

test('calendar: a move the DST gap reverses fires no onChange; a normal one does (#249)', async ({ page }) => {
    await openGap(page);
    const probe = page.locator('.mustry-cal-tg-event', { hasText: 'Move probe' });
    const box = (await probe.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await drag(page, from, from.y + 1.5 * HOUR_PX);   // 01:00-01:30 -> 02:30-03:00
    await page.waitForTimeout(500);
    await expect(gapLog(page)).toHaveText('log: ');
    await drag(page, from, from.y + 3 * HOUR_PX);     // -> 04:00-04:30
    await expect(gapLog(page)).toHaveText('log: move moveProbe 2026-03-08T04:00:00-04:00 2026-03-08T04:30:00-04:00;');
});

test('calendar: a resize the DST gap reverses fires no onChange; a normal one does (#249)', async ({ page }) => {
    await openGap(page);
    const handle = page.locator('.mustry-cal-tg-event', { hasText: 'Resize probe' }).locator('.mustry-cal-tg-resize--start');
    const box = (await handle.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await drag(page, from, from.y - 0.5 * HOUR_PX);   // start 03:00 -> 02:30, which is 03:30: the end
    await page.waitForTimeout(500);
    await expect(gapLog(page)).toHaveText('log: ');
    await drag(page, from, from.y - 1.5 * HOUR_PX);   // start -> 01:30 EST
    await expect(gapLog(page)).toHaveText('log: resize resizeProbe 2026-03-08T01:30:00-05:00 2026-03-08T03:30:00-04:00;');
});

test('calendar: focusing a week column button moves no text and keeps the head row height (#250)', async ({ page }) => {
    await openPinnedView(page, WITH_EDITOR, 'Week');
    const head = page.locator('.mustry-cal-tg-head');
    const label = page.locator(`${colButton}[data-head-day="${TODAY}"]`);
    // Where the date text itself sits: the button is full width, so its box can't tell.
    const textX = () => label.evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el.firstChild as Node);
        return r.getBoundingClientRect().x;
    });
    const before = { head: (await head.boundingBox())!.height, text: await textX() };
    await label.focus();
    await expect(label.locator('.mustry-cal-tg-daycreate-plus')).toBeVisible();
    expect((await head.boundingBox())!.height).toBeCloseTo(before.head, 1);
    expect(await textX()).toBeCloseTo(before.text, 1);
});

// --- #291 / #297: whole-series edits in the built-in editor, New York gap week -----------
// The fixture doesn't persist, so each test starts from the bound data.
async function openSeries(page: Page) {
    await page.clock.setFixedTime(GAP_NOW);
    const root = await openRoute(page, '/calendar-gap-series', '.mustry-calendar');
    await expect(root.locator('.mustry-cal-tg-col')).toHaveCount(7);
    return root;
}
const seriesLog = (page: Page) => page.locator('#series-log');

/** Open the editor on one occurrence of a series. */
async function openOccurrence(page: Page, day: string, title: string) {
    await page.locator(`.mustry-cal-tg-col[data-day="${day}"] .mustry-cal-tg-event`, { hasText: title }).click();
    const editor = page.locator('.mustry-cal-editor');
    await expect(editor).toBeVisible();
    return editor;
}

test('calendar: a series that starts in the DST gap can be renamed with "All events" (#297)', async ({ page }) => {
    await openSeries(page);
    const editor = await openOccurrence(page, '2026-03-09', 'Gap series');
    await editor.getByRole('radio', { name: 'All events' }).check();
    await editor.getByRole('textbox').first().fill('Renamed');
    await expect(editor.locator('.mustry-cal-editor-problem')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Save' }).click();
    // The stored 02:30 goes back as written; 03:30 exists and is written as an instant.
    await expect(seriesLog(page)).toHaveText('log: edit gapSeries Renamed 2026-03-08T02:30:00 2026-03-08T03:30:00-04:00 ex=;');
});

test('calendar: a time the DST gap skips is named in the editor (#297)', async ({ page }) => {
    await openSeries(page);
    const editor = await openOccurrence(page, '2026-03-09', 'Gap series');
    const [start, end] = [editor.locator('input[type="datetime-local"]').nth(0), editor.locator('input[type="datetime-local"]').nth(1)];
    const message = "02:30 doesn't exist on Mar 8 in America/New_York: the clocks skip it";

    // "This event", moved onto the gap day: 02:30-03:00 is really 03:30-03:00.
    await start.fill('2026-03-08T02:30');
    await end.fill('2026-03-08T03:00');
    await expect(editor.locator('.mustry-cal-editor-problem')).toHaveText(message);
    await expect(editor.getByRole('button', { name: 'Save' })).toBeDisabled();

    // "All events" with a changed time is checked on the series' own date, the gap day.
    await start.fill('2026-03-09T02:30');
    await end.fill('2026-03-09T03:15');
    await expect(editor.locator('.mustry-cal-editor-problem')).toHaveCount(0);
    await editor.getByRole('radio', { name: 'All events' }).check();
    await expect(editor.locator('.mustry-cal-editor-problem')).toHaveText(message);
    await expect(editor.getByRole('button', { name: 'Save' })).toBeDisabled();

    // A range typed backwards keeps the plain message.
    await editor.getByRole('radio', { name: 'This event' }).check();
    await start.fill('2026-03-09T04:00');
    await expect(editor.locator('.mustry-cal-editor-problem')).toHaveText('End must be after start');
});

test('calendar: moving an occurrence by days with "All events" moves the series and its exdates (#291)', async ({ page }) => {
    await openSeries(page);
    const editor = await openOccurrence(page, '2026-03-10', 'Shift series');
    await editor.getByRole('radio', { name: 'All events' }).check();
    const inputs = editor.locator('input[type="datetime-local"]');
    await inputs.nth(0).fill('2026-03-11T10:00');
    await inputs.nth(1).fill('2026-03-11T11:00');
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(seriesLog(page)).toHaveText(
        'log: edit shiftSeries Shift series 2026-03-03T10:00:00-05:00 2026-03-03T11:00:00-05:00 ex=2026-03-06;'
    );
});
