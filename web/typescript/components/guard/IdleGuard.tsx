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
    AlarmPolicy, AlarmVerdict, evaluateAlarms, IdleState, initialState, input, movedEnough, Point, StepResult, tick,
    timeoutMs, WakeCause, wantsReducedMotion
} from './idleLogic';
import { modeToShow, Shown } from './modes/modeToShow';

// Must match IdleGuard.COMPONENT_ID on the Java side.
export const COMPONENT_TYPE = 'mustrysolutions.perspective.screensaver.idleguard';

/** How often the state machine runs. Bounds how late an idle or an alarm wake can be. */
const TICK_MS = 250;
/** After a wake by touch, click or key, the rest of that gesture is swallowed this long. */
const SWALLOW_MS = 700;
/** The overlay fades out over this long after a wake (and still catches input meanwhile). */
const FADE_MS = 300;
/** output.lastInput is written at most this often: mouse moves must not flood the gateway. */
const LAST_INPUT_WRITE_MS = 5000;
/** While the feed is stale, ask the gateway to subscribe us again this often (a reconnected session lost it). */
const RESUBSCRIBE_MS = 5000;
/** How many alarms the gateway lists for the banner. */
const BANNER_TOP = 3;

/** Inputs that wake the page and, while the overlay is up, are kept from reaching the page. */
const WAKE_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
/** The rest of a waking gesture: swallowed during the SWALLOW_MS window after a wake. */
const SWALLOW_EVENTS = ['pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'touchend', 'keyup', 'keypress'] as const;

/** One guard per page covers it; any other instance stays inert. Holds the owner's token. */
let owner: object | null = null;

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

    /** This guard's identity for the one-per-page claim. */
    private readonly token = {};
    private machine: IdleState = initialState(Date.now());
    private host: HTMLDivElement | null = null;
    private timer: number | null = null;
    private fadeTimer: number | null = null;
    private live = false;
    /** Synchronous mirror of "the overlay is catching input" (setState is async). */
    private shielding = false;
    private swallowUntil = 0;
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
        if (isDesigner(this.props.store) || owner !== null) {
            // Inert: the Designer shows a chip; a second guard on the page does nothing.
            return;
        }
        owner = this.token;
        this.live = true;
        this.machine = initialState(Date.now());
        this.host = document.createElement('div');
        this.host.className = 'mustry-idle-guard-host';
        document.body.appendChild(this.host);
        WAKE_EVENTS.forEach((t) => window.addEventListener(t, this.onWakeInput, { capture: true, passive: false }));
        SWALLOW_EVENTS.forEach((t) => window.addEventListener(t, this.onSwallow, { capture: true, passive: false }));
        window.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: true });
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
        if (p.alarm.sources !== prev.props.alarm.sources) {
            this.subscribe(false);
        }
        if (p.config.wakeLock !== prev.props.config.wakeLock) {
            this.updateWakeLock();
        }
        if (p.config.mode !== prev.props.config.mode && this.machine.phase === 'idle') {
            this.shielding = p.config.mode !== 'external';
            this.writeOutputs();
        }
    }

    componentWillUnmount(): void {
        if (!this.live) {
            return;
        }
        this.live = false;
        if (owner === this.token) {
            owner = null;
        }
        WAKE_EVENTS.forEach((t) => window.removeEventListener(t, this.onWakeInput, { capture: true }));
        SWALLOW_EVENTS.forEach((t) => window.removeEventListener(t, this.onSwallow, { capture: true }));
        window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
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
    }

    // --- gateway feed -------------------------------------------------------------

    private delegate(): GuardStoreDelegate | null {
        const d = this.props.store.delegate;
        return d instanceof GuardStoreDelegate ? d : null;
    }

    private subscribe(force: boolean): void {
        this.lastResubscribe = Date.now();
        this.delegate()?.subscribeAlarms(this.props.props.alarm.sources, BANNER_TOP, force);
    }

    // --- input ----------------------------------------------------------------------

    private onWakeInput = (e: Event): void => {
        const now = Date.now();
        if (this.shielding || now < this.swallowUntil) {
            // The overlay is up (or a wake just happened): this input is for
            // waking only and must never reach the page underneath.
            e.preventDefault();
            e.stopImmediatePropagation();
            if (this.shielding) {
                this.swallowUntil = now + SWALLOW_MS;
            }
        }
        this.onInput(now);
    };

    private onSwallow = (e: Event): void => {
        if (Date.now() < this.swallowUntil || this.shielding) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    };

    private onPointerMove = (e: PointerEvent): void => {
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
        this.onInput(Date.now());
    };

    private onVisibility = (): void => {
        if (!document.hidden) {
            this.onInput(Date.now());
        }
        this.updateWakeLock();
    };

    private onInput(now: number): void {
        this.apply(input(this.machine, now), now);
    }

    // --- the state machine ---------------------------------------------------------

    private onTick = (): void => {
        const now = Date.now();
        const p = this.props.props;
        const feed = this.props.delegate ? this.props.delegate.feed : null;
        const verdict = evaluateAlarms(feed, policyOf(p), now);
        if (!verdict.feedOk && now - this.lastResubscribe > RESUBSCRIBE_MS) {
            this.subscribe(true);
        }
        this.apply(tick(this.machine, {
            now,
            enabled: p.config.enabled,
            timeoutMs: timeoutMs(p.config.timeoutSec),
            verdict
        }), now);
        this.writeAlarmOutputs(verdict);
        if (this.machine.phase === 'idle') {
            // Night, shuffle and reduced motion change what is shown while idle.
            this.write('output.mode', this.shown(now).mode);
        }
        const prev = this.state.verdict;
        const verdictChanged = !prev || prev.pin !== verdict.pin || prev.highest !== verdict.highest
            || prev.feedOk !== verdict.feedOk || JSON.stringify(prev.counted) !== JSON.stringify(verdict.counted)
            || (feed !== null && this.bannerSeq !== feed.seq && verdict.pin);
        if (feed !== null) {
            this.bannerSeq = feed.seq;
        }
        // Re-render at most once a second for the clock and the drift, or at once on news.
        if (verdictChanged || Math.floor(now / 1000) !== Math.floor(this.state.now / 1000)) {
            this.setState({ verdict, now });
        }
    };

    private apply(result: StepResult, now: number): void {
        this.machine = result.state;
        const t = result.transition;
        if (t !== null && t.type === 'idle') {
            this.moveAnchor = null;
            this.coverSince = now;
            this.shielding = this.props.props.config.mode !== 'external';
            if (this.fadeTimer !== null) {
                window.clearTimeout(this.fadeTimer);
                this.fadeTimer = null;
            }
            this.setState({ covering: true, fading: false, now });
            this.writeOutputs();
            this.props.componentEvents.fireComponentEvent('onIdle', {
                mode: this.shown(now).mode,
                idleSince: this.machine.idleSince
            });
        } else if (t !== null && t.type === 'wake') {
            this.endCover(t.cause);
            this.writeOutputs();
            this.props.componentEvents.fireComponentEvent('onWake', { cause: t.cause, idleForMs: t.idleForMs });
        }
        if (now - this.lastInputWritten >= LAST_INPUT_WRITE_MS && this.written['output.lastInput'] !== this.machine.lastInput) {
            this.lastInputWritten = now;
            this.write('output.lastInput', this.machine.lastInput);
        }
    }

    private endCover(cause: WakeCause): void {
        if (cause !== 'input') {
            // Nobody is touching the screen: drop the shield at once so the
            // alarm (or the page, when the feed died) is fully usable.
            this.shielding = false;
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
            this.shielding = false;
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
        this.write('output.idleSince', m.idleSince);
        this.write('output.mode', m.phase === 'idle' ? this.shown(Date.now()).mode : '');
        this.write('output.wakeCause', m.wakeCause);
        this.lastInputWritten = Date.now();
        this.write('output.lastInput', m.lastInput);
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
