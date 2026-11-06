import { Page } from '@playwright/test';
import { test, expect, openRoute } from './helpers';

test('timeline: day view renders resources and seeded bars', async ({ page }) => {
    await openRoute(page, '/timeline', '.mustry-timeline');
    await expect(page.getByText('Batch 4711')).toBeVisible();
    await expect(page.getByText('Mixer 1', { exact: true })).toBeVisible();
});

test('timeline: hovering a bar shows only the detail popover (issue #205)', async ({ page }) => {
    await openRoute(page, '/timeline', '.mustry-timeline');
    const bar = page.locator('.mustry-tml-bar', { hasText: 'Batch 4711' }).first();
    // Centre the bar in the scroller and let the scroll event land before
    // hovering: the timeline scrolls the now-line into view on load and hides
    // the hover popover on scroll, so a hover() that has to scroll cancels its
    // own popover. (scrollIntoViewIfNeeded() leaves the bar under the sticky
    // label column, and hover()'s retry then scrolls again.)
    await bar.evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'center' }));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await bar.hover();
    await expect(page.locator('.mustry-tml-hover')).toBeVisible();
    // No native title: the browser's own tooltip would pop up over the popover.
    await expect(bar).not.toHaveAttribute('title', /.*/);
});

test('timeline: collapsing a resource group hides its rows', async ({ page }) => {
    await openRoute(page, '/timeline', '.mustry-timeline');
    await expect(page.getByText('Mixer 1', { exact: true })).toBeVisible();
    await page.locator('.mustry-tml-label--group', { hasText: 'LINE 1' }).click();
    await expect(page.getByText('Mixer 1', { exact: true })).not.toBeVisible();
});

test('timeline: empty state shows the badge', async ({ page }) => {
    await openRoute(page, '/timeline-empty', '.mustry-timeline');
    await expect(page.locator('.mustry-tml-empty-badge')).toBeVisible();
});

test('timeline: sub-hour zoom presets (issue #117) show second-resolution ticks and keep now in view', async ({ page }) => {
    await openRoute(page, '/timeline-cycle', '.mustry-timeline');
    const zooms = page.locator('.mustry-tml-zoom-btn');
    await expect(zooms).toHaveText(['Millisecond', 'Second', 'Minute', 'Hour', 'Day']);
    await expect(zooms.filter({ hasText: /^Second$/ })).toHaveClass(/mustry-tml-zoom-btn--active/);
    // 'second' = a 2-minute window ticked every 5 s, labelled HH:mm:ss; the
    // seeded cycles run around now, so phase bars are on the board.
    const lower = page.locator('.mustry-tml-axis-lower .mustry-tml-tick');
    await expect(lower).toHaveCount(24);
    await expect(lower.first()).toHaveText(/^\d\d:\d\d:[0-5]\d$/);
    await expect(page.locator('.mustry-tml-bar', { hasText: 'Inject' }).first()).toBeVisible();
    // The now-line is inside the window (Today anchors on the containing stride).
    await expect(page.locator('.mustry-tml-now')).toBeVisible();
    // 'minute' = 30 one-minute ticks; the day label carries the window's start time.
    await zooms.filter({ hasText: /^Minute$/ }).click();
    await expect(lower).toHaveCount(30);
    await expect(lower.first()).toHaveText(/^\d\d:\d\d$/);
    await expect(page.locator('.mustry-tml-axis-upper .mustry-tml-tick').first()).toHaveText(/\d\d:\d\d/);
    await expect(page.locator('.mustry-tml-now')).toBeVisible();
    // Zooming back in returns to the current cycle, not to midnight.
    await zooms.filter({ hasText: /^Second$/ }).click();
    await expect(lower).toHaveCount(24);
    await expect(page.locator('.mustry-tml-now')).toBeVisible();
});

test('timeline: millisecond zoom resolves sub-second phases at their true width', async ({ page }) => {
    await openRoute(page, '/timeline-cycle', '.mustry-timeline');
    const zooms = page.locator('.mustry-tml-zoom-btn');
    // The board is read-only, so the 12px grabbable floor is off: a 40ms 'Vent'
    // phase is a sub-pixel hairline at 'second' zoom rather than a fake second.
    const vent = page.locator('.mustry-tml-bar[aria-label^="Vent — "]').first();
    await expect(vent).toBeVisible();
    expect(await vent.evaluate((el: HTMLElement) => el.getBoundingClientRect().width)).toBeLessThan(4);

    // 'millisecond' = a 10-second window on 500ms ticks labelled to a tenth.
    await zooms.filter({ hasText: 'Millisecond' }).click();
    const lower = page.locator('.mustry-tml-axis-lower .mustry-tml-tick');
    await expect(lower).toHaveCount(20);
    await expect(lower.first()).toHaveText(/^\d\d:\d\d:[0-5]\d[.,]\d$/);

    // Same 40ms phase, now several px wide and still not floored to a second.
    // Station A vents once per 19.9 s cycle, so a given clock-aligned 10 s
    // window holds a whole Vent only about half the time: step forward until
    // one does. Two consecutive windows cover a full cycle, so 3 is plenty.
    const vents = page.locator('.mustry-tml-bar[aria-label^="Vent — "]');
    let w = 0;
    for (let i = 0; i < 3 && w <= 3; i++) {
        if (i > 0) {
            const first = (await lower.first().textContent()) ?? '';
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            await expect(lower.first()).not.toHaveText(first);
        }
        const widths = await vents.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
        w = Math.max(0, ...widths);
    }
    expect(w).toBeGreaterThan(3);
    expect(w).toBeLessThan(20);   // a floored 1s phase would be ~144px
});

test('timeline: state.windowStart/End pin a custom window (issue #186)', async ({ page }) => {
    await openRoute(page, '/timeline-window', '.mustry-timeline');
    const lower = page.locator('.mustry-tml-axis-lower .mustry-tml-tick');
    // 06:00-14:00 UTC in 15-minute steps: 32 ticks, starting on the window edge.
    await expect(lower).toHaveCount(32);
    await expect(lower.first()).toHaveText('06:00');
    await expect(page.locator('.mustry-tml-zoom-btn--active')).toHaveCount(0);
    await expect(page.getByText('Early run')).toBeVisible();
    await expect(page.getByText('Late run')).toHaveCount(0);
    await expect(page.getByText('visible: 2026-06-01T06:00:00.000Z / 2026-06-01T14:00:00.000Z')).toBeVisible();

    // Next pages by the window's own length and writes the window back.
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(lower.first()).toHaveText('14:00');
    await expect(page.getByText('Late run')).toBeVisible();
    await expect(page.getByText('visible: 2026-06-01T14:00:00.000Z / 2026-06-01T22:00:00.000Z')).toBeVisible();
    await expect(page.getByText(/^state: 2026-06-01T14:00:00(\.000)?(Z|\+00:00) \/ 2026-06-01T22:00:00/)).toBeVisible();

    // A zoom button leaves the custom window for the preset.
    await page.locator('.mustry-tml-zoom-btn', { hasText: /^Day$/ }).click();
    await expect(page.locator('.mustry-tml-zoom-btn--active')).toHaveText('Day');
    await expect(lower).toHaveCount(24);
    await expect(page.getByText(/^state:\s*\/\s*$/)).toBeVisible();   // both cleared (null renders empty)
});

/** Count every enter-animation class the page ever shows, from first paint. */
async function countEnterAnimations(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as { enterSeen: number };
        w.enterSeen = 0;
        const watch = () => new MutationObserver(() => {
            w.enterSeen += document.querySelectorAll('.mustry-tml-anim-enter').length;
        }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        if (document.documentElement) {
            watch();
        } else {
            document.addEventListener('readystatechange', watch, { once: true });
        }
    });
}

const enterSeen = (page: Page) => page.evaluate(() => (window as unknown as { enterSeen: number }).enterSeen);

test('timeline: bound events do not fade in on page load', async ({ page }) => {
    // The demo's events come from a binding that delivers after the component
    // mounts; that first delivery is the initial load, not newly created events.
    await countEnterAnimations(page);
    await openRoute(page, '/timeline', '.mustry-timeline');
    await expect(page.getByText('Batch 4711')).toBeVisible();
    await page.waitForTimeout(500);
    expect(await enterSeen(page)).toBe(0);
});

test('timeline: a windowed binding\'s next page does not fade in', async ({ page }) => {
    // /timeline-db refetches per window: the next window's rows are new ids,
    // but they are loaded data, not newly created events.
    await countEnterAnimations(page);
    await openRoute(page, '/timeline-db', '.mustry-timeline');
    await expect(page.locator('.mustry-tml-bar').first()).toBeVisible();
    const firstBar = await page.locator('.mustry-tml-bar').first().getAttribute('aria-label');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.mustry-tml-bar').first()).not.toHaveAttribute('aria-label', firstBar || '');
    await page.waitForTimeout(500);
    expect(await enterSeen(page)).toBe(0);
});

// --- zoom changes keep the moment in view (issue #214) -------------------------
//
// Whether a stale scrollLeft lands on something useful depends on the time of
// day, so these pin the browser clock (timers keep running). At 17:30 the
// now-line is on screen at day zoom yet off screen at the old scroll position
// after Day -> Week and Day -> Hour, the numbers from the report. At 20:30 it can
// be scrolled away at day zoom with the centre still far from any window edge.
test.describe('timeline: zoom changes keep the moment in view (issue #214)', () => {
    test.use({ timezoneId: 'UTC' });

    const scrollerOf = (page: Page) => page.locator('.mustry-tml-scroll');

    async function openPinned(page: Page, route: string, hh: number, mm: number) {
        const now = new Date();
        await page.clock.setFixedTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm));
        await openRoute(page, route, '.mustry-timeline');
    }

    async function zoomTo(page: Page, name: string) {
        await page.locator('.mustry-tml-zoom-btn', { hasText: new RegExp(`^${name}$`) }).click();
        await expect(page.locator('.mustry-tml-zoom-btn--active')).toHaveText(name);
    }

    async function setScrollLeft(page: Page, left: number) {
        await scrollerOf(page).evaluate((el, x) => { el.scrollLeft = x; }, left);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }

    /** Where the now-line sits across the time viewport (the scroller minus the
     *  sticky label column): 0 = left edge, 1 = right edge, outside = off screen.
     *  toBeVisible() can't tell, it passes for a line scrolled out of the box. */
    function nowFraction(page: Page) {
        return page.evaluate(() => {
            const scroller = document.querySelector('.mustry-tml-scroll') as HTMLElement;
            const label = document.querySelector('.mustry-tml-corner') as HTMLElement;
            const line = document.querySelector('.mustry-tml-now') as HTMLElement | null;
            if (!line) {
                return NaN;
            }
            const left = scroller.getBoundingClientRect().left + label.offsetWidth;
            return (line.getBoundingClientRect().left - left) / (scroller.clientWidth - label.offsetWidth);
        });
    }

    async function expectNowOnScreen(page: Page) {
        await expect.poll(() => nowFraction(page)).toBeGreaterThanOrEqual(0);
        await expect.poll(() => nowFraction(page)).toBeLessThanOrEqual(1);
    }

    /** The clock time at the centre of the time viewport, in minutes since
     *  midnight, read off the rendered axis ticks: what the user actually sees. */
    function centreMinutes(page: Page) {
        return page.evaluate(() => {
            const scroller = document.querySelector('.mustry-tml-scroll') as HTMLElement;
            const label = document.querySelector('.mustry-tml-corner') as HTMLElement;
            const box = scroller.getBoundingClientRect();
            const centre = box.left + label.offsetWidth + (scroller.clientWidth - label.offsetWidth) / 2;
            const ticks = Array.from(document.querySelectorAll('.mustry-tml-axis-lower .mustry-tml-tick')).map((t) => {
                const m = /(\d\d):(\d\d)/.exec(t.textContent || '');
                return { x: t.getBoundingClientRect().left, min: m ? +m[1] * 60 + +m[2] : NaN };
            });
            const i = ticks.findIndex((t) => t.x > centre);
            const a = ticks[i - 1];
            const b = ticks[i];
            const span = b.min > a.min ? b.min - a.min : b.min + 1440 - a.min;
            return a.min + (span * (centre - a.x)) / (b.x - a.x);
        });
    }

    test('Day -> Week with now on screen keeps now on screen', async ({ page }) => {
        await openPinned(page, '/timeline', 17, 30);
        await expectNowOnScreen(page);
        await zoomTo(page, 'Week');
        await expectNowOnScreen(page);
    });

    test('Day -> Hour with now on screen keeps now on screen, and back', async ({ page }) => {
        await openPinned(page, '/timeline', 17, 30);
        await expectNowOnScreen(page);
        await zoomTo(page, 'Hour');
        await expectNowOnScreen(page);
        await zoomTo(page, 'Day');
        await expectNowOnScreen(page);
    });

    test('with now scrolled away, the moment at the centre stays at the centre', async ({ page }) => {
        await openPinned(page, '/timeline', 20, 30);
        await setScrollLeft(page, 300);
        const off = await nowFraction(page);
        expect(off > 1 || off < 0, `now must start off screen (at ${off})`).toBe(true);
        const before = await centreMinutes(page);

        await zoomTo(page, 'Hour');
        await expect.poll(async () => Math.abs((await centreMinutes(page)) - before)).toBeLessThan(10);
        // Now is in this window's neighbour, not dragged back on screen.
        await expect(page.locator('.mustry-tml-now')).toHaveCount(0);

        await zoomTo(page, 'Day');
        await expect.poll(async () => Math.abs((await centreMinutes(page)) - before)).toBeLessThan(10);
    });

    test('with now scrolled away, a moment too near the window start clamps to that edge', async ({ page }) => {
        await openPinned(page, '/timeline', 20, 30);
        await setScrollLeft(page, 300);
        // Week opens on the moment's own midnight, so 12:29 is 150px in: closer to
        // the start than half a viewport, so the board rests against the left edge.
        await zoomTo(page, 'Week');
        await expect.poll(() => scrollerOf(page).evaluate((el) => el.scrollLeft)).toBe(0);
    });

    test('follow-now keeps now on screen through zoom changes', async ({ page }) => {
        await openPinned(page, '/timeline', 17, 30);
        await page.getByRole('button', { name: 'Live', exact: true }).click();
        await zoomTo(page, 'Hour');
        await expectNowOnScreen(page);
        await zoomTo(page, 'Week');
        await expectNowOnScreen(page);
    });

    test('leaving a custom window keeps the moment at the centre', async ({ page }) => {
        await openPinned(page, '/timeline-window', 17, 30);
        const before = await centreMinutes(page);
        await zoomTo(page, 'Day');
        await expect.poll(async () => Math.abs((await centreMinutes(page)) - before)).toBeLessThan(10);
    });

    // --- round trips: the moment survives zooming out and back ------------------
    //
    // Week opens on the moment's own midnight, so it usually clamps to scrollLeft 0
    // and the Week view's centre is not the moment that was kept. These need the
    // date as well as the clock, so they read the window off the component
    // (Perspective has no client API for it; same fiber walk as grid.spec.ts).
    const TIMELINE = `(() => {
        const el = document.querySelector('.mustry-timeline');
        let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))];
        while (f && !(f.stateNode && typeof f.stateNode.scale === 'function')) f = f.return;
        return f.stateNode;
    })()`;

    /** The window start plus, in epoch ms, what the time viewport shows. */
    function view(page: Page): Promise<{ startMs: number; leftMs: number; centreMs: number; rightMs: number }> {
        return page.evaluate(`(() => {
            const scale = ${TIMELINE}.scale();
            const scroller = document.querySelector('.mustry-tml-scroll');
            const label = document.querySelector('.mustry-tml-corner');
            const at = (px) => scale.startMs + (px / scale.pxPerHour) * 3600000;
            const viewport = scroller.clientWidth - label.offsetWidth;
            return {
                startMs: scale.startMs,
                leftMs: at(scroller.scrollLeft),
                centreMs: at(scroller.scrollLeft + viewport / 2),
                rightMs: at(scroller.scrollLeft + viewport)
            };
        })()`);
    }

    const pagePrevious = (page: Page) => page.getByRole('button', { name: 'Previous', exact: true });
    const title = (page: Page) => page.locator('.mustry-tml-title');
    const HOUR = 3600000;

    /** A pixel of Day zoom is a minute; a scroll position rounds to whole pixels. */
    async function expectCentreOn(page: Page, ms: number) {
        await expect.poll(async () => Math.abs((await view(page)).centreMs - ms)).toBeLessThanOrEqual(120000);
    }

    async function expectInView(page: Page, ms: number) {
        await expect.poll(async () => {
            const v = await view(page);
            return ms >= v.leftMs && ms <= v.rightMs;
        }).toBe(true);
    }

    test('Day -> Week -> Day on a paged day returns to the moment, however often', async ({ page }) => {
        await openPinned(page, '/timeline', 12, 0);
        // Far enough back that Week can't show now, which would hide the walk: from
        // Week's clamped view, measuring the centre lands on the next day each trip.
        for (let i = 0; i < 8; i++) {
            await pagePrevious(page).click();
        }
        await setScrollLeft(page, 300);
        const start = await view(page);
        const dayTitle = await title(page).textContent();

        for (let trip = 0; trip < 3; trip++) {
            await zoomTo(page, 'Week');
            await expectInView(page, start.centreMs);
            expect((await view(page)).startMs, `Week opens on the same day (trip ${trip})`).toBe(start.startMs);

            await zoomTo(page, 'Day');
            await expectCentreOn(page, start.centreMs);
            await expect(title(page)).toHaveText(dayTitle as string);
            expect((await view(page)).startMs, `Day opens on the same day (trip ${trip})`).toBe(start.startMs);
        }
    });

    test('Week -> Day -> Week keeps the moment in view, on a week that opens on its day', async ({ page }) => {
        await openPinned(page, '/timeline', 12, 0);
        await zoomTo(page, 'Week');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await setScrollLeft(page, 1000);
        const week = await view(page);
        const midnight = week.centreMs - (week.centreMs % (24 * HOUR));
        expect(midnight, 'the moment must be on a later day than the week opens on').toBeGreaterThan(week.startMs);

        // The first trip moves the week to start on the moment's day: every zoom
        // change opens the window holding the moment, it doesn't restore the old one.
        for (let trip = 0; trip < 3; trip++) {
            await zoomTo(page, 'Day');
            await expectInView(page, week.centreMs);
            expect((await view(page)).startMs, `Day opens on the moment's day (trip ${trip})`).toBe(midnight);

            await zoomTo(page, 'Week');
            await expectInView(page, week.centreMs);
            expect((await view(page)).startMs, `Week opens on the moment's day (trip ${trip})`).toBe(midnight);
        }
    });

    test('Day -> Week -> Day on today returns to the moment, not to the now-line Week showed', async ({ page }) => {
        await openPinned(page, '/timeline', 20, 30);
        await setScrollLeft(page, 300);
        const start = await view(page);

        await zoomTo(page, 'Week');
        await expectNowOnScreen(page);     // Week opens on today and fits both
        await zoomTo(page, 'Day');
        await expectCentreOn(page, start.centreMs);
    });

    test('scrolling between zoom changes starts from what is now in view', async ({ page }) => {
        await openPinned(page, '/timeline', 12, 0);
        await pagePrevious(page).click();
        await setScrollLeft(page, 300);
        const start = await view(page);

        await zoomTo(page, 'Week');
        await setScrollLeft(page, 600);
        const scrolled = await view(page);
        expect(scrolled.centreMs).toBeGreaterThan(start.centreMs + 24 * HOUR);
        await zoomTo(page, 'Day');
        await expectInView(page, scrolled.centreMs);
    });

    test('Today between zoom changes drops the kept moment, even when nothing moved', async ({ page }) => {
        await openPinned(page, '/timeline', 20, 30);
        await setScrollLeft(page, 300);
        // Fail loudly if a layout change stops this start being off screen: the
        // on-screen check below would then pass with the bug present.
        const off = await nowFraction(page);
        expect(off > 1 || off < 0, `now must start off screen (at ${off})`).toBe(true);
        await zoomTo(page, 'Week');
        const week = await view(page);
        // The anchor is already today and now is on screen, so Today moves nothing.
        await page.getByRole('button', { name: 'Today', exact: true }).click();
        expect(await view(page)).toEqual(week);
        await zoomTo(page, 'Day');
        await expectNowOnScreen(page);
        // On the kept moment this would be back at 300.
        expect(await scrollerOf(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
    });

    test('a zoom change arriving with a refreshSeconds change still keeps now on screen', async ({ page }) => {
        await openPinned(page, '/timeline', 17, 30);
        await expectNowOnScreen(page);
        // Both land in one update, the way a binding or script writing both does.
        // (A bound state.zoom reaches the component the same way the buttons do.)
        // Recorded, because this proves nothing if they ever arrive separately.
        await page.evaluate(`(() => {
            const timeline = ${TIMELINE};
            const didUpdate = timeline.componentDidUpdate;
            timeline.componentDidUpdate = function (prev, ...rest) {
                if (prev.props.zoom !== this.props.props.zoom && prev.props.refreshSeconds !== this.props.props.refreshSeconds) {
                    window.__zoomWithRefresh = true;
                }
                return didUpdate.call(this, prev, ...rest);
            };
            const store = timeline.props.store.props;
            store.write('config.refreshSeconds', 47);
            store.write('state.zoom', 'hour');
        })()`);
        await expect(page.locator('.mustry-tml-zoom-btn--active')).toHaveText('Hour');
        expect(await page.evaluate('window.__zoomWithRefresh'), 'both changes landed in one update').toBe(true);
        await expectNowOnScreen(page);
    });
});
