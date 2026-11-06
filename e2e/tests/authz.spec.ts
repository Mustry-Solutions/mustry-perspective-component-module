import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
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

/** The authz* data as the gateway has it now: waits one poll, so a write would have shown. */
async function snapshot(page: Page) {
    await page.waitForTimeout(1200);
    const text = (await page.locator('#authz-snapshot').textContent()) ?? '';
    expect(text, 'the gateway read-back must work').toMatch(/^\{/);
    return JSON.parse(text);
}

function user(username: string, fields: object = {}) {
    return {
        username, firstName: 'Authz', lastName: 'User', schedule: 'Always', language: 'en', notes: 'original',
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
const PROMOTE: Attack = [USER, 'onUserSave', { user: user('authz-user', { notes: 'HACKED', roles: ['Administrator'] }), isNew: false }];
const SET_PASSWORD: Attack = [USER, 'onUserSave', { user: user('authz-user', { notes: 'HACKED' }), isNew: false, password: 'Hacked-1234!' }];
const EDIT_USER: Attack = [USER, 'onUserSave', { user: user('authz-user', { notes: 'HACKED' }), isNew: false }];
const CREATE_USER: Attack = [USER, 'onUserSave', { user: user('authz-new-user'), isNew: true, password: 'Hacked-1234!' }];
const DELETE_USER: Attack = [USER, 'onUserDelete', { username: 'authz-user' }];
const ADD_ROLE: Attack = [USER, 'onRoleSave', { name: 'authz-new-role' }];
const RENAME_ROLE: Attack = [USER, 'onRoleSave', { name: 'authz-renamed-role', oldName: 'authz-role' }];
const DELETE_ROLE: Attack = [USER, 'onRoleDelete', { name: 'authz-role' }];
const EDIT_SCHEDULE: Attack = [SCHEDULE, 'onScheduleSave', { schedule: schedule('authz-schedule', 'HACKED'), isNew: false }];
// isNew: false is a lie here: the scripts must see that this creates.
const CREATE_SCHEDULE: Attack = [SCHEDULE, 'onScheduleSave', { schedule: schedule('authz-new-schedule'), isNew: false }];
const DELETE_SCHEDULE: Attack = [SCHEDULE, 'onScheduleDelete', { name: 'authz-schedule' }];
const EDIT_ROSTER: Attack = [ROSTER, 'onRosterSave', { name: 'authz-roster', users: [], isNew: false }];
const CREATE_ROSTER: Attack = [ROSTER, 'onRosterSave', { name: 'authz-new-roster', users: [], isNew: false }];
const DELETE_ROSTER: Attack = [ROSTER, 'onRosterDelete', { name: 'authz-roster' }];
const EDIT_HOLIDAY: Attack = [HOLIDAY, 'onHolidaySave', { holiday: { name: 'authz-holiday', date: '2031-02-02', repeatAnnually: false }, isNew: false }];
const CREATE_HOLIDAY: Attack = [HOLIDAY, 'onHolidaySave', { holiday: { name: 'authz-new-holiday', date: '2031-02-02', repeatAnnually: false }, isNew: true }];
const DELETE_HOLIDAY: Attack = [HOLIDAY, 'onHolidayDelete', { name: 'authz-holiday' }];

/** Create what the attacks aim at, through the same scripts on the open view: the control. */
async function ensureFixtures(page: Page) {
    await openRoute(page, '/authz-open', USER);
    const now = await snapshot(page);
    const steps: Array<[boolean, Attack, RegExp]> = [
        [now.roles.includes('authz-role'), [USER, 'onRoleSave', { name: 'authz-role' }], /^onRoleSave added/],
        [!!now.users['authz-user'], [USER, 'onUserSave', { user: user('authz-user'), isNew: true, password: 'Authz-1234!' }], /^onUserSave persisted/],
        [now.schedules.includes('authz-schedule'), [SCHEDULE, 'onScheduleSave', { schedule: schedule('authz-schedule'), isNew: true }], /^onScheduleSave created/],
        [!!now.rosters['authz-roster'], [ROSTER, 'onRosterSave', { name: 'authz-roster', users: ['authz-user'], isNew: true }], /^onRosterSave persisted/],
        [now.holidays.includes('authz-holiday'), [HOLIDAY, 'onHolidaySave', { holiday: { name: 'authz-holiday', date: '2030-01-01', repeatAnnually: false }, isNew: true }], /^onHolidaySave created/],
    ];
    for (const [present, attack, verdict] of steps) {
        if (!present) {
            await fireAndExpect(page, attack, verdict);
        }
    }
    const after = await snapshot(page);
    expect(after.users['authz-user']).toMatchObject({ notes: 'original', roles: [] });
    expect(after.roles).toContain('authz-role');
    expect(after.schedules).toContain('authz-schedule');
    expect(after.rosters['authz-roster']).toEqual(['authz-user']);
    expect(after.holidays).toContain('authz-holiday');
    return after;
}

const ACCOUNTS: Array<[string, string[]]> = [['authz-admin', ['Administrator']], ['authz-super', ['Supervisor']], ['authz-op', []]];
const PASSWORD = 'Authz-1234!';
const STRICT = /REFUSED: requires one of the roles Administrator$/;

/** The accounts the login tests use, created on the open view by an anonymous session. */
async function ensureAccounts(page: Page) {
    await ensureFixtures(page);
    const now = await snapshot(page);
    await fireAndExpect(page, [USER, 'onRoleSave', { name: 'Supervisor' }], /^onRoleSave (added|ERRORS)/);
    for (const [username, roles] of ACCOUNTS) {
        if (!now.users[username]) {
            await fireAndExpect(page, [USER, 'onUserSave', { user: user(username, { roles }), isNew: true, password: PASSWORD }], /^onUserSave persisted/);
        }
    }
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
    test.describe.configure({ mode: 'serial' });

    test('control: with the flags on and the demo exemption, crafted events do write', async ({ page }) => {
        // Without this, every refusal below could just mean the crafted event never arrived.
        const before = await ensureFixtures(page);
        await fireAndExpect(page, EDIT_USER, /^onUserSave persisted "authz-user"/);
        const after = await snapshot(page);
        expect(after.users['authz-user'].notes).toBe('HACKED');
        expect(before.users['authz-user'].notes).toBe('original');
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('authz-user'), isNew: false }], /^onUserSave persisted/);
    });

    test('a session without the role is refused every write, and nothing changes', async ({ page }) => {
        await ensureFixtures(page);
        await openRoute(page, '/authz-no-role', USER);
        const before = await snapshot(page);
        const refused = /REFUSED: requires one of the roles /;
        for (const attack of [
            PROMOTE, SET_PASSWORD, EDIT_USER, CREATE_USER, DELETE_USER, ADD_ROLE, RENAME_ROLE, DELETE_ROLE,
            EDIT_SCHEDULE, CREATE_SCHEDULE, DELETE_SCHEDULE, EDIT_ROSTER, CREATE_ROSTER, DELETE_ROSTER,
            EDIT_HOLIDAY, CREATE_HOLIDAY, DELETE_HOLIDAY,
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
            [CREATE_SCHEDULE, 'allowCreate'],
            [CREATE_ROSTER, 'allowCreate'],
            [CREATE_HOLIDAY, 'allowCreate'],
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

    test('a client cannot turn a PROTECTED flag back on', async ({ page }) => {
        await ensureFixtures(page);
        const root = await openRoute(page, '/authz-flags-off', USER);
        const before = await snapshot(page);
        await root.evaluate((el: any) => {
            const key = Object.keys(el).find((k) => k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber'))!;
            let fiber = el[key];
            while (fiber && !fiber.memoizedProps?.store) {
                fiber = fiber.return;
            }
            fiber.memoizedProps.store.props.write('config.allowDelete', true);
        });
        await page.waitForTimeout(1000);
        await fireAndExpect(page, DELETE_USER, /REFUSED: config\.allowDelete is off/);
        expect(await snapshot(page)).toEqual(before);
    });

    test('a client cannot forge session.props.auth on the wire', async ({ page }) => {
        await page.addInitScript(() => {
            const Native = window.WebSocket;
            (window as any).WebSocket = class extends Native {
                constructor(url: string | URL, protocols?: string | string[]) {
                    super(url, protocols);
                    (window as any).__authzSocket = this;
                }
            };
        });
        await ensureFixtures(page);
        const sent: string[] = [];
        page.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(String(f.payload))));
        await openRoute(page, '/authz-no-role', USER);
        const before = await snapshot(page);
        await page.evaluate(() => {
            const qv = (v: unknown) => ({ $: ['qv', 0, Date.now()], $v: v });
            (window as any).__authzSocket.send('sync:' + JSON.stringify({
                sync: 9000, views: {}, page: {}, events: [],
                session: { props: {
                    'auth.authenticated': qv(true),
                    'auth.user.userName': qv('admin'),
                    'auth.user.roles': { $: ['array', 0, Date.now()], $a: [qv('Administrator')] },
                } },
            }));
        });
        // Make sure that is the framing the real client uses, or this proves nothing.
        expect(sent.some((f) => f.startsWith('sync:{'))).toBe(true);
        await page.waitForTimeout(1000);
        await fireAndExpect(page, PROMOTE, /REFUSED: requires one of the roles /);
        expect(await snapshot(page)).toEqual(before);
    });

    test('logged in without a role: refused, and the demo exemption does not apply', async ({ page, consoleErrors }) => {
        await ensureAccounts(page);
        await login(page, consoleErrors, 'authz-op', PASSWORD);
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
        await login(page, consoleErrors, 'authz-super', PASSWORD);
        await openRoute(page, '/authz-no-role', USER);
        const before = await snapshot(page);
        for (const attack of [PROMOTE, SET_PASSWORD, CREATE_USER, DELETE_USER, ADD_ROLE, RENAME_ROLE, DELETE_ROLE]) {
            await fireAndExpect(page, attack, STRICT);
        }
        expect(await snapshot(page)).toEqual(before);

        await fireAndExpect(page, EDIT_USER, /^onUserSave persisted "authz-user"/);
        await fireAndExpect(page, EDIT_SCHEDULE, /^onScheduleSave persisted/);
        expect((await snapshot(page)).users['authz-user']).toMatchObject({ notes: 'HACKED', roles: [] });
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('authz-user'), isNew: false }], /^onUserSave persisted/);
    });

    test('a refused password change leaves the old password working', async ({ page, consoleErrors }) => {
        // SET_PASSWORD was refused above for an anonymous session and a Supervisor.
        await ensureAccounts(page);
        await login(page, consoleErrors, 'authz-user', 'Authz-1234!');
        await openRoute(page, '/authz-no-role', USER);
    });

    test('an Administrator can do the strict writes', async ({ page, consoleErrors }) => {
        await ensureAccounts(page);
        await login(page, consoleErrors, 'authz-admin', PASSWORD);
        await openRoute(page, '/authz-no-role', USER);
        await fireAndExpect(page, PROMOTE, /^onUserSave persisted "authz-user"/);
        expect((await snapshot(page)).users['authz-user'].roles).toEqual(['Administrator']);
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('authz-user'), isNew: false }], /^onUserSave persisted/);
        const newPassword = 'Authz-5678!';
        await fireAndExpect(page, [USER, 'onUserSave', { user: user('authz-user'), isNew: false, password: newPassword }], /password set/);
        // The control for the password test above: this login only works if the write landed.
        await login(page, consoleErrors, 'authz-user', newPassword);
        await openRoute(page, '/authz-no-role', USER);
    });

    test('cleanup: the control removes what the attacks aimed at', async ({ page }) => {
        await openRoute(page, '/authz-open', USER);
        for (const [attack, verdict] of [
            ...ACCOUNTS.map(([username]) => [[USER, 'onUserDelete', { username }], /^onUserDelete removed/]),
            [[USER, 'onRoleDelete', { name: 'Supervisor' }], /^onRoleDelete removed/],
            [DELETE_HOLIDAY, /^onHolidayDelete removed/],
            [DELETE_ROSTER, /^onRosterDelete removed/],
            [DELETE_SCHEDULE, /^onScheduleDelete removed/],
            [DELETE_USER, /^onUserDelete removed/],
            [DELETE_ROLE, /^onRoleDelete removed/],
        ] as unknown as Array<[Attack, RegExp]>) {
            await fireAndExpect(page, attack, verdict);
        }
        expect(await snapshot(page)).toEqual({ users: {}, roles: [], schedules: [], rosters: {}, holidays: [] });
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

    test('every admin manager has PROTECTED flags and every event script calls adminAuth', () => {
        let scripts = 0;
        for (const dir of VIEW_DIRS) {
            for (const name of fs.readdirSync(dir)) {
                const file = path.join(dir, name, 'view.json');
                if (!fs.existsSync(file)) {
                    continue;
                }
                for (const manager of managers(JSON.parse(fs.readFileSync(file, 'utf8')))) {
                    expect(manager.propConfig?.['props.config']?.access, `${name} ${manager.meta.name}`).toBe('PROTECTED');
                    for (const [event, handler] of Object.entries<any>(manager.events?.component ?? {})) {
                        for (const action of [handler].flat()) {
                            expect(action.config.script, `${name} ${event}`).toContain('adminAuth.refusal(self,');
                            scripts++;
                        }
                    }
                }
            }
        }
        expect(scripts).toBeGreaterThanOrEqual(30);
    });

    test('the verify and demo projects carry the same adminAuth library', () => {
        const read = (p: string) => fs.readFileSync(path.join(REPO, p, 'ignition/script-python/adminAuth/code.py'), 'utf8');
        expect(read('ops/demo/project')).toBe(read('ops/verify/project'));
    });
});
