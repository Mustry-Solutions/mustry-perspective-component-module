// Pure logic of the Idle Guard: the idle state machine, the alarm policy, and
// the burn-in helpers. No DOM, no React: everything here is node-tested
// (__tests__/idleLogic.test.ts). IdleGuard.tsx wires it to the browser.

// --- alarm priorities ---------------------------------------------------------

/** Priority names as the gateway feed sends them (AlarmPriority.getIntValue order). */
export const PRIORITIES = ['diagnostic', 'low', 'medium', 'high', 'critical'] as const;
export type Priority = typeof PRIORITIES[number];

export const CRITICAL = 4;

/** 'High', 'high', 3 or '3' -> 3; anything else -> fallback. */
export function priorityIndex(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= CRITICAL) {
        return value;
    }
    if (typeof value === 'string') {
        const i = PRIORITIES.indexOf(value.trim().toLowerCase() as Priority);
        if (i >= 0) {
            return i;
        }
        const n = Number(value);
        if (value.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= CRITICAL) {
            return n;
        }
    }
    return fallback;
}

export type AlarmCounts = Record<Priority, number>;

export function zeroCounts(): AlarmCounts {
    return { diagnostic: 0, low: 0, medium: 0, high: 0, critical: 0 };
}

export interface TopAlarm {
    label: string;
    displayPath: string;
    priority: Priority;
    acked: boolean;
    activeSince: number;
}

/** One screensaver-alarms message from the gateway, stamped with the browser's receive time. */
export interface AlarmFeed {
    active: AlarmCounts;
    unacked: AlarmCounts;
    top: TopAlarm[];
    seq: number;
    /**
     * Browser monotonic clock (performance.now()) when it arrived. Staleness never
     * uses the gateway's clock, nor the browser's wall clock: a backward NTP step
     * must not keep a dead feed "ok".
     */
    receivedAt: number;
}

function readCounts(raw: unknown): AlarmCounts {
    const out = zeroCounts();
    if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        for (const p of PRIORITIES) {
            const n = Number(o[p]);
            out[p] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
        }
    }
    return out;
}

/** Parse a screensaver-alarms payload; null when it is not one. */
export function parseFeed(raw: unknown, receivedAt: number): AlarmFeed | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const o = raw as Record<string, unknown>;
    if (!o.active || typeof o.active !== 'object') {
        return null;
    }
    const top: TopAlarm[] = Array.isArray(o.top)
        ? (o.top as unknown[]).filter((t): t is Record<string, unknown> => !!t && typeof t === 'object').map((t) => ({
            label: String(t.label ?? ''),
            displayPath: String(t.displayPath ?? ''),
            priority: PRIORITIES[priorityIndex(t.priority, 1)],
            acked: t.acked === true,
            activeSince: Number(t.activeSince) || 0
        }))
        : [];
    return {
        active: readCounts(o.active),
        unacked: readCounts(o.unacked),
        top,
        seq: Number(o.seq) || 0,
        receivedAt
    };
}

export interface AlarmPolicy {
    wakePriority: number;
    pinPriority: number;
    includeAcked: boolean;
    staleAfterMs: number;
}

export interface AlarmVerdict {
    /** A feed message arrived within staleAfterMs. Without it the guard must not cover the page. */
    feedOk: boolean;
    /** An alarm at or above the wake priority is active: wake, and stay awake while it is. */
    wake: boolean;
    /** An alarm between the pin and wake priorities is active: show the banner. */
    pin: boolean;
    /** Highest counted priority, -1 when none. */
    highest: number;
    /** The counts the policy used (acked ones dropped when includeAcked is off, never for Critical). */
    counted: AlarmCounts;
}

/**
 * The alarm policy. Invariants, all tested:
 * - an active Critical alarm always wakes, whatever wakePriority says, acked or not;
 * - a stale or missing feed never allows covering the page (fail open).
 */
export function evaluateAlarms(feed: AlarmFeed | null, policy: AlarmPolicy, now: number): AlarmVerdict {
    const counted = zeroCounts();
    const feedOk = feed !== null && now - feed.receivedAt <= policy.staleAfterMs;
    if (feed !== null) {
        PRIORITIES.forEach((p, i) => {
            counted[p] = policy.includeAcked || i === CRITICAL ? feed.active[p] : feed.unacked[p];
        });
    }
    const wakeAt = Math.min(Math.max(0, policy.wakePriority), CRITICAL);
    const pinAt = Math.min(Math.max(0, policy.pinPriority), wakeAt);
    let highest = -1;
    PRIORITIES.forEach((p, i) => {
        if (counted[p] > 0) {
            highest = i;
        }
    });
    return {
        feedOk,
        wake: highest >= wakeAt,
        pin: highest >= pinAt && highest < wakeAt,
        highest,
        counted
    };
}

// --- idle state machine ---------------------------------------------------------

export type Phase = 'active' | 'idle';
export type WakeCause = 'input' | 'alarm' | 'feed-stale' | 'disabled';

/**
 * Times come in two clocks. `lastInput` and `idleSince` are monotonic
 * (performance.now()): every delta is taken on them, so a wall-clock step (NTP,
 * a user changing the time) can neither idle the page early nor keep it awake.
 * The `...At` twins are wall-clock epoch ms (Date.now()), for the outputs only.
 */
export interface IdleState {
    phase: Phase;
    /** Monotonic ms of the last input (or of the last wake, which restarts the timer). */
    lastInput: number;
    /** Monotonic ms the page went idle; 0 while active. */
    idleSince: number;
    /** Epoch ms of lastInput, for output.lastInput. */
    lastInputAt: number;
    /** Epoch ms of idleSince, for output.idleSince; 0 while active. */
    idleSinceAt: number;
    wakeCause: WakeCause | '';
}

export type Transition = { type: 'idle' } | { type: 'wake'; cause: WakeCause; idleForMs: number } | null;

export interface StepResult {
    state: IdleState;
    transition: Transition;
}

/** `now` is monotonic; `wall` (default: now) is the matching epoch time for the outputs. */
export function initialState(now: number, wall = now): IdleState {
    return { phase: 'active', lastInput: now, idleSince: 0, lastInputAt: wall, idleSinceAt: 0, wakeCause: '' };
}

export interface TickInput {
    /** Monotonic ms (performance.now()). */
    now: number;
    /** Epoch ms (Date.now()) at the same instant, for the outputs; defaults to now. */
    wall?: number;
    enabled: boolean;
    timeoutMs: number;
    verdict: AlarmVerdict;
    /**
     * A pointer or key is held down. A held press is input in progress (a
     * hold-to-run jog button, a finger resting on a slider): the page never goes
     * idle underneath it, and the timeout starts over from its release.
     */
    held?: boolean;
}

function wake(state: IdleState, now: number, wall: number, cause: WakeCause): StepResult {
    return {
        state: { phase: 'active', lastInput: now, idleSince: 0, lastInputAt: wall, idleSinceAt: 0, wakeCause: cause },
        transition: { type: 'wake', cause, idleForMs: Math.max(0, now - state.idleSince) }
    };
}

/** Time passes. Decides idle and every wake that is not user input. */
export function tick(state: IdleState, input: TickInput): StepResult {
    const { now, enabled, timeoutMs, verdict } = input;
    const wall = input.wall ?? now;
    if (!enabled) {
        if (state.phase === 'idle') {
            return wake(state, now, wall, 'disabled');
        }
        // Keep the timer at zero so re-enabling starts a full timeout.
        return { state: { ...state, lastInput: now, lastInputAt: wall }, transition: null };
    }
    if (state.phase === 'idle') {
        if (verdict.wake) {
            return wake(state, now, wall, 'alarm');
        }
        if (!verdict.feedOk) {
            return wake(state, now, wall, 'feed-stale');
        }
        return { state, transition: null };
    }
    if (input.held) {
        // Held = input still happening: keep the timer at zero until the release.
        return now > state.lastInput
            ? { state: { ...state, lastInput: now, lastInputAt: wall }, transition: null }
            : { state, transition: null };
    }
    if (now - state.lastInput >= timeoutMs && verdict.feedOk && !verdict.wake) {
        return { state: { ...state, phase: 'idle', idleSince: now, idleSinceAt: wall }, transition: { type: 'idle' } };
    }
    return { state, transition: null };
}

/** The user touched, typed, scrolled or moved the mouse. `now` monotonic, `wall` epoch (default: now). */
export function input(state: IdleState, now: number, wall = now): StepResult {
    if (state.phase === 'idle') {
        return wake(state, now, wall, 'input');
    }
    if (now <= state.lastInput) {
        return { state, transition: null };
    }
    return { state: { ...state, lastInput: now, lastInputAt: wall }, transition: null };
}

// --- presses in progress -------------------------------------------------------------

/** After a swallowed gesture ends, its trailing events (mouseup, click, touchend, ...) are still swallowed this long. */
export const SWALLOW_TAIL_MS = 500;
/** A swallowed press stops being swallowed this long after its press (or its last key repeat): nothing stays swallowed forever. */
export const SWALLOW_CAP_MS = 10_000;
/**
 * A key counts as held this long after its keydown or its last auto-repeat. A
 * really held key repeats; a keyup that never comes (macOS Chrome drops the
 * keyup of a key pressed while Cmd is down) must not keep the page awake forever.
 */
export const KEY_HOLD_MS = 1500;

interface Press {
    /** Monotonic ms of the press, or of its last auto-repeat while swallowed (the cap runs from here). */
    at: number;
    /** Monotonic ms of the last keydown or repeat seen for it. */
    seen: number;
    /** It woke the page (or came during the wake): its repeats, its release and the rest of its gesture never reach the page. */
    swallowed: boolean;
}

/** What became of a release: its press was swallowed, passed through, or never recorded. */
export type Release = 'swallowed' | 'passed' | 'unknown';

/**
 * The pointers and keys held down, and which of them belong to a waking
 * gesture. The guard feeds it every press and release, with ids 'p<pointerId>'
 * for pointers and 'k<code>' for keys; all times are monotonic. DOM-free, so
 * jest covers the rules:
 *
 * - anything held keeps the page awake (`held`, passed to tick); a key only
 *   while it keeps repeating (KEY_HOLD_MS), a pointer until its release;
 * - a release is swallowed only when its press was (`release`), so a press that
 *   began before the cover keeps its release;
 * - the rest of a swallowed gesture is swallowed until it is released plus
 *   SWALLOW_TAIL_MS (`swallowing`), capped at SWALLOW_CAP_MS after the press or
 *   the waking key's last auto-repeat.
 */
export class PressTracker {
    private readonly presses = new Map<string, Press>();
    private tailUntil = -Infinity;

    /**
     * A press began. `repeat` is a key auto-repeat: it keeps the first record (and
     * whether it was swallowed), refreshing how long the key counts as held and,
     * for a swallowed key, its cap. A new press of an id still recorded (its
     * release was lost) replaces the record.
     */
    press(id: string, swallowed: boolean, now: number, repeat = false): void {
        const p = this.presses.get(id);
        if (repeat && p) {
            p.seen = now;
            if (p.swallowed) {
                p.at = now;
            }
        } else {
            this.presses.set(id, { at: now, seen: now, swallowed });
        }
        if (swallowed) {
            // Its trailing events may come right away (a released tap's click): start the tail now too.
            this.swallowedOnce(now);
        }
    }

    /** A press ended: was it swallowed (within the cap), passed through, or never recorded? */
    release(id: string, now: number): Release {
        const p = this.presses.get(id);
        if (!p) {
            return 'unknown';
        }
        this.presses.delete(id);
        if (!p.swallowed || now - p.at > SWALLOW_CAP_MS) {
            return 'passed';
        }
        this.tailUntil = Math.max(this.tailUntil, now + SWALLOW_TAIL_MS);
        return 'swallowed';
    }

    /** A swallowed event with no release to wait for (wheel, touchstart): swallow the tail after it. */
    swallowedOnce(now: number): void {
        this.tailUntil = Math.max(this.tailUntil, now + SWALLOW_TAIL_MS);
    }

    /** Is a waking gesture still in progress, so its trailing events must be swallowed? */
    swallowing(now: number): boolean {
        if (now < this.tailUntil) {
            return true;
        }
        for (const p of this.presses.values()) {
            if (p.swallowed && now - p.at <= SWALLOW_CAP_MS) {
                return true;
            }
        }
        return false;
    }

    /** Anything held down: the page must not go idle. Drops keys whose keyup evidently got lost. */
    held(now: number): boolean {
        let any = false;
        for (const [id, p] of this.presses) {
            if (id.startsWith('k') && now - p.seen > KEY_HOLD_MS) {
                if (!(p.swallowed && now - p.at <= SWALLOW_CAP_MS)) {
                    this.presses.delete(id);
                }
                continue;
            }
            any = true;
        }
        return any;
    }

    /** Forget one press without a release (a mouse seen moving with no button down). */
    forget(id: string): void {
        this.presses.delete(id);
    }

    /** Forget every press: the window lost focus or was hidden, so their releases will never arrive here. */
    clear(): void {
        this.presses.clear();
    }
}

/** Clamp the bound timeout to at least 5 s; garbage falls back to 10 min. */
export function timeoutMs(timeoutSec: unknown): number {
    const n = Number(timeoutSec);
    if (!Number.isFinite(n) || n <= 0) {
        return 600_000;
    }
    return Math.max(5, n) * 1000;
}

// --- pointer jitter ---------------------------------------------------------------

export interface Point {
    x: number;
    y: number;
}

/** Did the pointer move further than the threshold from where it last counted? */
export function movedEnough(anchor: Point | null, x: number, y: number, thresholdPx: number): boolean {
    if (anchor === null) {
        return false;
    }
    const t = Math.max(0, thresholdPx);
    const dx = x - anchor.x;
    const dy = y - anchor.y;
    return dx * dx + dy * dy > t * t;
}

// --- burn-in ------------------------------------------------------------------------

/** 'HH:MM' -> minutes after midnight, null when malformed. */
export function parseClock(value: string): number | null {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value || '');
    if (!m) {
        return null;
    }
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) {
        return null;
    }
    return h * 60 + min;
}

/** Is minute-of-day m inside [from, to)? Windows may cross midnight; from === to is empty. */
export function inWindow(m: number, from: number, to: number): boolean {
    if (from === to) {
        return false;
    }
    return from < to ? m >= from && m < to : m >= from || m < to;
}

/** What the night window does while the page is idle. */
export type NightMode = 'blank' | 'clock' | 'dim';

export function normNightMode(value: string): NightMode {
    const v = (value || '').trim().toLowerCase();
    return v === 'blank' || v === 'dim' ? v : 'clock';
}

/**
 * The night window (burn-in and power care). While idle inside it the screen
 * shows the plain clock dimmed to `level` (the default: dark, but visibly
 * alive), keeps the configured mode dimmed to `level`, or goes blank.
 */
export interface NightConfig {
    enabled: boolean;
    from: string;
    to: string;
    mode: NightMode;
    level: number;
}

/** Is `date` (browser local time) inside an enabled, well-formed night window? */
export function isNight(cfg: NightConfig, date: Date): boolean {
    if (!cfg.enabled) {
        return false;
    }
    const from = parseClock(cfg.from);
    const to = parseClock(cfg.to);
    if (from === null || to === null) {
        return false;
    }
    return inWindow(date.getHours() * 60 + date.getMinutes(), from, to);
}

/** The brightness to apply while idle (1 = no dimming): the 'clock' and 'dim' night modes dim, and a pinned alarm lifts it. */
export function dimLevel(cfg: NightConfig, date: Date, alarmPinned: boolean): number {
    if (cfg.mode === 'blank' || alarmPinned || !isNight(cfg, date)) {
        return 1;
    }
    return Number.isFinite(cfg.level) ? Math.min(1, Math.max(0, cfg.level)) : 1;
}

// --- reduced motion -------------------------------------------------------------

export type ReduceMotionSetting = 'auto' | 'always' | 'never';

export function normReduceMotion(value: string): ReduceMotionSetting {
    const v = (value || '').trim().toLowerCase();
    return v === 'always' || v === 'never' ? v : 'auto';
}

/** Resolve the setting against the browser's prefers-reduced-motion (auto). */
export function wantsReducedMotion(setting: ReduceMotionSetting, prefers: boolean): boolean {
    return setting === 'always' || (setting === 'auto' && prefers);
}

/**
 * Where drifting content sits at time t: a slow Lissajous path, each axis in
 * [-1, 1]. Periods of 7 and 11 minutes never line up, so text keeps covering
 * new pixels instead of retracing one loop.
 */
export function drift(tMs: number): Point {
    return {
        x: Math.sin((2 * Math.PI * tMs) / 420_000),
        y: Math.sin((2 * Math.PI * tMs) / 660_000 + 1)
    };
}

// --- presentation helpers -------------------------------------------------------------

/** "2 High, 1 Medium" for the banner; only priorities at or above `from`, highest first, in the labels' words. */
export function countsText(counts: AlarmCounts, from: number, names: Record<Priority, string>): string {
    const parts: string[] = [];
    for (let i = CRITICAL; i >= Math.max(0, from); i--) {
        const p = PRIORITIES[i];
        if (counts[p] > 0) {
            parts.push(`${counts[p]} ${names[p]}`);
        }
    }
    return parts.join(', ');
}
