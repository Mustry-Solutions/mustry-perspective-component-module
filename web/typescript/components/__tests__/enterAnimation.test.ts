import { EnterTracker } from '../../shared/enterAnimation';
import { ENTER_MS } from '../calendar/calendarTypes';
import { CalEvent } from '../calendar/calendarLogic';

const ev = (id: string): CalEvent => ({ id, title: id, start: '2026-06-15T09:00:00' });

describe('EnterTracker', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('never animates before mount (initial render)', () => {
        const t = new EnterTracker();
        expect(t.enterClass('a')).toBe('');
    });

    it('seeded (initial) events do not animate; unseen ids do', () => {
        const t = new EnterTracker();
        t.seed([ev('a')]);
        expect(t.enterClass('a')).toBe('');
        expect(t.enterClass('b')).toBe(' mustry-cal-anim-enter');
    });

    it('matches a recurring occurrence to its base id ("base::date")', () => {
        const t = new EnterTracker();
        t.seed([ev('a')]);
        expect(t.enterClass('a::2026-06-17')).toBe('');
        expect(t.enterClass('b::2026-06-17')).toBe(' mustry-cal-anim-enter');
    });

    it('a fresh id settles after the enter animation has played', () => {
        const t = new EnterTracker();
        t.seed([ev('a')]);
        const onSettled = jest.fn();
        t.detect([ev('n')], onSettled);
        expect(t.enterClass('n')).toBe(' mustry-cal-anim-enter');   // still animating
        jest.advanceTimersByTime(ENTER_MS);
        expect(onSettled).toHaveBeenCalledTimes(1);          // re-render to drop the class
        expect(t.enterClass('n')).toBe('');                  // settled
    });

    it('detect is idempotent while an id is pending and skips ids without an id', () => {
        const t = new EnterTracker();
        t.seed([ev('a')]);
        const onSettled = jest.fn();
        t.detect([ev('n'), { title: 'anon', start: '2026-06-15' } as CalEvent], onSettled);
        t.detect([ev('n')], onSettled);   // same id again while pending -> no second timer
        jest.runAllTimers();
        expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('data that arrives after mount is the initial load, not new events', () => {
        // A bound board mounts before its binding delivers: the first data must
        // not fade in as if every event had just been created.
        const t = new EnterTracker();
        t.seed([]);
        expect(t.enterClass('a')).toBe('');                  // the render that shows the data
        const onSettled = jest.fn();
        t.detect([ev('a'), ev('b')], onSettled);
        expect(t.enterClass('a')).toBe('');
        expect(t.enterClass('b')).toBe('');
        jest.runAllTimers();
        expect(onSettled).not.toHaveBeenCalled();
        t.detect([ev('a'), ev('b'), ev('c')], onSettled);   // a later addition still animates
        expect(t.enterClass('c')).toBe(' mustry-cal-anim-enter');
    });

    it('a board emptied after load still animates the next new event', () => {
        const t = new EnterTracker();
        t.seed([ev('a')]);
        t.detect([], jest.fn());
        expect(t.enterClass('b')).toBe(' mustry-cal-anim-enter');
    });

    it('the first data after navigating is the new window\'s load', () => {
        // A windowed binding refetches on navigation: the new window's events
        // are new ids, but not new events.
        const t = new EnterTracker();
        t.seed([ev('a')]);
        t.navigated();
        expect(t.enterClass('x')).toBe('');                  // render showing the new window
        t.detect([ev('x'), ev('y')], jest.fn());
        expect(t.enterClass('x')).toBe('');
        expect(t.enterClass('y')).toBe('');
        t.detect([ev('x'), ev('y'), ev('z')], jest.fn());  // later additions animate again
        expect(t.enterClass('z')).toBe(' mustry-cal-anim-enter');
    });

    it('navigating with unchanged data waits for the next new ids', () => {
        // Static (non-windowed) data: navigation brings no new ids, so the
        // reload stays pending until one arrives.
        const t = new EnterTracker();
        t.seed([ev('a')]);
        t.navigated();
        t.detect([ev('a')], jest.fn());
        t.detect([ev('a'), ev('b')], jest.fn());
        expect(t.enterClass('b')).toBe('');
    });

    it('an edit from the component itself still animates after navigating', () => {
        const t = new EnterTracker();
        t.seed([ev('a')]);
        t.navigated();
        t.edited();                                          // the component fired onChange
        t.detect([ev('a'), ev('n')], jest.fn());
        expect(t.enterClass('n')).toBe(' mustry-cal-anim-enter');
    });

    it('the first event created on an empty board animates', () => {
        const t = new EnterTracker();
        t.seed([]);
        t.edited();
        t.detect([ev('n')], jest.fn());
        expect(t.enterClass('n')).toBe(' mustry-cal-anim-enter');
    });

    it('dispose cancels pending settles', () => {
        const t = new EnterTracker();
        t.seed([ev('a')]);
        const onSettled = jest.fn();
        t.detect([ev('n')], onSettled);
        t.dispose();
        jest.runAllTimers();
        expect(onSettled).not.toHaveBeenCalled();
    });
});
