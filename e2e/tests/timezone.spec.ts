import { test, expect, openRoute } from './helpers';

// #148: "now" and "today" follow the component's zone, not the browser's. The
// browser sits in Asia/Tokyo with a fixed clock, so each instant below reads
// differently in the browser, the gateway and the configured zone. The fixed
// clock only pins Date: timers and the session's websocket keep running.

test.use({ timezoneId: 'Asia/Tokyo' });

async function openManagersAt(page: any, iso: string) {
    await page.clock.setFixedTime(new Date(iso));
    return openRoute(page, '/timezone-managers', '#tz-sched-default');
}

/** The empty-zone cases need to know which zone that means. docker-compose's
 *  default is UTC (CI too); ops/demo.sh sets the host's zone instead. Locally they
 *  skip on another zone; in CI that fails, or the only real proof of the empty-zone
 *  read could vanish while the job stays green. */
async function needsUtcGateway(page: any) {
    const text = await page.locator('#tz-active-default').innerText();
    const utc = text.includes('gateway=UTC');
    if (process.env.CI) {
        expect(utc, `CI must run these on a UTC gateway: ${text}`).toBe(true);
    }
    test.skip(!utc, `needs a UTC gateway: ${text}`);
}

test.describe('Schedule Manager zone', () => {
    const strip = (page: any, id: string) => page.locator(`${id} .mustry-sched-strip`);

    test('an empty config.timezone follows the gateway, not the browser', async ({ page }) => {
        // Wed 10:00 UTC, 19:00 in Tokyo: inside 8:00-17:00 only on the gateway.
        await openManagersAt(page, '2026-06-17T10:00:00Z');
        await expect(page.locator('#tz-active-default')).toContainText('isActiveNow=');
        await needsUtcGateway(page);
        await expect(page.locator('#tz-active-default')).toContainText('isActiveNow=true');
        await expect(strip(page, '#tz-sched-default')).toHaveClass(/mustry-sched-strip--active/);
    });

    test('config.timezone wins over the gateway', async ({ page }) => {
        // Same instant: 05:00 in Chicago, so out of hours where the gateway is in them.
        await openManagersAt(page, '2026-06-17T10:00:00Z');
        await expect(page.locator('#tz-active-chicago')).toContainText('isActiveNow=false');
        await expect(strip(page, '#tz-sched-chicago')).not.toHaveClass(/mustry-sched-strip--active/);
    });

    test('config.timezone wins over the browser', async ({ page }) => {
        // Wed 10:00 in Chicago, already Thu 00:00 in Tokyo.
        await openManagersAt(page, '2026-06-17T15:00:00Z');
        await expect(page.locator('#tz-active-chicago')).toContainText('isActiveNow=true');
        await expect(strip(page, '#tz-sched-chicago')).toHaveClass(/mustry-sched-strip--active/);
    });

    test('the now-line sits on the configured zone\'s day and time', async ({ page }) => {
        // Wed 10:00 in Chicago (Thu 00:00 in Tokyo): the third column, 10/24 down.
        await openManagersAt(page, '2026-06-17T15:00:00Z');
        const root = page.locator('#tz-sched-chicago');
        const line = root.locator('.mustry-sched-now');
        await expect(line).toHaveCount(1);
        await expect(root.locator('.mustry-sched-col').nth(2).locator('.mustry-sched-now')).toHaveCount(1);
        const top = parseFloat(await line.evaluate((el: HTMLElement) => el.style.top));
        expect(top).toBeCloseTo((10 / 24) * 100, 1);
    });
});

test.describe('Holiday Manager zone', () => {
    const plantDay = (page: any, id: string) => page.locator(`${id} .mustry-sched-item`).filter({ hasText: 'Plant day' });

    test('an empty config.timezone follows the gateway, not the browser', async ({ page }) => {
        // 20:00 on the 17th at the gateway, already the 18th in Tokyo: the 17th isn't past.
        await openManagersAt(page, '2026-06-17T20:00:00Z');
        await expect(page.locator('#tz-active-default')).toContainText('isActiveNow=');
        await needsUtcGateway(page);
        await expect(plantDay(page, '#tz-hol-default')).toHaveCount(1);
        await expect(plantDay(page, '#tz-hol-default')).not.toHaveClass(/mustry-holiday-item--past/);
    });

    test('config.timezone reads today in that zone', async ({ page }) => {
        // The 18th at the gateway and in Tokyo, still the 17th in Chicago.
        await openManagersAt(page, '2026-06-18T02:00:00Z');
        await expect(plantDay(page, '#tz-hol-chicago')).toHaveCount(1);
        await expect(plantDay(page, '#tz-hol-chicago')).not.toHaveClass(/mustry-holiday-item--past/);
        await expect(page.locator('#tz-active-default')).toContainText('isActiveNow=');
        await needsUtcGateway(page);
        await expect(plantDay(page, '#tz-hol-default')).toHaveClass(/mustry-holiday-item--past/);
    });
});

test.describe('Holiday Manager at midnight (#257)', () => {
    test('the past badge moves on when the day turns in its zone, with nothing else re-rendering', async ({ page }) => {
        // The installed clock runs in real time until paused, so start well before midnight
        // and pause at 23:59:30 Chicago once the page is up: however slow the load, the
        // midnight timer then only fires when the test runs the clock past it.
        await page.clock.install({ time: new Date('2026-06-18T04:50:00Z') });
        await openRoute(page, '/timezone-managers', '#tz-hol-chicago');
        await page.clock.pauseAt(new Date('2026-06-18T04:59:30Z'));
        const plantDay = page.locator('#tz-hol-chicago .mustry-sched-item').filter({ hasText: 'Plant day' });
        await expect(plantDay).not.toHaveClass(/mustry-holiday-item--past/);
        await page.clock.runFor(60_000);
        await expect(plantDay).toHaveClass(/mustry-holiday-item--past/);
    });
});

test.describe('mini month navigator zone', () => {
    // 12:00 UTC on the 17th: 21:00 on the 17th in Tokyo, 02:00 on the 18th in Kiritimati.
    const NOON = '2026-06-17T12:00:00Z';
    const mini = (page: any) => page.locator('.mustry-cal-mini');
    const todayCell = (page: any) => mini(page).locator('.mustry-cal-mini-day--today');
    const selectedCell = (page: any) => mini(page).locator('.mustry-cal-mini-day--selected');

    test('the calendar highlights its zone\'s today, and Today goes there', async ({ page }) => {
        await page.clock.setFixedTime(new Date(NOON));
        const root = await openRoute(page, '/timezone-nav', '#tz-calendar');
        // Move away first, so Today has somewhere to come back from.
        await root.getByRole('button', { name: 'Next', exact: true }).click();
        await root.locator('.mustry-cal-title--btn').click();
        await mini(page).getByRole('button', { name: 'Previous month' }).click();
        await expect(todayCell(page)).toHaveText('18');
        await mini(page).locator('.mustry-cal-mini-today').click();
        await root.locator('.mustry-cal-title--btn').click();
        await expect(selectedCell(page)).toHaveText('18');
        await expect(todayCell(page)).toHaveText('18');
    });

    test('the timeline highlights its zone\'s today, and Today goes there', async ({ page }) => {
        await page.clock.setFixedTime(new Date(NOON));
        const root = await openRoute(page, '/timezone-nav', '#tz-timeline-far');
        const visible = page.locator('#tz-far-visible');
        // Midnight on the 18th in Kiritimati (UTC+14).
        await expect(visible).toContainText('2026-06-17T10:00:00.000Z');
        await root.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(visible).toContainText('2026-06-18T10:00:00.000Z');
        await root.locator('.mustry-tml-title--btn').click();
        await expect(todayCell(page)).toHaveText('18');
        await mini(page).locator('.mustry-cal-mini-today').click();
        await expect(visible).toContainText('2026-06-17T10:00:00.000Z');
    });
});

test.describe('timeline hour paging across DST', () => {
    test('is back on 00/08/16 the day after a fall-back, and Prev retraces it', async ({ page }) => {
        // 00:30 CDT on Chicago's 25-hour day.
        await page.clock.setFixedTime(new Date('2026-11-01T05:30:00Z'));
        const root = await openRoute(page, '/timezone-nav', '#tz-timeline-chicago');
        const visible = page.locator('#tz-chicago-visible');
        const steps = [
            '2026-11-01T05:00:00.000Z',   // 00:00 CDT
            '2026-11-01T13:00:00.000Z',   // 07:00 CST
            '2026-11-01T21:00:00.000Z',   // 15:00 CST
            '2026-11-02T05:00:00.000Z',   // 23:00 CST
            '2026-11-02T06:00:00.000Z',   // 00:00 CST on the 2nd
            '2026-11-02T14:00:00.000Z'    // 08:00 CST
        ];
        await expect(visible).toContainText(steps[0]);
        const next = root.getByRole('button', { name: 'Next', exact: true });
        const prev = root.getByRole('button', { name: 'Previous', exact: true });
        for (const step of steps.slice(1)) {
            await next.click();
            await expect(visible).toContainText(step);
        }
        for (const step of steps.slice(0, -1).reverse()) {
            await prev.click();
            await expect(visible).toContainText(step);
        }
    });
});

test.describe('timeline with an unknown config.timezone (#255)', () => {
    test('renders browser-local instead of throwing on mount', async ({ page }) => {
        // 12:00 UTC on the 17th is 21:00 in Tokyo: the day window opens on Tokyo's midnight.
        await page.clock.setFixedTime(new Date('2026-06-17T12:00:00Z'));
        const root = await openRoute(page, '/timezone-nav', '#tz-timeline-badzone');
        await expect(root.locator('.mustry-tml-title--btn')).toBeVisible();
        await expect(page.locator('#tz-badzone-visible')).toContainText('2026-06-16T15:00:00.000Z');
        await root.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.locator('#tz-badzone-visible')).toContainText('2026-06-17T15:00:00.000Z');
    });
});
