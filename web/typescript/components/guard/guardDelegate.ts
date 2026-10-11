// The browser side of the Idle Guard ⇄ gateway channel. The gateway delegate
// (GuardModelDelegate.java) subscribes this guard to the shared alarm feed and
// pushes a summary on every change and every couple of seconds as a heartbeat.
import { AbstractUIElementStore, ComponentStoreDelegate, JsObject } from '@inductiveautomation/perspective-client';
import { AlarmFeed, parseFeed } from './idleLogic';

/** Event names shared with GuardModelDelegate.java. */
export const GUARD_EVENTS = {
    /** page -> gateway: { sources: [patterns], top } (again whenever they change) */
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

    /** (Re)subscribe with these source patterns; a no-op when nothing changed unless forced. */
    subscribeAlarms(sources: string[], top: number, force = false): void {
        const key = JSON.stringify([sources, top]);
        if (!force && key === this.subscribed) {
            return;
        }
        this.subscribed = key;
        this.fireEvent(GUARD_EVENTS.SUBSCRIBE, { sources, top });
    }

    handleEvent(eventName: string, eventObject: JsObject): void {
        if (eventName !== GUARD_EVENTS.ALARMS) {
            return;
        }
        const feed = parseFeed(eventObject, Date.now());
        if (feed !== null) {
            this.feed = feed;
            this.notify();
        }
    }
}
