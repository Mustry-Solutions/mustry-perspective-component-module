import * as fs from 'fs';
import * as path from 'path';
import { Locator, Page } from '@playwright/test';
import { test, expect, openRoute } from './helpers';

// Admin family: the capability flags only hide UI, so the reference event scripts have to
// refuse a write on the gateway. These tests fire the events the way a crafted client does:
// straight through the client's event channel, with chosen payloads, no UI involved. The
// /authz-* views carry the real reference scripts (ops/verify/tools/build_authz_views.py),
// and a poll on the gateway (project library authzCheck) reads the data back.
//
// Sessions are anonymous unless a test logs in. The verify project's identity provider
// (ignition/global-props/data.bin, GlobalProps.newInstance() + setIdp('default'), serialized
// by the gateway) is there for those tests: nothing forces a login, so the other specs
// stay anonymous.

// The test data is named zauthz-* to sort last: these are real gateway rows that show up in
// the rails of specs running in parallel, and must not push the rows those specs click. A row
// pushed low enough has its menu painted under a sibling component: that bug is issue #254,
// https://github.com/Mustry-Solutions/mustry-perspective-component-module/issues/254.
// Fixing it should remove the need for this.
const REPO = path.join(__dirname, '..', '..');
const VIEW_DIRS = ['ops/verify/project', 'ops/demo/project'].map((p) =>
    path.join(REPO, p, 'com.inductiveautomation.perspective/views'));

const USER = '.mustry-usermgr';
const SCHEDULE = '.mustry-schedmgr';
const ROSTER = '.mustry-rostermgr';
const HOLIDAY = '.mustry-holidaymgr';

/** Send a component event with no UI involved, as a crafted client would. */
async function fire(page: Page, selector: string, eventName: string, payload: unknown) {
    await page.locator(selector).first().evaluate((el: any, [name, body]: any) => {
        const key = Object.keys(el).find((k) => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber'))!;
        let fiber = el[key];
        while (fiber && !fiber.memoizedProps?.componentEvents) {
            fiber = fiber.return;
        }
        fiber.memoizedProps.componentEvents.fireComponentEvent(name, body);
    }, [eventName, payload] as const);
}

/** Fire an event and wait for the script's verdict in view.custom.lastEvent. */
async function fireAndExpect(page: Page, attack: Attack, verdict: RegExp) {
    // Clear the last verdict first: two attacks in a row can produce the same text.
    await page.locator(attack[0]).first().evaluate((el: any) => {
        const key = Object.keys(el).find((k) => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber'))!;
        let fiber = el[key];
        while (fiber && !fiber.memoizedProps?.store) {
            fiber = fiber.return;
        }
        fiber.memoizedProps.store.view.custom.write('lastEvent', '');
    });
    const label = page.locator('#authz-event');
    await expect(label).toHaveText('');
    await fire(page, attack[0], attack[1], attack[2]);
    await expect(label, `${attack[1]} ${JSON.stringify(attack[2])}`).toHaveText(verdict, { timeout: 10_000 });
}

/** The zauthz* data as the gateway has it now: waits one poll, so a write would have shown. */
async function snapshot(page: Page) {
    await page.waitForTimeout(1200);
    const text = (await page.locator('#authz-snapshot').textContent()) ?? '';
    expect(text, 'the gateway read-back must work').toMatch(/^\{/);
    return JSON.parse(text);
}

function user(username: string, fields: object = {}) {
    return {
        username, firstName: 'Zauthz', lastName: 'User', schedule: 'Always', language: 'en', notes: 'original',
        roles: [] as string[], contactInfo: [], scheduleAdjustments: [], ...fields,
    };
}

function schedule(name: string, description = 'original') {
    const days: Record<string, unknown> = {};
    for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
        days[day] = true;
        days[`${day}Time`] = '0:00-24:00';
    }
    return { name, description, observeHolidays: false, allDays: true, ...days };
}

type Attack = [selector: string, eventName: string, payload: unknown];

// Each of these would change gateway data if the script let it through.
const PROMOTE: Attack = [USER, 'onUserSave', { user: user('zauthz-user', { notes: 'HACKED', roles: ['Administrator'] }), isNew: false }];
const SET_PASSWORD: Attack = [USER, 'onUserSave', { user: user('zauthz-user', { notes: 'HACKED' }), isNew: false, password: 'Hacked-1234!' }];
const EDIT_USER: Attack = [USER, 'onUserSave', { user: user('zauthz-user', { notes: 'HACKED' }), isNew: false }];
const CREATE_USER: Attack = [USER, 'onUserSave', { user: user('zauthz-new-user'), isNew: true, password: 'Hacked-1234!' }];
// isNew: false is a lie on these: the scripts must see that they create.
const CREATE_USER_LIE: Attack = [USER, 'onUserSave', { user: user('zauthz-new-user'), isNew: false }];
const DELETE_USER: Attack = [USER, 'onUserDelete', { username: 'zauthz-user' }];
const ADD_ROLE: Attack = [USER, 'onRoleSave', { name: 'zauthz-new-role' }];
const RENAME_ROLE: Attack = [USER, 'onRoleSave', { name: 'zauthz-renamed-role', oldName: 'zauthz-role' }];
const DELETE_ROLE: Attack = [USER, 'onRoleDelete', { name: 'zauthz-role' }];
const EDIT_SCHEDULE: Attack = [SCHEDULE, 'onScheduleSave', { schedule: schedule('zauthz-schedule', 'HACKED'), isNew: false }];
const CREATE_SCHEDULE: Attack = [SCHEDULE, 'onScheduleSave', { schedule: schedule('zauthz-new-schedule'), isNew: false }];
const DELETE_SCHEDULE: Attack = [SCHEDULE, 'onScheduleDelete', { name: 'zauthz-schedule' }];
const EDIT_ROSTER: Attack = [ROSTER, 'onRosterSave', { name: 'zauthz-roster', users: [], isNew: false }];
const CREATE_ROSTER: Attack = [ROSTER, 'onRosterSave', { name: 'zauthz-new-roster', users: [], isNew: false }];
const DELETE_ROSTER: Attack = [ROSTER, 'onRosterDelete', { name: 'zauthz-roster' }];
const EDIT_HOLIDAY: Attack = [HOLIDAY, 'onHolidaySave', { holiday: { name: 'zauthz-holiday', date: '2031-02-02', repeatAnnually: false }, isNew: false }];
const CREATE_HOLIDAY: Attack = [HOLIDAY, 'onHolidaySave', { holiday: { name: 'zauthz-new-holiday', date: '2031-02-02', repeatAnnually: false }, isNew: true }];
const CREATE_HOLIDAY_LIE: Attack = [HOLIDAY, 'onHolidaySave', { holiday: { name: 'zauthz-new-holiday', date: '2031-02-02', repeatAnnually: false }, isNew: false }];
const DELETE_HOLIDAY: Attack = [HOLIDAY, 'onHolidayDelete', { name: 'zauthz-holiday' }];

const PASSWORD = 'Authz-1234!';
const STRICT = /REFUSED: requires one of the roles Administrator$/;
const ACCOUNTS: Array<[string, string[]]> = [['zauthz-admin', ['Administrator']], ['zauthz-super', ['Supervisor']], ['zauthz-op', []]];
const USERS = ['zauthz-user', ...ACCOUNTS.map(([name]) => name)];
const ROLES = ['zauthz-role', 'zauthz-role-b'];
const SCHEDULES = ['zauthz-schedule', 'zauthz-schedule-b'];
const HOLIDAYS = ['zauthz-holiday', 'zauthz-holiday-b'];

/** Delete every zauthz* record not named in keep, through the scripts on the open view. */
async function sweep(page: Page, keep: string[] = []) {
    const now = await snapshot(page);
    const gone = (name: string) => !keep.includes(name);
    const attacks: Attack[] = [
        ...Object.keys(now.users).filter(gone).map((username): Attack => [USER, 'onUserDelete', { username }]),
        ...now.holidays.filter(gone).map((name: string): Attack => [HOLIDAY, 'onHolidayDelete', { name }]),
        ...Object.keys(now.rosters).filter(gone).map((name): Attack => [ROSTER, 'onRosterDelete', { name }]),
        ...now.schedules.filter(gone).map((name: string): Attack => [SCHEDULE, 'onScheduleDelete', { name }]),
        ...now.roles.filter(gone).map((name: string): Attack => [USER, 'onRoleDelete', { name }]),
    ];
    for (const attack of attacks) {
        await fireAndExpect(page, attack, /^on\w+ removed/);
    }
    return now;
}

/**
 * Put what the attacks aim at into its known state, through the same scripts on the open view:
 * the control. It resets rather than only creating what's missing, because a failed run skips
 * the rest of this serial group and the retry must not inherit a promoted user or a changed password.
 */
async function ensureFixtures(page: Page) {
    await openRoute(page, '/authz-open', USER);
    const now = await sweep(page, [...USERS, ...ROLES, ...SCHEDULES, ...HOLIDAYS, 'zauthz-roster']);
    for (const name of ROLES) {
        await fireAndExpect(page, [USER, 'onRoleSave', { name }], /^onRoleSave added/); // a no-op if it exists
    }
    const saved = /^on\w+Save (created|persisted)/;
    await fireAndExpect(page, [USER, 'onUserSave', { user: user('zauthz-user'), isNew: !now.users['zauthz-user'], password: PASSWORD }], saved);
    for (const name of SCHEDULES) {
        await fireAndExpect(page, [SCHEDULE, 'onScheduleSave', { schedule: schedule(name), isNew: false }], saved);
    }
    await fireAndExpect(page, [ROSTER, 'onRosterSave', { name: 'zauthz-roster', users: ['zauthz-user'], isNew: false }], saved);
    for (const name of HOLIDAYS) {
        await fireAndExpect(page, [HOLIDAY, 'onHolidaySave', { holiday: { name, date: '2030-01-01', repeatAnnually: false }, isNew: !now.holidays.includes(name) }], saved);
    }
    const after = await snapshot(page);
    expect(after.users['zauthz-user']).toMatchObject({ notes: 'original', roles: [] });
    expect(after.roles).toEqual(ROLES);
    expect(after.schedules).toEqual(SCHEDULES);
    expect(after.rosters['zauthz-roster']).toEqual(['zauthz-user']);
    expect(after.holidays).toEqual(HOLIDAYS);
    return after;
}

/**
 * The one record here that isn't named zauthz*: adminAuth.WRITE_ROLES names the role, so the
 * login tests need it spelled this way. On a developer's gateway it can be a real role, so
 * only what this file created is deleted.
 */
let supervisorCreated = false;

/** The accounts the login tests use, reset on the open view by an anonymous session. */
async function ensureAccounts(page: Page) {
    await ensureFixtures(page);
    const now = await snapshot(page);
    if (!now.kept.Supervisor) {
        await fireAndExpect(page, [USER, 'onRoleSave', { name: 'Supervisor' }], /^onRoleSave added/);
        supervisorCreated = true;
    }
    for (const [username, roles] of ACCOUNTS) {
        await fireAndExpect(page, [USER, 'onUserSave', { user: user(username, { roles }), isNew: !now.users[username], password: PASSWORD }], /^onUserSave persisted/);
    }
}

/** Remove everything this file created. Safe to run twice, and after a run that failed anywhere. */
async function cleanup(page: Page) {
    await openRoute(page, '/authz-open', USER);
    await sweep(page);
    if (supervisorCreated) {
        await fireAndExpect(page, [USER, 'onRoleDelete', { name: 'Supervisor' }], /^onRoleDelete removed/);
        supervisorCreated = false;
    }
    // toEqual, not toMatchObject: an empty {} there matches any object, so leftover
    // users or rosters would pass. `kept` is the only field that stays non-empty.
    const left = await snapshot(page);
    expect({ ...left, kept: undefined, odd: undefined }).toEqual({ users: {}, roles: [], schedules: [], rosters: {}, holidays: [] });
}

/** Keep hold of the session's socket and record what it sends. Call before the first page load. */
async function watchSocket(page: Page) {
    await page.addInitScript(() => {
        const Native = window.WebSocket;
        (window as any).WebSocket = class extends Native {
            constructor(url: string | URL, protocols?: string | string[]) {
                super(url, protocols);
                (window as any).__authzSocket = this;
            }
        };
    });
    const sent: string[] = [];
    page.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(String(f.payload))));
    return sent;
}

const qv = (value: unknown) => ({ $: ['qv', 0, Date.now()], $v: value });
const map = (fields: object) => ({ $: ['map', 0, Date.now()], ...fields });

/** Send a property write straight onto the socket, framed as the real client frames one. */
async function sendRaw(page: Page, body: { views?: object; session?: object }) {
    const frame = 'sync:' + JSON.stringify({ sync: 9000, views: {}, page: {}, session: {}, events: [], ...body });
    await page.evaluate((text) => (window as any).__authzSocket.send(text), frame);
}

/** Write a prop through the client's own store, which is how a crafted client starts. */
async function clientWrite(root: Locator, prop: string, value: unknown) {
    await root.evaluate((el: any, [name, v]: any) => {
        const key = Object.keys(el).find((k) => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber'))!;
        let fiber = el[key];
        while (fiber && !fiber.memoizedProps?.store) {
            fiber = fiber.return;
        }
        fiber.memoizedProps.store.props.write(name, v);
    }, [prop, value] as const);
}

/** Log in through the identity provider's real form. Starts from a clean session. */
async function login(page: Page, consoleErrors: string[], username: string, password: string) {
    await page.context().clearCookies();
    await page.goto('/data/perspective/login/verify');
    await page.locator('input[name=username]').fill(username);
    await page.keyboard.press('Enter');
    await page.locator('input[name=password]').fill(password);
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/data\/perspective\/client\/verify/, { timeout: 15_000 });
    consoleErrors.length = 0; // the login page isn't a component session
}

test.describe('Admin family: the event scripts authorize the write', () => {
    test.describe.configure({ mode: 'serial', timeout: 120_000 });

    // A failure skips the rest of this serial group, so the cleanup test can't be relied on alone.
    test.afterAll(async ({ browser }) => {
        const page = await browser.newPage();
        try {
            await cleanup(page);
        } finally {
            await page.close();
        }
    });

    test('control: with the flags on and the demo exemption, crafted events do write', async ({ page }) => {
        // Without this, every refusal below could just mean the crafted event never arrived.
        const before = await ensureFixtures(page);
        await fireAndExpect(page, EDIT_USER, /^onUserSave persisted "zauthz-user"/);
        const after = await snapshot(page);
        expect(after.users['zauthz-user'].notes).toBe('HACKED');
        expect(before.users['zauthz-user'].notes).toBe('original');
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('zauthz-user'), isNew: false }], /^onUserSave persisted/);
    });

    test('a session without the role is refused every write, and nothing changes', async ({ page }) => {
        await ensureFixtures(page);
        await openRoute(page, '/authz-no-role', USER);
        const before = await snapshot(page);
        const refused = /REFUSED: requires one of the roles /;
        for (const attack of [
            PROMOTE, SET_PASSWORD, EDIT_USER, CREATE_USER, DELETE_USER, ADD_ROLE, RENAME_ROLE, DELETE_ROLE,
            EDIT_SCHEDULE, CREATE_SCHEDULE, DELETE_SCHEDULE, EDIT_ROSTER, CREATE_ROSTER, DELETE_ROSTER,
            EDIT_HOLIDAY, CREATE_HOLIDAY, DELETE_HOLIDAY, CREATE_USER_LIE, CREATE_HOLIDAY_LIE,
        ]) {
            await fireAndExpect(page, attack, refused);
        }
        expect(await snapshot(page)).toEqual(before);
    });

    test('editable off refuses every edit, and nothing changes', async ({ page }) => {
        await ensureFixtures(page);
        await openRoute(page, '/authz-read-only', USER);
        const before = await snapshot(page);
        for (const attack of [PROMOTE, EDIT_USER, DELETE_USER, ADD_ROLE, EDIT_SCHEDULE, DELETE_SCHEDULE, EDIT_ROSTER, DELETE_ROSTER, EDIT_HOLIDAY, DELETE_HOLIDAY]) {
            await fireAndExpect(page, attack, /REFUSED: config\.editable is off/);
        }
        expect(await snapshot(page)).toEqual(before);
    });

    test('each capability flag that is off refuses its write, even when isNew lies', async ({ page }) => {
        await ensureFixtures(page);
        await openRoute(page, '/authz-flags-off', USER);
        const before = await snapshot(page);
        const cases: Array<[Attack, string]> = [
            [SET_PASSWORD, 'allowPasswordChange'],
            [ADD_ROLE, 'allowRoleManagement'],
            [RENAME_ROLE, 'allowRoleManagement'],
            [DELETE_ROLE, 'allowRoleManagement'],
            [CREATE_USER, 'allowCreate'],
            [CREATE_USER_LIE, 'allowCreate'],
            [CREATE_SCHEDULE, 'allowCreate'],
            [CREATE_ROSTER, 'allowCreate'],
            [CREATE_HOLIDAY, 'allowCreate'],
            [CREATE_HOLIDAY_LIE, 'allowCreate'],
            [DELETE_USER, 'allowDelete'],
            [DELETE_SCHEDULE, 'allowDelete'],
            [DELETE_ROSTER, 'allowDelete'],
            [DELETE_HOLIDAY, 'allowDelete'],
        ];
        for (const [attack, flag] of cases) {
            await fireAndExpect(page, attack, new RegExp(`REFUSED: config\\.${flag} is off`));
        }
        expect(await snapshot(page)).toEqual(before);
    });

    test('renaming onto an existing name is not a delete, and a failed rename keeps the old name', async ({ page }) => {
        await ensureFixtures(page);
        // editable is on and allowDelete off here. The old script added, ignored the result and removed A.
        await openRoute(page, '/authz-flags-off', USER);
        const before = await snapshot(page);
        await fireAndExpect(page, [SCHEDULE, 'onScheduleSave', { schedule: schedule('zauthz-schedule-b', 'HACKED'), oldName: 'zauthz-schedule', isNew: false }],
            /^onScheduleSave REFUSED: a schedule named "zauthz-schedule-b" already exists/);
        // Holidays and roles rely on the gateway refusing the rename.
        await fireAndExpect(page, [HOLIDAY, 'onHolidaySave', { holiday: { name: 'zauthz-holiday-b', date: '2031-02-02', repeatAnnually: false }, oldName: 'zauthz-holiday', isNew: false }],
            /^onHolidaySave ERRORS: .*already exists/);
        // The gateway's names conflict case-insensitively and the script's lookup doesn't, so only
        // (8.3 and 2027 word the conflict differently, "PushConflictException" on 2027: /i.)
        // the check on the add's result keeps the old schedule here.
        await fireAndExpect(page, [SCHEDULE, 'onScheduleSave', { schedule: schedule('ZAUTHZ-SCHEDULE-B', 'HACKED'), oldName: 'zauthz-schedule', isNew: false }],
            /^onScheduleSave ERRORS: .*conflict/i);
        // Holidays have no such check: the gateway's conflict is what keeps both.
        await fireAndExpect(page, [HOLIDAY, 'onHolidaySave', { holiday: { name: 'ZAUTHZ-HOLIDAY-B', date: '2031-02-02', repeatAnnually: false }, oldName: 'zauthz-holiday', isNew: false }],
            /^onHolidaySave ERRORS: .*conflict/i);
        expect(await snapshot(page)).toEqual(before);

        await openRoute(page, '/authz-open', USER);
        await fireAndExpect(page, [USER, 'onRoleSave', { name: 'zauthz-role-b', oldName: 'zauthz-role' }], /^onRoleSave ERRORS: .*exists/);
        expect(await snapshot(page)).toEqual(before);
        await fireAndExpect(page, [USER, 'onRoleSave', { name: 'ZAUTHZ-ROLE-B', oldName: 'zauthz-role' }], /^onRoleSave ERRORS: .*exists/);
        expect(await snapshot(page)).toEqual(before);
    });

    test('a schedule rename onto an unused name removes the old name with only editable', async ({ page }) => {
        // Deliberate and documented: this pins the behaviour the README warns about.
        await ensureFixtures(page);
        await openRoute(page, '/authz-flags-off', USER); // allowCreate and allowDelete are off
        await fireAndExpect(page, [SCHEDULE, 'onScheduleSave', { schedule: schedule('zauthz-schedule-c'), oldName: 'zauthz-schedule', isNew: false }],
            /^onScheduleSave renamed "zauthz-schedule" -> "zauthz-schedule-c"/);
        expect((await snapshot(page)).schedules).toEqual(['zauthz-schedule-b', 'zauthz-schedule-c']);
    });

    test('isNew on an existing name reports the conflict instead of overwriting', async ({ page }) => {
        await ensureFixtures(page);
        await openRoute(page, '/authz-open', USER);
        const before = await snapshot(page);
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('zauthz-user', { notes: 'HACKED' }), isNew: true }], /^onUserSave REFUSED: a user named/);
        await fireAndExpect(page, [HOLIDAY, 'onHolidaySave', { holiday: { name: 'zauthz-holiday', date: '2031-02-02', repeatAnnually: false }, isNew: true }], /^onHolidaySave REFUSED: a holiday named/);
        await fireAndExpect(page, [SCHEDULE, 'onScheduleSave', { schedule: schedule('zauthz-schedule', 'HACKED'), isNew: true }], /^onScheduleSave REFUSED: a schedule named/);
        await fireAndExpect(page, [ROSTER, 'onRosterSave', { name: 'zauthz-roster', users: [], isNew: true }], /^onRosterSave REFUSED: a roster named/);
        expect(await snapshot(page)).toEqual(before);
    });

    test('a new name the gateway would store wrongly is refused, for every kind of record (#260)', async ({ page }) => {
        await ensureFixtures(page);
        await openRoute(page, '/authz-open', USER);
        const before = await snapshot(page);
        const BAD: Array<[string, RegExp]> = [
            ['', /the name is empty/], ['   ', /the name is empty/], [' zauthz-pad', /starts or ends with a space/],
            ['zauthz\nline', /line break/], ['zauthz\ttab', /line break/], ['zauthz\u2028sep', /line break/],
            ['zauthz\u202eflip', /invisible character/], ['zauthz\u200bgap', /invisible character/],
            ['..', /only dots/], ['.', /only dots/],
        ];
        for (const [name, why] of BAD) {
            const refused = (event: string) => new RegExp(`^${event} REFUSED: .*${why.source}`);
            await fireAndExpect(page, [SCHEDULE, 'onScheduleSave', { schedule: schedule(name), isNew: true }], refused('onScheduleSave'));
            await fireAndExpect(page, [HOLIDAY, 'onHolidaySave', { holiday: { name, date: '2031-02-02', repeatAnnually: false }, isNew: true }], refused('onHolidaySave'));
            await fireAndExpect(page, [ROSTER, 'onRosterSave', { name, users: [], isNew: true }], refused('onRosterSave'));
            await fireAndExpect(page, [USER, 'onRoleSave', { name }], refused('onRoleSave'));
            await fireAndExpect(page, [USER, 'onUserSave', { user: user(name), isNew: true, password: PASSWORD }], refused('onUserSave'));
        }
        // A rename onto such a name is refused too, and keeps the old one.
        await fireAndExpect(page, [SCHEDULE, 'onScheduleSave', { schedule: schedule('..'), oldName: 'zauthz-schedule', isNew: false }], /^onScheduleSave REFUSED: the name is only dots/);
        await fireAndExpect(page, [HOLIDAY, 'onHolidaySave', { holiday: { name: '..', date: '2031-02-02', repeatAnnually: false }, oldName: 'zauthz-holiday', isNew: false }],
            /^onHolidaySave REFUSED: the name is only dots/);
        await fireAndExpect(page, [USER, 'onRoleSave', { name: '..', oldName: 'zauthz-role' }], /^onRoleSave REFUSED: the name is only dots/);
        // `odd` lists every badly named record on the gateway, whatever its prefix.
        expect(await snapshot(page)).toEqual(before);
    });

    test('non-ASCII names and text are stored as sent (#258)', async ({ page }) => {
        await ensureFixtures(page);
        await openRoute(page, '/authz-open', USER);
        const role = 'zauthz-rôle';
        const sched = 'zauthz-schédule-日本';
        const holiday = 'zauthz-hôliday';
        const roster = 'zauthz-röster';
        const saved = /^on\w+Save (added|created|persisted)/;
        await fireAndExpect(page, [USER, 'onRoleSave', { name: role }], saved);
        await fireAndExpect(page, [SCHEDULE, 'onScheduleSave', { schedule: schedule(sched, 'café'), isNew: true }], saved);
        await fireAndExpect(page, [HOLIDAY, 'onHolidaySave', { holiday: { name: holiday, date: '2031-03-03', repeatAnnually: false }, isNew: true }], saved);
        await fireAndExpect(page, [ROSTER, 'onRosterSave', { name: roster, users: ['zauthz-user'], isNew: true }], saved);
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('zauthz-user', { firstName: 'Zoë', notes: 'café — 日本', roles: [role] }), isNew: false }], saved);
        const now = await snapshot(page);
        expect(now.roles).toContain(role);
        expect(now.schedules).toContain(sched);
        expect(now.holidays).toContain(holiday);
        expect(now.rosters[roster]).toEqual(['zauthz-user']);
        expect(now.users['zauthz-user']).toMatchObject({ firstname: 'Zoë', notes: 'café — 日本', roles: [role] });
        // The views' read bindings hand them to the managers intact too, so a save from the UI
        // writes back what it read.
        const holidays = await openRoute(page, '/holidays', HOLIDAY);
        await expect(holidays.locator('.mustry-sched-item').filter({ hasText: holiday })).toHaveCount(1, { timeout: 15_000 });
        const schedules = await openRoute(page, '/schedule', SCHEDULE);
        await expect(schedules.locator('.mustry-sched-item').filter({ hasText: sched })).toHaveCount(1, { timeout: 15_000 });
        const users = await openRoute(page, '/users', USER);
        await expect(users.locator('.mustry-sched-item').filter({ hasText: 'Zoë' })).toHaveCount(1, { timeout: 15_000 });
        // The deletes find them by the same names: the next reset sweeps them through the scripts.
        await ensureFixtures(page);
    });

    test('a schedule delete the gateway rejects says so', async ({ page }) => {
        await openRoute(page, '/authz-open', USER);
        // A system schedule: the gateway refuses to delete it, in the returned UIResponse.
        await fireAndExpect(page, [SCHEDULE, 'onScheduleDelete', { name: 'Always' }], /^onScheduleDelete ERRORS: .*Always/);
    });

    test('a roster name that differs only by case never changes the existing roster', async ({ page }) => {
        await ensureFixtures(page);
        await openRoute(page, '/authz-open', USER);
        const before = await snapshot(page);
        // The script's lookup doesn't see this as the same roster, and system.roster reports
        // nothing back, so the verdict can claim a save that didn't happen. What matters is the data.
        for (const isNew of [true, false]) {
            await fireAndExpect(page, [ROSTER, 'onRosterSave', { name: 'ZAUTHZ-ROSTER', users: ['admin'], isNew }], /^onRosterSave /);
            expect((await snapshot(page)).rosters['zauthz-roster']).toEqual(before.rosters['zauthz-roster']);
        }
    });

    test('the admin account and role are kept, whatever the spelling and whether renamed or deleted', async ({ page }) => {
        await openRoute(page, '/authz-open', USER);
        // The user source matches these case-insensitively: without the guard, these really remove them.
        // A dotless i too: lowercasing the event text can't recognise it, but the user source's
        // case-insensitive match (ı upper-cases to I) finds admin. The guard refuses because it reads
        // the username of the user the gateway resolved, not the event text. Before #258 str()
        // garbled the ı on the way in, so the gateway found no user at all.
        for (const username of ['admin', 'ADMIN', 'Admin', 'adm\u0131n']) {
            await fireAndExpect(page, [USER, 'onUserDelete', { username }], /^onUserDelete REFUSED: the demo keeps the admin account/);
        }
        // Spellings the gateway doesn't match to admin.
        for (const username of [' admin', 'admin ']) {
            await fireAndExpect(page, [USER, 'onUserDelete', { username }], /^onUserDelete REFUSED: no user named/);
        }
        const keeps = 'the demo keeps the Administrator role';
        await fireAndExpect(page, [USER, 'onRoleDelete', { name: 'Administrator' }], new RegExp(`^onRoleDelete REFUSED: ${keeps}`));
        await fireAndExpect(page, [USER, 'onRoleSave', { name: 'zauthz-renamed-role', oldName: 'Administrator' }], new RegExp(`^onRoleSave REFUSED: ${keeps}`));
        for (const name of ['ADMINISTRATOR', 'administrator', ' Administrator', 'Adm\u0131n\u0131strator']) {
            await fireAndExpect(page, [USER, 'onRoleDelete', { name }], /^onRoleDelete REFUSED: no role named/);
            await fireAndExpect(page, [USER, 'onRoleSave', { name: 'zauthz-renamed-role', oldName: name }], /^onRoleSave REFUSED: no role named/);
        }
        expect((await snapshot(page)).kept).toMatchObject({ admin: true, Administrator: true });
    });

    test('raw frames cannot change a PROTECTED flag; the same frames land on a PUBLIC prop', async ({ page }) => {
        const sent = await watchSocket(page);
        await ensureFixtures(page);
        const root = await openRoute(page, '/authz-flags-off', USER);
        const before = await snapshot(page);
        const flag = page.locator('#authz-gateway-flag'); // read on the gateway by a binding
        const publicProp = page.locator('#authz-gateway-public');
        await expect(flag).toHaveText('false');

        // Take the wire address from a real write, so the raw frames match what the client sends.
        await clientWrite(root, 'state.selectedUser', 'client-write');
        await expect(publicProp).toHaveText('client-write');
        const real = sent.find((f) => f.startsWith('sync:') && f.includes('"state.selectedUser"'));
        expect(real, 'the real client must send this write as a sync frame').toBeTruthy();
        const views = JSON.parse(real!.slice('sync:'.length)).views;
        const viewKey = Object.keys(views)[0];
        const address = Object.keys(views[viewKey])[0];
        const raw = (props: object) => sendRaw(page, { views: { [viewKey]: { [address]: props } } });

        // Positive controls: a key and a whole parent object, on a PUBLIC prop.
        await raw({ 'state.selectedUser': qv('raw-key') });
        await expect(publicProp).toHaveText('raw-key');
        await raw({ state: map({ selectedUser: qv('raw-parent') }) });
        await expect(publicProp).toHaveText('raw-parent');

        // The client doesn't drop a PROTECTED write itself: it goes out, and the gateway ignores it.
        await clientWrite(root, 'config.allowDelete', true);
        await expect.poll(() => sent.some((f) => f.includes('"config.allowDelete"'))).toBe(true);
        await raw({ 'config.allowDelete': qv(true) });
        await raw({ config: map({ editable: qv(true), allowCreate: qv(true), allowDelete: qv(true), allowPasswordChange: qv(true), allowRoleManagement: qv(true) }) });

        // The socket handles frames in order, so when this lands the attacks have been handled.
        await raw({ 'state.selectedUser': qv('after-attacks') });
        await expect(publicProp).toHaveText('after-attacks');
        await expect(flag).toHaveText('false');
        await fireAndExpect(page, DELETE_USER, /REFUSED: config\.allowDelete is off/);
        expect(await snapshot(page)).toEqual(before);
    });

    test('raw frames cannot forge session.props.auth; the same frames land on a PUBLIC session prop', async ({ page }) => {
        const sent = await watchSocket(page);
        await ensureFixtures(page);
        await openRoute(page, '/authz-no-role', USER);
        const before = await snapshot(page);
        const session = page.locator('#authz-gateway-session'); // read on the gateway by a binding
        await expect(session).toHaveText('auth=false theme=light geo=false');
        expect(sent.some((f) => f.startsWith('sync:{')), 'the real client must use this framing').toBe(true);

        // Positive controls, with the sync number the attacks use: a flat key, then the two
        // shapes the attacks take, a dotted key and a nested map.
        await sendRaw(page, { session: { props: { theme: qv('dark') } } });
        await expect(session).toHaveText('auth=false theme=dark geo=false');
        await sendRaw(page, { session: { props: { 'geolocation.enabled': qv(true) } } });
        await expect(session).toHaveText('auth=false theme=dark geo=true');
        await sendRaw(page, { session: { props: { geolocation: map({ enabled: qv(false) }) } } });
        await expect(session).toHaveText('auth=false theme=dark geo=false');

        await sendRaw(page, { session: { props: {
            'auth.authenticated': qv(true),
            'auth.user.userName': qv('admin'),
            'auth.user.roles': { $: ['array', 0, Date.now()], $a: [qv('Administrator')] },
        } } });
        await sendRaw(page, { session: { props: { auth: map({
            authenticated: qv(true),
            user: map({ userName: qv('admin'), roles: { $: ['array', 0, Date.now()], $a: [qv('Administrator')] } }),
        }) } } });

        // The socket handles frames in order, so when this lands the attacks have been handled.
        await sendRaw(page, { session: { props: { theme: qv('light') } } });
        await expect(session).toHaveText('auth=false theme=light geo=false');
        await fireAndExpect(page, PROMOTE, /REFUSED: requires one of the roles /);
        expect(await snapshot(page)).toEqual(before);
    });

    test('logged in without a role: refused, and the demo exemption does not apply', async ({ page, consoleErrors }) => {
        await ensureAccounts(page);
        await login(page, consoleErrors, 'zauthz-op', PASSWORD);
        // AuthzOpen is on the demo exemption list and an anonymous session writes there:
        // this refusal also shows the session really is logged in.
        await openRoute(page, '/authz-open', USER);
        const before = await snapshot(page);
        const refused = /REFUSED: requires one of the roles /;
        for (const attack of [PROMOTE, EDIT_USER, EDIT_SCHEDULE, EDIT_ROSTER, EDIT_HOLIDAY, DELETE_HOLIDAY]) {
            await fireAndExpect(page, attack, refused);
        }
        expect(await snapshot(page)).toEqual(before);
    });

    test('a Supervisor can edit, but not passwords, roles or accounts', async ({ page, consoleErrors }) => {
        await ensureAccounts(page);
        await login(page, consoleErrors, 'zauthz-super', PASSWORD);
        await openRoute(page, '/authz-no-role', USER);
        const before = await snapshot(page);
        for (const attack of [PROMOTE, SET_PASSWORD, CREATE_USER, CREATE_USER_LIE, DELETE_USER, ADD_ROLE, RENAME_ROLE, DELETE_ROLE]) {
            await fireAndExpect(page, attack, STRICT);
        }
        expect(await snapshot(page)).toEqual(before);

        await fireAndExpect(page, EDIT_USER, /^onUserSave persisted "zauthz-user"/);
        await fireAndExpect(page, EDIT_SCHEDULE, /^onScheduleSave persisted/);
        expect((await snapshot(page)).users['zauthz-user']).toMatchObject({ notes: 'HACKED', roles: [] });
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('zauthz-user'), isNew: false }], /^onUserSave persisted/);
    });

    test('a refused password change leaves the old password working', async ({ page, consoleErrors }) => {
        // ensureAccounts resets the password, so the refusals that matter come after it.
        await ensureAccounts(page);
        await openRoute(page, '/authz-no-role', USER);
        await fireAndExpect(page, SET_PASSWORD, /REFUSED: requires one of the roles /);
        await login(page, consoleErrors, 'zauthz-super', PASSWORD);
        await openRoute(page, '/authz-no-role', USER);
        await fireAndExpect(page, SET_PASSWORD, STRICT);
        await login(page, consoleErrors, 'zauthz-user', PASSWORD);
        await openRoute(page, '/authz-no-role', USER);
    });

    test('an Administrator can do the strict writes', async ({ page, consoleErrors }) => {
        await ensureAccounts(page);
        await login(page, consoleErrors, 'zauthz-admin', PASSWORD);
        await openRoute(page, '/authz-no-role', USER);

        await fireAndExpect(page, PROMOTE, /^onUserSave persisted "zauthz-user"/);
        expect((await snapshot(page)).users['zauthz-user'].roles).toEqual(['Administrator']);
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('zauthz-user'), isNew: false }], /^onUserSave persisted/);

        await fireAndExpect(page, CREATE_USER, /^onUserSave persisted "zauthz-new-user" \(isNew=True, password set/);
        expect((await snapshot(page)).users['zauthz-new-user']).toBeTruthy();
        await fireAndExpect(page, [USER, 'onUserDelete', { username: 'zauthz-new-user' }], /^onUserDelete removed/);
        expect((await snapshot(page)).users['zauthz-new-user']).toBeUndefined();

        await fireAndExpect(page, ADD_ROLE, /^onRoleSave added/);
        expect((await snapshot(page)).roles).toContain('zauthz-new-role');
        await fireAndExpect(page, RENAME_ROLE, /^onRoleSave renamed/);
        expect((await snapshot(page)).roles).toEqual(['zauthz-new-role', 'zauthz-renamed-role', 'zauthz-role-b']);
        await fireAndExpect(page, [USER, 'onRoleSave', { name: 'zauthz-role', oldName: 'zauthz-renamed-role' }], /^onRoleSave renamed/);
        await fireAndExpect(page, [USER, 'onRoleDelete', { name: 'zauthz-new-role' }], /^onRoleDelete removed/);
        expect((await snapshot(page)).roles).toEqual(ROLES);

        const newPassword = 'Authz-5678!';
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('zauthz-user'), isNew: false, password: newPassword }], /password set/);
        // The control for the password test above: this login only works if the write landed.
        await login(page, consoleErrors, 'zauthz-user', newPassword);
        await openRoute(page, '/authz-no-role', USER);
    });

    test('cleanup leaves a Supervisor role it did not create', async ({ page }) => {
        await cleanup(page);
        const hadIt = (await snapshot(page)).kept.Supervisor;
        const role = (eventName: string, verdict: RegExp) => fireAndExpect(page, [USER, eventName, { name: 'Supervisor' }], verdict);
        if (!hadIt) {
            await role('onRoleSave', /^onRoleSave added/);
        }
        try {
            await ensureAccounts(page);
            await cleanup(page);
            expect((await snapshot(page)).kept.Supervisor).toBe(true);
        } finally {
            if (!hadIt) {
                await role('onRoleDelete', /^onRoleDelete removed/);
            }
        }
    });

    test('cleanup: the control removes what the attacks aimed at', async ({ page }) => {
        await cleanup(page);
    });
});

test.describe('Admin family: the reference views stay guarded', () => {
    const managers = (node: any, found: any[] = []): any[] => {
        if (Array.isArray(node)) {
            node.forEach((n) => managers(n, found));
        } else if (node && typeof node === 'object') {
            if (String(node.type ?? '').startsWith('mustrysolutions.perspective.admin.')) {
                found.push(node);
            }
            Object.values(node).forEach((n) => managers(n, found));
        }
        return found;
    };

    const viewFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? viewFiles(full) : entry.name === 'view.json' ? [full] : [];
    });
    /** Every script in a view: event scripts ("script") and binding transforms ("code"). */
    const scripts = (node: any, found: Array<{ kind: string; text: string }> = []) => {
        if (Array.isArray(node)) {
            node.forEach((n) => scripts(n, found));
        } else if (node && typeof node === 'object') {
            for (const [key, value] of Object.entries(node)) {
                if ((key === 'script' || key === 'code') && typeof value === 'string') {
                    found.push({ kind: key, text: value });
                } else {
                    scripts(value, found);
                }
            }
        }
        return found;
    };
    const WRITER = /system\.(?:user\.(?:add|edit|remove|save|delete)\w*|roster\.(?:create|delete|add|remove|edit|save)\w*)\s*\(/g;
    const DEMO_ONLY = '# DEMO ONLY, NEVER COPY THIS SEEDING';
    const GUARD = /refused = adminAuth\.refusal\(self,[^\n]*\n\s*if refused:\n[^\n]*\n\s*return\n/;
    const EVENTS: Record<string, string[]> = {
        schedulemanager: ['onScheduleSave', 'onScheduleDelete'],
        rostermanager: ['onRosterSave', 'onRosterDelete'],
        usermanager: ['onUserSave', 'onUserDelete', 'onRoleSave', 'onRoleDelete'],
        holidaymanager: ['onHolidaySave', 'onHolidayDelete'],
    };

    /** The check has to refuse and return, and come before the first writer call. */
    const expectGuardFirst = (script: string, what: string) => {
        const check = GUARD.exec(script);
        expect(check, `${what}: the check must refuse and return`).not.toBeNull();
        const write = script.search(WRITER);
        expect(write, `${what} must write`).toBeGreaterThan(-1);
        expect(check!.index + check![0].length, `${what}: the check must come before the first write`).toBeLessThanOrEqual(write);
    };

    test('every admin manager has PROTECTED flags and every event authorizes before it writes', () => {
        const guarded: Record<string, number> = {};
        for (const dir of VIEW_DIRS) {
            for (const file of viewFiles(dir)) {
                const name = path.basename(path.dirname(file));
                for (const manager of managers(JSON.parse(fs.readFileSync(file, 'utf8')))) {
                    const events = manager.events?.component ?? {};
                    // No handlers, nothing to write with: a display-only test view (TimezoneManagers).
                    // The per-view counts below catch handlers dropped from a reference view.
                    if (Object.keys(events).length === 0) {
                        continue;
                    }
                    expect(manager.propConfig?.['props.config']?.access, `${name} ${manager.meta.name}`).toBe('PROTECTED');
                    expect(Object.keys(events).sort(), `${name} ${manager.meta.name}`).toEqual([...EVENTS[manager.type.split('.').pop()]].sort());
                    for (const [event, handler] of Object.entries<any>(events)) {
                        for (const action of [handler].flat()) {
                            expectGuardFirst(action.config.script, `${name} ${event}`);
                            guarded[name] = (guarded[name] ?? 0) + 1;
                        }
                    }
                }
            }
        }
        // Each view, with every event of every manager it holds: a dropped view or handler fails here.
        const all = 10;
        expect(guarded).toEqual({
            UserDemo: 4, ScheduleDemo: 2, RosterDemo: 2, HolidayDemo: 2, AdminConsole: all, Admin: all,
            AuthzOpen: all, AuthzReadOnly: all, AuthzFlagsOff: all, AuthzNoRole: all,
        });
    });

    test('nothing writes without that check, except the marked demo seeding in bindings', () => {
        let seeding = 0;
        for (const dir of VIEW_DIRS) {
            for (const file of viewFiles(dir)) {
                const name = path.basename(path.dirname(file));
                for (const { kind, text } of scripts(JSON.parse(fs.readFileSync(file, 'utf8')))) {
                    const calls = text.match(WRITER) ?? [];
                    if (calls.length === 0) {
                        continue;
                    }
                    if (kind === 'script') {
                        expectGuardFirst(text, `${name}: an event script`);
                        continue;
                    }
                    // A binding runs for every session that opens the view.
                    expect(text, `${name}: a binding that writes must be marked`).toContain(DEMO_ONLY);
                    expect(calls.map((c) => c.replace(/\s*\($/, '')).filter((c) => c !== 'system.user.addUser' && c !== 'system.user.addHoliday'), `${name}: seeding only adds`).toEqual([]);
                    seeding++;
                }
            }
        }
        // UserDemo, RosterDemo and HolidayDemo, and three each in AdminConsole and the demo's Admin.
        expect(seeding).toBe(9);
    });

    test('the project libraries do not write', () => {
        const libraries = ['ops/verify/project', 'ops/demo/project'].flatMap((project) => {
            const dir = path.join(REPO, project, 'ignition/script-python');
            return fs.readdirSync(dir).map((library) => path.join(dir, library, 'code.py'));
        });
        expect(libraries.length, 'the libraries must be found').toBeGreaterThan(0);
        for (const library of libraries) {
            expect(fs.readFileSync(library, 'utf8').match(WRITER), library).toBeNull();
        }
    });

    test('no admin event script or read binding passes text through str() (#258)', () => {
        // str() on a unicode value garbles anything non-ASCII in Jython: unicode() keeps it. The
        // bindings matter as much as the events: a garbled read is written back on the next save.
        let seen = 0;
        for (const dir of VIEW_DIRS) {
            for (const file of viewFiles(dir)) {
                const name = path.basename(path.dirname(file));
                for (const manager of managers(JSON.parse(fs.readFileSync(file, 'utf8')))) {
                    for (const { text } of scripts(manager)) {
                        expect(text, `${name} ${manager.meta.name}`).not.toMatch(/\bstr\(/);
                        seen++;
                    }
                }
            }
        }
        expect(seen, 'the scripts must be found').toBeGreaterThan(70);
    });

    test('the save scripts check a new name on the gateway before they write (#260)', () => {
        const CHECK = /bad = adminAuth\.nameProblem\((?:name|username)\)\n\s*if bad:\n[^\n]*REFUSED[^\n]*\n\s*return\n/;
        let checked = 0;
        for (const dir of VIEW_DIRS) {
            for (const file of viewFiles(dir)) {
                const name = path.basename(path.dirname(file));
                for (const manager of managers(JSON.parse(fs.readFileSync(file, 'utf8')))) {
                    for (const [event, handler] of Object.entries<any>(manager.events?.component ?? {})) {
                        if (!['onScheduleSave', 'onHolidaySave', 'onRosterSave', 'onRoleSave', 'onUserSave'].includes(event)) {
                            continue;
                        }
                        for (const action of [handler].flat()) {
                            const script: string = action.config.script;
                            const check = CHECK.exec(script);
                            expect(check, `${name} ${event}: the name check must refuse and return`).not.toBeNull();
                            expect(check!.index + check![0].length, `${name} ${event}: before the first write`).toBeLessThanOrEqual(script.search(WRITER));
                            checked++;
                        }
                    }
                }
            }
        }
        // The four demo views (UserDemo has two saves), then all five saves in AdminConsole, Admin and the four Authz views.
        expect(checked).toBe(5 + 5 * 6);
    });

    test('the verify and demo projects carry the same adminAuth library', () => {
        const read = (p: string) => fs.readFileSync(path.join(REPO, p, 'ignition/script-python/adminAuth/code.py'), 'utf8');
        expect(read('ops/demo/project')).toBe(read('ops/verify/project'));
    });
});
