import { EnterTracker } from '../../shared/enterAnimation';
import { ENTER_MS } from '../calendar/types';
import { CalEvent } from '../calendarLogic';

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
        expect(t.enterClass('b')).toBe(' cal-anim-enter');
    });

    it('matches a recurring occurrence to its base id ("base::date")', () => {
        const t = new EnterTracker();
        t.seed([ev('a')]);
        expect(t.enterClass('a::2026-06-17')).toBe('');
        expect(t.enterClass('b::2026-06-17')).toBe(' cal-anim-enter');
    });

    it('a fresh id settles after the enter animation has played', () => {
        const t = new EnterTracker();
        t.seed([]);
        const onSettled = jest.fn();
        t.detect([ev('n')], onSettled);
        expect(t.enterClass('n')).toBe(' cal-anim-enter');   // still animating
        jest.advanceTimersByTime(ENTER_MS);
        expect(onSettled).toHaveBeenCalledTimes(1);          // re-render to drop the class
        expect(t.enterClass('n')).toBe('');                  // settled
    });

    it('detect is idempotent while an id is pending and skips ids without an id', () => {
        const t = new EnterTracker();
        t.seed([]);
        const onSettled = jest.fn();
        t.detect([ev('n'), { title: 'anon', start: '2026-06-15' } as CalEvent], onSettled);
        t.detect([ev('n')], onSettled);   // same id again while pending -> no second timer
        jest.runAllTimers();
        expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('dispose cancels pending settles', () => {
        const t = new EnterTracker();
        t.seed([]);
        const onSettled = jest.fn();
        t.detect([ev('n')], onSettled);
        t.dispose();
        jest.runAllTimers();
        expect(onSettled).not.toHaveBeenCalled();
    });
});
