import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {
    AbstractUIElementStore,
    Component,
    ComponentMeta,
    ComponentProps,
    ComponentStoreDelegate,
    PComponent,
    PropertyTree,
    Size2d
} from '@inductiveautomation/perspective-client';
import { Cover } from './Cover';
import { GuardDelegateState, GuardStoreDelegate } from './guardDelegate';
import { GuardProps, mapGuardProps } from './guardProps';
import {
    AlarmPolicy, AlarmVerdict, evaluateAlarms, IdleState, initialState, input, movedEnough, Point, PressTracker, Release,
    StepResult, tick, timeoutMs, WakeCause, wantsReducedMotion
} from './idleLogic';
import { modeToShow, Shown } from './modes/modeToShow';

// Must match IdleGuard.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.screensaver.idleguard';

/** How often the state machine runs. Bounds how late an idle or an alarm wake can be. */
const TICK_MS = 250;
/** The overlay fades out over this long after a wake (and still catches input meanwhile). */
const FADE_MS = 300;
/** output.lastInput is written at most this often: mouse moves must not flood the gateway. */
const LAST_INPUT_WRITE_MS = 5000;
/** While the feed is stale, ask the gateway to subscribe us again this often (a reconnected session lost it). */
const RESUBSCRIBE_MS = 5000;

/**
 * Presses, releases and everything else a waking gesture can produce. Listened
 * to for the whole session, in the window's capture phase from the moment the
 * guard activates, so the guard runs before any listener a component adds later
 * (a picker's Escape, a dialog's Tab trap) and can stop a waking key or click
 * before they see it. None of them blocks scrolling, so they cost nothing.
 */
const INPUT_EVENTS = [
    'pointerdown', 'pointerup', 'pointercancel', 'keydown', 'keyup', 'keypress',
    'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'touchend'
] as const;
/**
 * The scroll-starting events. A non-passive window listener on these makes the
 * browser wait for script before every scroll, so they are tracked passively and
 * listened to non-passively only while the overlay catches input or a waking
 * gesture is still in progress.
 */
const SCROLL_EVENTS = ['wheel', 'touchstart'] as const;

/** One guard per page covers it (the live one); the others wait, in mount order, to take over when it unmounts. */
let pageOwned = false;
const waiting: IdleGuard[] = [];

/** The monotonic clock every delta is taken on (a wall-clock step must not stall or rush the guard). */
function mono(): number {
    return performance.now();
}

interface GuardState {
    /** The overlay (or, in external mode, the dim layer) is mounted. */
    covering: boolean;
    /** It is fading out after a wake. */
    fading: boolean;
    verdict: AlarmVerdict | null;
    /** Wall-clock time of the last render tick, for the clock and the drift. */
    now: number;
}

function isDesigner(store: AbstractUIElementStore): boolean {
    try {
        return !!store.view.page.parent.isDesigner;
    } catch (e) {
        return false;
    }
}

/** One live prefers-reduced-motion query, made on first use; null where matchMedia is missing. */
let motionQuery: MediaQueryList | null | undefined;

/** The browser's prefers-reduced-motion (set in the OS, or by a kiosk policy). */
function prefersReducedMotion(): boolean {
    if (motionQuery === undefined) {
        try {
            motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        } catch (e) {
            motionQuery = null;
        }
    }
    return motionQuery !== null && motionQuery.matches;
}

/**
 * Swallow a release? Yes when its press was swallowed; also when no press was
 * recorded for it (forgotten after a blur) while the overlay catches input.
 * Never for a press that began before the cover and passed through.
 */
function released(r: Release, shielding: boolean): boolean {
    return r === 'swallowed' || (r === 'unknown' && shielding);
}

/** A held key's id for the press tracker: the physical key, so auto-repeat and keyup match the keydown. */
function keyId(e: KeyboardEvent): string {
    return `k${e.code || e.key}`;
}

function policyOf(p: GuardProps): AlarmPolicy {
    return {
        wakePriority: p.alarm.wakePriority,
        pinPriority: p.alarm.pinPriority,
        includeAcked: p.alarm.includeAcked,
        staleAfterMs: Math.max(3, Number.isFinite(p.alarm.staleAfterSec) ? p.alarm.staleAfterSec : 8) * 1000
    };
}

/**
 * The Idle Guard. Renders nothing in its own container (put it in a shared
 * dock); everything visible goes into a portal on document.body, above the
 * whole page, so the page underneath stays mounted and wakes instantly.
 */
export class IdleGuard extends Component<ComponentProps<GuardProps, GuardDelegateState>, GuardState> {

    private machine: IdleState = initialState(mono(), Date.now());
    private host: HTMLDivElement | null = null;
    private timer: number | null = null;
    private fadeTimer: number | null = null;
    private live = false;
    /** Synchronous mirror of "the overlay is catching input" (setState is async). */
    private shielding = false;
    /** The cancelling (non-passive) listeners are registered. */
    private shieldListening = false;
    private readonly presses = new PressTracker();
    private moveAnchor: Point | null = null;
    private written: Record<string, unknown> = {};
    private lastInputWritten = 0;
    private lastResubscribe = 0;
    /** When the current cover went up (shuffle's clock, passed to the Cover). */
    private coverSince = 0;
    /** The feed message the banner last rendered, so a new top alarm re-renders it. */
    private bannerSeq = -1;
    private wakeLock: { release(): Promise<void>; addEventListener(t: string, f: () => void): void } | null = null;
    private wakeLockPending = false;

    constructor(props: ComponentProps<GuardProps, GuardDelegateState>) {
        super(props);
        this.state = { covering: false, fading: false, verdict: null, now: Date.now() };
    }

    componentDidMount(): void {
        if (isDesigner(this.props.store)) {
            // Inert: the Designer shows a chip.
            return;
        }
        if (pageOwned) {
            // A second guard on the page waits; it takes over if the owner unmounts.
            waiting.push(this);
            return;
        }
        this.activate();
    }

    /** Become the page's guard: listen, subscribe, start the state machine. */
    private activate(): void {
        pageOwned = true;
        this.live = true;
        this.machine = initialState(mono(), Date.now());
        this.host = document.createElement('div');
        this.host.className = 'mustry-idle-guard-host';
        document.body.appendChild(this.host);
        INPUT_EVENTS.forEach((t) => window.addEventListener(t, this.onInputEvent, { capture: true, passive: false }));
        SCROLL_EVENTS.forEach((t) => window.addEventListener(t, this.onScrollTrack, { capture: true, passive: true }));
        window.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: true });
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onVisibility);
        this.subscribe(true);
        this.timer = window.setInterval(this.onTick, TICK_MS);
        this.writeOutputs();
        this.updateWakeLock();
    }

    componentDidUpdate(prev: ComponentProps<GuardProps, GuardDelegateState>): void {
        if (!this.live) {
            return;
        }
        const p = this.props.props;
        // By value: the props reducer builds a new array on every prop change (bound lines update often).
        if (JSON.stringify(p.alarm.sources) !== JSON.stringify(prev.props.alarm.sources)) {
            this.subscribe(false);
        }
        if (p.config.wakeLock !== prev.props.config.wakeLock) {
            this.updateWakeLock();
        }
        if (p.config.mode !== prev.props.config.mode && this.machine.phase === 'idle') {
            this.setShielding(p.config.mode !== 'external');
            this.writeOutputs();
        }
    }

    componentWillUnmount(): void {
        const i = waiting.indexOf(this);
        if (i >= 0) {
            waiting.splice(i, 1);
        }
        if (!this.live) {
            return;
        }
        this.live = false;
        INPUT_EVENTS.forEach((t) => window.removeEventListener(t, this.onInputEvent, { capture: true }));
        SCROLL_EVENTS.forEach((t) => window.removeEventListener(t, this.onScrollTrack, { capture: true }));
        this.setShieldListening(false);
        window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onVisibility);
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
        if (this.fadeTimer !== null) {
            window.clearTimeout(this.fadeTimer);
            this.fadeTimer = null;
        }
        if (this.host) {
            // The portal unmounts with this component; only the host node is ours to remove.
            this.host.remove();
            this.host = null;
        }
        this.releaseWakeLock();
        // Only the live guard gets here: hand the page to the next one still
        // mounted (a shared dock that outlived a view's guard).
        pageOwned = false;
        const next = waiting.shift();
        if (next) {
            next.activate();
        }
    }

    // --- gateway feed -------------------------------------------------------------

    private delegate(): GuardStoreDelegate | null {
        const d = this.props.store.delegate;
        return d instanceof GuardStoreDelegate ? d : null;
    }

    private subscribe(force: boolean): void {
        const d = this.delegate();
        // Only a message actually sent restarts the resubscribe clock: a no-op must
        // not postpone the forced resubscribe a stale feed needs.
        if (d !== null && d.subscribeAlarms(this.props.props.alarm.sources, force)) {
            this.lastResubscribe = mono();
        }
    }

    // --- input ----------------------------------------------------------------------

    /** Every non-scrolling input event, for the whole session (non-passive: it may cancel). */
    private onInputEvent = (e: Event): void => {
        this.handleInput(e, true);
    };

    /** Wheel and touchstart, passively. Stands aside while the cancelling ones are registered. */
    private onScrollTrack = (e: Event): void => {
        if (!this.shieldListening) {
            this.handleInput(e, false);
        }
    };

    /** Wheel and touchstart, non-passively: only while the overlay catches input or a waking gesture is in progress. */
    private onScrollShield = (e: Event): void => {
        this.handleInput(e, true);
    };

    /**
     * Every press, release and trailing event. While the overlay is up, a press
     * wakes the page and is stopped, and so is the rest of its gesture: its key
     * repeats, its release (only its own: a press that began before the cover
     * keeps its release) and the trailing mouse, click and touch events, until it
     * is released plus a short tail (PressTracker).
     */
    private handleInput(e: Event, canCancel: boolean): void {
        const now = mono();
        const t = this.presses;
        let swallow: boolean;
        switch (e.type) {
            case 'pointerdown':
                swallow = this.shielding || t.swallowing(now);
                t.press(`p${(e as PointerEvent).pointerId}`, swallow, now);
                this.onInput(now);
                break;
            case 'keydown': {
                // Auto-repeat of a held waking key falls under swallowing() until its keyup,
                // and each repeat refreshes the key's swallow cap and its "held" time.
                swallow = this.shielding || t.swallowing(now);
                t.press(keyId(e as KeyboardEvent), swallow, now, (e as KeyboardEvent).repeat);
                this.onInput(now);
                break;
            }
            case 'wheel':
            case 'touchstart':
                swallow = this.shielding || t.swallowing(now);
                if (swallow) {
                    t.swallowedOnce(now);
                }
                this.onInput(now);
                break;
            case 'pointerup':
            case 'pointercancel':
                swallow = released(t.release(`p${(e as PointerEvent).pointerId}`, now), this.shielding);
                break;
            case 'keyup':
                swallow = released(t.release(keyId(e as KeyboardEvent), now), this.shielding);
                break;
            default:
                // mousedown, mouseup, click, touchend, ...: carry no pointer id we can match.
                swallow = this.shielding || t.swallowing(now);
        }
        if (swallow && canCancel) {
            // This input is for waking only and must never reach the page underneath.
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }

    /** Register or drop the cancelling wheel/touchstart listeners. Called outside event dispatch (tick, mode change, wake). */
    private setShieldListening(on: boolean): void {
        if (on === this.shieldListening) {
            return;
        }
        this.shieldListening = on;
        SCROLL_EVENTS.forEach((type) => {
            if (on) {
                window.addEventListener(type, this.onScrollShield, { capture: true, passive: false });
            } else {
                window.removeEventListener(type, this.onScrollShield, { capture: true });
            }
        });
    }

    private onBlur = (): void => {
        // Releases now go elsewhere (another window, an iframe): forget what is held.
        this.presses.clear();
    };

    private onPointerMove = (e: PointerEvent): void => {
        if (e.buttons === 0 && e.pointerType !== 'touch') {
            // A mouse moving with no button down holds nothing (its release went to another window).
            this.presses.forget(`p${e.pointerId}`);
        }
        const cfg = this.props.props.config;
        if (!cfg.wakeOnMove || e.pointerType === 'touch') {
            return;
        }
        if (this.moveAnchor === null) {
            this.moveAnchor = { x: e.clientX, y: e.clientY };
            return;
        }
        if (!movedEnough(this.moveAnchor, e.clientX, e.clientY, cfg.moveThresholdPx)) {
            return;
        }
        this.moveAnchor = { x: e.clientX, y: e.clientY };
        this.onInput(mono());
    };

    private onVisibility = (): void => {
        if (document.hidden) {
            this.presses.clear();
        } else {
            this.onInput(mono());
        }
        this.updateWakeLock();
    };

    private onInput(now: number): void {
        this.apply(input(this.machine, now, Date.now()), now);
    }

    // --- the state machine ---------------------------------------------------------

    private onTick = (): void => {
        const now = mono();
        const wall = Date.now();
        const p = this.props.props;
        const feed = this.props.delegate ? this.props.delegate.feed : null;
        const verdict = evaluateAlarms(feed, policyOf(p), now);
        if (!verdict.feedOk && now - this.lastResubscribe > RESUBSCRIBE_MS) {
            this.subscribe(true);
        }
        this.apply(tick(this.machine, {
            now,
            wall,
            enabled: p.config.enabled,
            timeoutMs: timeoutMs(p.config.timeoutSec),
            verdict,
            held: this.presses.held(now)
        }), now);
        if (this.shieldListening && !this.shielding && !this.presses.swallowing(now)) {
            this.setShieldListening(false);
        }
        this.writeAlarmOutputs(verdict);
        if (this.machine.phase === 'idle') {
            // Night, shuffle and reduced motion change what is shown while idle.
            this.write('output.mode', this.shown(wall).mode);
        }
        const prev = this.state.verdict;
        const verdictChanged = !prev || prev.pin !== verdict.pin || prev.highest !== verdict.highest
            || prev.feedOk !== verdict.feedOk || JSON.stringify(prev.counted) !== JSON.stringify(verdict.counted)
            || (feed !== null && this.bannerSeq !== feed.seq && verdict.pin);
        if (feed !== null) {
            this.bannerSeq = feed.seq;
        }
        // Re-render at most once a second for the clock and the drift, or at once on news.
        if (verdictChanged || Math.floor(wall / 1000) !== Math.floor(this.state.now / 1000)) {
            this.setState({ verdict, now: wall });
        }
    };

    /** `now` is monotonic; the wall-clock side comes from the machine's `...At` stamps. */
    private apply(result: StepResult, now: number): void {
        this.machine = result.state;
        const t = result.transition;
        if (t !== null && t.type === 'idle') {
            const wall = this.machine.idleSinceAt;
            this.moveAnchor = null;
            this.coverSince = wall;
            this.setShielding(this.props.props.config.mode !== 'external');
            if (this.fadeTimer !== null) {
                window.clearTimeout(this.fadeTimer);
                this.fadeTimer = null;
            }
            this.setState({ covering: true, fading: false, now: wall });
            this.writeOutputs();
            this.props.componentEvents.fireComponentEvent('onIdle', {
                mode: this.shown(wall).mode,
                idleSince: wall
            });
        } else if (t !== null && t.type === 'wake') {
            this.endCover(t.cause);
            this.writeOutputs();
            this.props.componentEvents.fireComponentEvent('onWake', { cause: t.cause, idleForMs: t.idleForMs });
        }
        if (now - this.lastInputWritten >= LAST_INPUT_WRITE_MS && this.written['output.lastInput'] !== this.machine.lastInputAt) {
            this.lastInputWritten = now;
            this.write('output.lastInput', this.machine.lastInputAt);
        }
    }

    /** The overlay catches input (or stops); the cancelling listeners come up with it. */
    private setShielding(on: boolean): void {
        this.shielding = on;
        if (on) {
            this.setShieldListening(true);
        }
        // Dropping them waits for the tick: a waking gesture may still be in progress.
    }

    private endCover(cause: WakeCause): void {
        if (cause !== 'input') {
            // Nobody is touching the screen: drop the shield at once so the
            // alarm (or the page, when the feed died) is fully usable.
            this.setShielding(false);
            this.setState({ covering: false, fading: false });
            return;
        }
        // Woken by a person: keep catching the rest of the gesture while fading.
        this.setState({ fading: true });
        if (this.fadeTimer !== null) {
            window.clearTimeout(this.fadeTimer);
        }
        this.fadeTimer = window.setTimeout(() => {
            this.fadeTimer = null;
            this.setShielding(false);
            if (this.machine.phase === 'active') {
                this.setState({ covering: false, fading: false });
            }
        }, FADE_MS);
    }

    // --- outputs ---------------------------------------------------------------------

    private write(path: string, value: unknown): void {
        const prev = this.written[path];
        if (prev !== undefined && JSON.stringify(prev) === JSON.stringify(value)) {
            return;
        }
        this.written[path] = value;
        this.props.store.props.write(path, value);
    }

    private writeOutputs(): void {
        const m = this.machine;
        this.write('output.idle', m.phase === 'idle');
        this.write('output.idleSince', m.idleSinceAt);
        this.write('output.mode', m.phase === 'idle' ? this.shown(Date.now()).mode : '');
        this.write('output.wakeCause', m.wakeCause);
        this.lastInputWritten = mono();
        this.write('output.lastInput', m.lastInputAt);
    }

    private writeAlarmOutputs(v: AlarmVerdict): void {
        this.write('output.feedOk', v.feedOk);
        this.write('output.alarms', v.counted);
    }

    // --- wake lock ------------------------------------------------------------------

    private updateWakeLock(): void {
        const want = this.live && this.props.props.config.wakeLock && !document.hidden;
        if (!want) {
            this.releaseWakeLock();
            return;
        }
        const nav = navigator as unknown as { wakeLock?: { request(type: string): Promise<IdleGuard['wakeLock']> } };
        if (this.wakeLock !== null || this.wakeLockPending || !nav.wakeLock) {
            return;
        }
        this.wakeLockPending = true;
        nav.wakeLock.request('screen').then((lock) => {
            this.wakeLockPending = false;
            if (!lock) {
                return;
            }
            if (!this.live) {
                lock.release().catch(() => undefined);
                return;
            }
            this.wakeLock = lock;
            lock.addEventListener('release', () => {
                this.wakeLock = null;
            });
        }).catch(() => {
            // Plain HTTP, a denied permission or a hidden tab: nothing to do.
            this.wakeLockPending = false;
        });
    }

    private releaseWakeLock(): void {
        const lock = this.wakeLock;
        this.wakeLock = null;
        if (lock) {
            lock.release().catch(() => undefined);
        }
    }

    // --- rendering ---------------------------------------------------------------------

    private reduceMotion(): boolean {
        return wantsReducedMotion(this.props.props.config.reduceMotion, prefersReducedMotion());
    }

    /** What the cover shows at `now`: the configured mode after night, shuffle and reduced motion. */
    private shown(now: number): Shown {
        const p = this.props.props;
        return modeToShow({
            mode: p.config.mode,
            shuffle: p.modes.shuffle,
            night: p.burnIn.night,
            reduceMotion: this.reduceMotion(),
            coverSince: this.coverSince,
            now
        });
    }

    render() {
        const p = this.props.props;
        const designer = isDesigner(this.props.store);
        const classes = ['mustry-idle-guard', designer ? 'mustry-idle-guard--designer' : 'mustry-idle-guard--client'];
        return (
            <div {...this.props.emit({ classes })}>
                {designer && (
                    <span className="mustry-idle-guard__chip">
                        Idle Guard · {p.config.enabled ? `${p.config.mode} after ${Math.round(timeoutMs(p.config.timeoutSec) / 1000)} s` : 'disabled'}
                    </span>
                )}
                {this.live && this.host && this.state.covering && ReactDOM.createPortal(
                    <Cover
                        props={p}
                        feed={this.props.delegate ? this.props.delegate.feed : null}
                        verdict={this.state.verdict}
                        now={this.state.now}
                        fading={this.state.fading}
                        shown={this.shown(this.state.now)}
                        reduceMotion={this.reduceMotion()}
                    />,
                    this.host
                )}
            </div>
        );
    }
}

export class IdleGuardMeta implements ComponentMeta {

    getComponentType(): string {
        return COMPONENT_TYPE;
    }

    getViewComponent(): PComponent {
        return IdleGuard as unknown as PComponent;
    }

    getDefaultSize(): Size2d {
        return { width: 220, height: 32 };
    }

    getPropsReducer(tree: PropertyTree): GuardProps {
        return mapGuardProps(tree);
    }

    createDelegate(component: AbstractUIElementStore): ComponentStoreDelegate {
        return new GuardStoreDelegate(component);
    }
}
