import { CANVAS_MODES, Mode } from '../guard/guardProps';
import { NightConfig } from '../guard/idleLogic';
import { modeToShow, ShowInput } from '../guard/modes/modeToShow';

const DAY = new Date(2026, 9, 10, 14, 0).getTime();
const NIGHT = new Date(2026, 9, 10, 23, 30).getTime();
const NIGHT_CFG: NightConfig = { enabled: true, from: '22:00', to: '06:00', mode: 'blank', level: 0.4 };

function input(over: Partial<ShowInput>): ShowInput {
    return {
        mode: 'pipes',
        shuffle: { modes: [], minutes: 5 },
        night: NIGHT_CFG,
        reduceMotion: false,
        coverSince: DAY,
        now: DAY,
        ...over
    };
}

describe('modeToShow', () => {
    it('shows the configured mode by day', () => {
        expect(modeToShow(input({}))).toEqual({ mode: 'pipes', reason: 'configured' });
    });

    it('rests at night: blank or clock, whatever was configured', () => {
        for (const mode of [...CANVAS_MODES, 'shuffle', 'clock'] as Mode[]) {
            expect(modeToShow(input({ mode, now: NIGHT }))).toEqual({ mode: 'blank', reason: 'night' });
        }
        expect(modeToShow(input({ now: NIGHT, night: { ...NIGHT_CFG, mode: 'clock' } }))).toEqual({ mode: 'clock', reason: 'night' });
    });

    it('never lights up a blank screen at night', () => {
        expect(modeToShow(input({ mode: 'blank', now: NIGHT }))).toEqual({ mode: 'blank', reason: 'configured' });
        expect(modeToShow(input({ mode: 'blank', now: NIGHT, night: { ...NIGHT_CFG, mode: 'clock' } })))
            .toEqual({ mode: 'blank', reason: 'configured' });
    });

    it('keeps the mode at night when the night mode is dim, or the window is off', () => {
        expect(modeToShow(input({ now: NIGHT, night: { ...NIGHT_CFG, mode: 'dim' } })).mode).toBe('pipes');
        expect(modeToShow(input({ now: NIGHT, night: { ...NIGHT_CFG, enabled: false } })).mode).toBe('pipes');
    });

    it('never overrides external: the project draws', () => {
        expect(modeToShow(input({ mode: 'external', now: NIGHT }))).toEqual({ mode: 'external', reason: 'configured' });
        expect(modeToShow(input({ mode: 'external', reduceMotion: true }))).toEqual({ mode: 'external', reason: 'configured' });
    });

    it('replaces every animated mode with the clock for reduced motion', () => {
        for (const mode of CANVAS_MODES) {
            expect(modeToShow(input({ mode, reduceMotion: true }))).toEqual({ mode: 'clock', reason: 'reduced-motion' });
        }
        expect(modeToShow(input({ mode: 'blank', reduceMotion: true }))).toEqual({ mode: 'blank', reason: 'configured' });
        expect(modeToShow(input({ mode: 'shuffle', reduceMotion: true })).mode).toBe('clock');
    });

    it('shuffles by day', () => {
        const shown = modeToShow(input({ mode: 'shuffle', shuffle: { modes: ['lava', 'ducks'], minutes: 1 } }));
        expect(shown.reason).toBe('shuffle');
        expect(['lava', 'ducks']).toContain(shown.mode);
    });
});
