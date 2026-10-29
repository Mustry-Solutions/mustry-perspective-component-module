// The browser side of the Idle Guard ⇄ gateway channel. The gateway delegate
// (GuardModelDelegate.java) subscribes this guard to the shared alarm feed and
// pushes a summary on every change and every couple of seconds as a heartbeat.
import { AbstractUIElementStore, ComponentStoreDelegate, JsObject } from '@inductiveautomation/perspective-client';
import { AlarmFeed, parseFeed } from './idleLogic';

/** Event names shared with GuardModelDelegate.java. */
export const GUARD_EVENTS = {
    /**
     * page -> gateway: a bare trigger, {} (again whenever config.alarm.sources changes,
     * and while the feed is stale). The gateway reads config.alarm.sources from the
     * component's props on its side and never trusts the browser for them.
     */
    SUBSCRIBE: 'screensaver-subscribe',
    /** gateway -> page: { active, unacked, top, seq, sentAt } */
    ALARMS: 'screensaver-alarms'
} as const;

export interface GuardDelegateState {
    /** The last feed message, or null before the first one. */
    feed: AlarmFeed | null;
}

export class GuardStoreDelegate extends ComponentStoreDelegate {
    private feed: AlarmFeed | null = null;
    private subscribed = '';

    constructor(componentStore: AbstractUIElementStore) {
        super(componentStore);
    }

    mapStateToProps(): GuardDelegateState {
        return { feed: this.feed };
    }

    /** The feed as of now; read by the guard's tick without waiting for a re-render. */
    latest(): AlarmFeed | null {
        return this.feed;
    }

    /**
     * Ask the gateway to (re)subscribe; a no-op when `sources` did not change
     * unless forced. The patterns only decide when to ask: the gateway reads
     * its own copy of config.alarm.sources.
     */
    subscribeAlarms(sources: string[], force = false): void {
        const key = JSON.stringify(sources);
        if (!force && key === this.subscribed) {
            return;
        }
        this.subscribed = key;
        this.fireEvent(GUARD_EVENTS.SUBSCRIBE, {});
    }

    handleEvent(eventName: string, eventObject: JsObject): void {
        if (eventName !== GUARD_EVENTS.ALARMS) {
            return;
        }
        // Stamped on the monotonic clock: staleness must survive a wall-clock step.
        const feed = parseFeed(eventObject, performance.now());
        if (feed !== null) {
            this.feed = feed;
            this.notify();
        }
    }
}
