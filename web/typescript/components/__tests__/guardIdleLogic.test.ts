import { EN_GUARD_LABELS, guardLabelBase } from '../../shared/labels/guard';
import {
    AlarmFeed, AlarmPolicy, countsText, CRITICAL, dimLevel, drift, evaluateAlarms, initialState, input, inWindow, isNight,
    NightConfig, normNightMode, normReduceMotion, wantsReducedMotion,
    movedEnough, parseClock, parseFeed, PressTracker, priorityIndex, SWALLOW_CAP_MS, SWALLOW_TAIL_MS, tick, timeoutMs,
    zeroCounts
} from '../guard/idleLogic';

const POLICY: AlarmPolicy = { wakePriority: 3, pinPriority: 2, includeAcked: true, staleAfterMs: 8000 };

function feed(active: Partial<Record<string, number>>, unacked: Partial<Record<string, number>> = active, receivedAt = 1000): AlarmFeed {
    return { active: { ...zeroCounts(), ...active }, unacked: { ...zeroCounts(), ...unacked }, top: [], seq: 1, receivedAt };
}

describe('priorityIndex', () => {
    it('reads names, case-insensitively, and numbers', () => {
        expect(priorityIndex('High', 0)).toBe(3);
        expect(priorityIndex('critical', 0)).toBe(4);
        expect(priorityIndex(' Diagnostic ', 2)).toBe(0);
        expect(priorityIndex(2, 0)).toBe(2);
        expect(priorityIndex('1', 0)).toBe(1);
    });

    it('falls back on garbage', () => {
        expect(priorityIndex('Urgent', 3)).toBe(3);
        expect(priorityIndex(7, 3)).toBe(3);
        expect(priorityIndex('', 2)).toBe(2);
        expect(priorityIndex(null, 1)).toBe(1);
    });
});

describe('parseFeed', () => {
    it('parses a gateway message and stamps the browser time', () => {
        const f = parseFeed({
            active: { high: 2, medium: '1', critical: -3 },
            unacked: { high: 1 },
            top: [{ label: 'Tank high', displayPath: 'Line 1/Tank', priority: 'high', acked: false, activeSince: 5 }, null],
            seq: 7,
            sentAt: 99
        }, 1234);
        expect(f).not.toBeNull();
        expect(f!.active.high).toBe(2);
        expect(f!.active.medium).toBe(1);
        expect(f!.active.critical).toBe(0);
        expect(f!.unacked.high).toBe(1);
        expect(f!.top).toHaveLength(1);
        expect(f!.top[0].priority).toBe('high');
        expect(f!.receivedAt).toBe(1234);
        expect(f!.seq).toBe(7);
    });

    it('rejects what is not a feed message', () => {
        expect(parseFeed(null, 1)).toBeNull();
        expect(parseFeed({ error: 'x' }, 1)).toBeNull();
    });
});

describe('evaluateAlarms', () => {
    it('fails open without a feed or with a stale one', () => {
        expect(evaluateAlarms(null, POLICY, 1000).feedOk).toBe(false);
        expect(evaluateAlarms(feed({}), POLICY, 1000 + 8000).feedOk).toBe(true);
        expect(evaluateAlarms(feed({}), POLICY, 1000 + 8001).feedOk).toBe(false);
    });

    it('wakes at or above wakePriority and pins between pin and wake', () => {
        expect(evaluateAlarms(feed({ high: 1 }), POLICY, 1000)).toMatchObject({ wake: true, pin: false, highest: 3 });
        expect(evaluateAlarms(feed({ medium: 2 }), POLICY, 1000)).toMatchObject({ wake: false, pin: true, highest: 2 });
        expect(evaluateAlarms(feed({ low: 5 }), POLICY, 1000)).toMatchObject({ wake: false, pin: false, highest: 1 });
        expect(evaluateAlarms(feed({}), POLICY, 1000)).toMatchObject({ wake: false, pin: false, highest: -1 });
    });

    it('INVARIANT: an active Critical alarm always wakes, whatever the policy', () => {
        // wakePriority can only be Critical or lower, but the policy also has to
        // survive garbage, and acked Criticals must count even with includeAcked off.
        const policies: AlarmPolicy[] = [
            POLICY,
            { ...POLICY, wakePriority: CRITICAL },
            { ...POLICY, wakePriority: 99 },
            { ...POLICY, wakePriority: CRITICAL, includeAcked: false },
            { ...POLICY, wakePriority: CRITICAL, pinPriority: CRITICAL }
        ];
        for (const p of policies) {
            const acked = feed({ critical: 1 }, { critical: 0 });
            expect(evaluateAlarms(acked, p, 1000).wake).toBe(true);
            expect(evaluateAlarms(feed({ critical: 1 }), p, 1000).wake).toBe(true);
        }
    });

    it('drops acked alarms below Critical when includeAcked is off', () => {
        const p = { ...POLICY, includeAcked: false };
        const f = feed({ high: 2, medium: 1 }, { high: 0, medium: 1 });
        expect(evaluateAlarms(f, p, 1000)).toMatchObject({ wake: false, pin: true });
        expect(evaluateAlarms(f, POLICY, 1000)).toMatchObject({ wake: true });
    });

    it('treats pinPriority above wakePriority as wakePriority', () => {
        const p = { ...POLICY, wakePriority: 2, pinPriority: 4 };
        expect(evaluateAlarms(feed({ medium: 1 }), p, 1000).wake).toBe(true);
    });
});

describe('idle state machine', () => {
    const OK = evaluateAlarms(feed({}), POLICY, 1000);
    const HIGH = evaluateAlarms(feed({ high: 1 }), POLICY, 1000);
    const STALE = evaluateAlarms(null, POLICY, 1000);
    const T = 10_000;

    it('goes idle after the timeout, not before', () => {
        const s = initialState(0);
        expect(tick(s, { now: T - 1, enabled: true, timeoutMs: T, verdict: OK }).transition).toBeNull();
        const r = tick(s, { now: T, enabled: true, timeoutMs: T, verdict: OK });
        expect(r.transition).toEqual({ type: 'idle' });
        expect(r.state).toMatchObject({ phase: 'idle', idleSince: T });
    });

    it('input resets the timer and wakes an idle page', () => {
        let s = initialState(0);
        s = input(s, 6000).state;
        expect(tick(s, { now: T + 1, enabled: true, timeoutMs: T, verdict: OK }).transition).toBeNull();
        s = tick(s, { now: 16_000, enabled: true, timeoutMs: T, verdict: OK }).state;
        expect(s.phase).toBe('idle');
        const r = input(s, 20_000);
        expect(r.transition).toEqual({ type: 'wake', cause: 'input', idleForMs: 4000 });
        expect(r.state).toMatchObject({ phase: 'active', lastInput: 20_000, wakeCause: 'input' });
    });

    it('never idles under a held press, and restarts the timeout from its release', () => {
        let s = initialState(0);
        // A finger rests on a hold-to-run button far past the timeout.
        for (let now = 250; now <= 3 * T; now += 250) {
            const r = tick(s, { now, enabled: true, timeoutMs: T, verdict: OK, held: true });
            expect(r.transition).toBeNull();
            s = r.state;
        }
        expect(s.lastInput).toBe(3 * T);
        // Released: a full timeout from the release, not an instant idle.
        expect(tick(s, { now: 4 * T - 1, enabled: true, timeoutMs: T, verdict: OK }).transition).toBeNull();
        expect(tick(s, { now: 4 * T, enabled: true, timeoutMs: T, verdict: OK }).transition).toEqual({ type: 'idle' });
    });

    it('takes deltas on the monotonic clock and stamps outputs with the wall clock', () => {
        // The wall clock steps back an hour: the monotonic delta still idles on time.
        const s = initialState(1000, 1_700_000_000_000);
        const r = tick(s, { now: 1000 + T, wall: 1_700_000_000_000 - 3_600_000, enabled: true, timeoutMs: T, verdict: OK });
        expect(r.transition).toEqual({ type: 'idle' });
        expect(r.state).toMatchObject({ idleSince: 1000 + T, idleSinceAt: 1_700_000_000_000 - 3_600_000, lastInputAt: 1_700_000_000_000 });
        const w = input(r.state, 1000 + T + 500, 42);
        expect(w.transition).toEqual({ type: 'wake', cause: 'input', idleForMs: 500 });
        expect(w.state).toMatchObject({ lastInput: 1000 + T + 500, lastInputAt: 42, idleSince: 0, idleSinceAt: 0 });
    });

    it('treats a stale feed by the monotonic receive time', () => {
        const f = feed({}, {}, 5000);
        expect(evaluateAlarms(f, POLICY, 5000 + 8000).feedOk).toBe(true);
        expect(evaluateAlarms(f, POLICY, 5000 + 8001).feedOk).toBe(false);
    });

    it('never idles while an alarm at wake priority is active or the feed is stale', () => {
        const s = initialState(0);
        expect(tick(s, { now: 99 * T, enabled: true, timeoutMs: T, verdict: HIGH }).state.phase).toBe('active');
        expect(tick(s, { now: 99 * T, enabled: true, timeoutMs: T, verdict: STALE }).state.phase).toBe('active');
    });

    it('wakes on alarm, on a stale feed, and when disabled', () => {
        const idle = tick(initialState(0), { now: T, enabled: true, timeoutMs: T, verdict: OK }).state;
        expect(tick(idle, { now: T + 5, enabled: true, timeoutMs: T, verdict: HIGH }).transition)
            .toEqual({ type: 'wake', cause: 'alarm', idleForMs: 5 });
        expect(tick(idle, { now: T + 5, enabled: true, timeoutMs: T, verdict: STALE }).transition)
            .toMatchObject({ type: 'wake', cause: 'feed-stale' });
        expect(tick(idle, { now: T + 5, enabled: false, timeoutMs: T, verdict: OK }).transition)
            .toMatchObject({ type: 'wake', cause: 'disabled' });
    });

    it('an alarm wake gives a full timeout before idling again', () => {
        const idle = tick(initialState(0), { now: T, enabled: true, timeoutMs: T, verdict: OK }).state;
        const woke = tick(idle, { now: 2 * T, enabled: true, timeoutMs: T, verdict: HIGH }).state;
        expect(tick(woke, { now: 3 * T - 1, enabled: true, timeoutMs: T, verdict: OK }).state.phase).toBe('active');
        expect(tick(woke, { now: 3 * T, enabled: true, timeoutMs: T, verdict: OK }).state.phase).toBe('idle');
    });

    it('disabled keeps the timer at zero', () => {
        let s = initialState(0);
        s = tick(s, { now: 5 * T, enabled: false, timeoutMs: T, verdict: OK }).state;
        expect(tick(s, { now: 5 * T + 1, enabled: true, timeoutMs: T, verdict: OK }).state.phase).toBe('active');
    });

    it('clamps the timeout', () => {
        expect(timeoutMs(1)).toBe(5000);
        expect(timeoutMs(600)).toBe(600_000);
        expect(timeoutMs('abc')).toBe(600_000);
        expect(timeoutMs(-3)).toBe(600_000);
    });
});

describe('pointer jitter', () => {
    it('counts only moves beyond the threshold', () => {
        expect(movedEnough(null, 100, 100, 8)).toBe(false);
        expect(movedEnough({ x: 0, y: 0 }, 5, 5, 8)).toBe(false);
        expect(movedEnough({ x: 0, y: 0 }, 6, 6, 8)).toBe(true);
        expect(movedEnough({ x: 0, y: 0 }, 0, 1, 0)).toBe(true);
    });
});

describe('night window', () => {
    it('parses HH:MM', () => {
        expect(parseClock('22:00')).toBe(1320);
        expect(parseClock('6:05')).toBe(365);
        expect(parseClock('24:00')).toBeNull();
        expect(parseClock('noon')).toBeNull();
    });

    it('handles windows across midnight', () => {
        expect(inWindow(23 * 60, 1320, 360)).toBe(true);
        expect(inWindow(3 * 60, 1320, 360)).toBe(true);
        expect(inWindow(12 * 60, 1320, 360)).toBe(false);
        expect(inWindow(6 * 60, 1320, 360)).toBe(false);
        expect(inWindow(9 * 60, 480, 1020)).toBe(true);
        expect(inWindow(9 * 60, 480, 480)).toBe(false);
    });

    const night = new Date(2026, 9, 10, 23, 30);
    const day = new Date(2026, 9, 10, 14, 0);
    const NIGHT: NightConfig = { enabled: true, from: '22:00', to: '06:00', mode: 'dim', level: 0.4 };

    it('knows when it is night', () => {
        expect(isNight(NIGHT, night)).toBe(true);
        expect(isNight(NIGHT, day)).toBe(false);
        expect(isNight({ ...NIGHT, enabled: false }, night)).toBe(false);
        expect(isNight({ ...NIGHT, from: 'x' }, night)).toBe(false);
    });

    it('dims the clock and dim night modes inside the window, unless an alarm is pinned', () => {
        expect(dimLevel(NIGHT, night, false)).toBe(0.4);
        expect(dimLevel(NIGHT, night, true)).toBe(1);
        expect(dimLevel(NIGHT, day, false)).toBe(1);
        expect(dimLevel({ ...NIGHT, enabled: false }, night, false)).toBe(1);
        expect(dimLevel({ ...NIGHT, level: -2 }, night, false)).toBe(0);
        expect(dimLevel({ ...NIGHT, mode: 'clock' }, night, false)).toBe(0.4);
        expect(dimLevel({ ...NIGHT, mode: 'blank' }, night, false)).toBe(1);
    });

    it('normalises the night mode and the reduce-motion setting', () => {
        expect(normNightMode('CLOCK')).toBe('clock');
        expect(normNightMode('BLANK')).toBe('blank');
        expect(normNightMode('off')).toBe('clock');
        expect(normReduceMotion(' Always ')).toBe('always');
        expect(normReduceMotion('maybe')).toBe('auto');
        expect(wantsReducedMotion('auto', true)).toBe(true);
        expect(wantsReducedMotion('auto', false)).toBe(false);
        expect(wantsReducedMotion('always', false)).toBe(true);
        expect(wantsReducedMotion('never', true)).toBe(false);
    });
});

describe('drift', () => {
    it('stays within [-1, 1] and moves', () => {
        for (let t = 0; t < 3_600_000; t += 61_000) {
            const d = drift(t);
            expect(Math.abs(d.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(d.y)).toBeLessThanOrEqual(1);
        }
        expect(drift(0)).not.toEqual(drift(60_000));
    });
});

describe('countsText', () => {
    it('lists priorities from the pin level up, highest first', () => {
        expect(countsText({ ...zeroCounts(), high: 2, medium: 1, low: 4 }, 2, EN_GUARD_LABELS)).toBe('2 High, 1 Medium');
        expect(countsText({ ...zeroCounts(), critical: 1 }, 0, guardLabelBase('nl-BE'))).toBe('1 Kritiek');
        expect(countsText(zeroCounts(), 0, EN_GUARD_LABELS)).toBe('');
    });
});

describe('PressTracker', () => {
    it('holds presses until their release; blur clears them', () => {
        const t = new PressTracker();
        expect(t.held).toBe(false);
        t.press('p1', false, 0);
        t.press('kKeyA', false, 0);
        expect(t.held).toBe(true);
        t.release('p1', 10);
        expect(t.held).toBe(true);
        t.clear();
        expect(t.held).toBe(false);
        t.press('p2', false, 0);
        t.forget('p2');
        expect(t.held).toBe(false);
    });

    it('never swallows the release of a press that began before the cover', () => {
        const t = new PressTracker();
        t.press('p1', false, 0);
        expect(t.swallowing(100)).toBe(false);
        expect(t.release('p1', 20_000)).toBe(false);
        expect(t.swallowing(20_001)).toBe(false);
    });

    it('swallows a waking press held long, its repeats, its release and a short tail', () => {
        const t = new PressTracker();
        t.press('kEnter', true, 0);
        // Auto-repeat keeps the first record.
        t.press('kEnter', false, 30);
        expect(t.isSwallowed('kEnter', 2000)).toBe(true);
        expect(t.swallowing(2000)).toBe(true);
        expect(t.release('kEnter', 2000)).toBe(true);
        expect(t.swallowing(2000 + SWALLOW_TAIL_MS - 1)).toBe(true);
        expect(t.swallowing(2000 + SWALLOW_TAIL_MS)).toBe(false);
        expect(t.isSwallowed('kEnter', 2001)).toBe(false);
    });

    it('stops swallowing after the cap, released or not', () => {
        const t = new PressTracker();
        t.press('p7', true, 0);
        expect(t.swallowing(SWALLOW_CAP_MS)).toBe(true);
        expect(t.swallowing(SWALLOW_CAP_MS + 1)).toBe(false);
        expect(t.held).toBe(true);
        expect(t.release('p7', SWALLOW_CAP_MS + 1)).toBe(false);
    });

    it('gives a swallowed press without a release (wheel) a tail', () => {
        const t = new PressTracker();
        t.swallowedOnce(100);
        expect(t.swallowing(100 + SWALLOW_TAIL_MS - 1)).toBe(true);
        expect(t.swallowing(100 + SWALLOW_TAIL_MS)).toBe(false);
        expect(t.held).toBe(false);
    });
});
