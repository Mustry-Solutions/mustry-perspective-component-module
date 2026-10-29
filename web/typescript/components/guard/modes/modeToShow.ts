// Decides what the cover shows right now. The configured mode is the start;
// the night window, shuffle and the reduced-motion preference can each
// replace it. Pure; node-tested.
import { isNight, NightConfig } from '../idleLogic';
import { CANVAS_MODES, Mode } from '../guardProps';
import { shufflePick } from './shuffle';

export type ShowReason = 'configured' | 'night' | 'shuffle' | 'reduced-motion';

export interface ShowInput {
    mode: Mode;
    shuffle: { modes: Mode[]; minutes: number };
    night: NightConfig;
    /** The viewer asked for less motion (browser preference or config.reduceMotion). */
    reduceMotion: boolean;
    /** When the current cover went up: shuffle's clock. */
    coverSince: number;
    now: number;
}

export interface Shown {
    mode: Mode;
    reason: ShowReason;
}

export function modeToShow(i: ShowInput): Shown {
    // External means the project draws: nothing here overrides that. Blank is
    // already as dark as it gets: the night clock must not light it up.
    if (i.mode === 'external' || i.mode === 'blank') {
        return { mode: i.mode, reason: 'configured' };
    }
    // At night the screen rests: nothing animated, nothing rendered when blank.
    if (i.night.mode !== 'dim' && isNight(i.night, new Date(i.now))) {
        return { mode: i.night.mode, reason: 'night' };
    }
    let mode: Mode = i.mode;
    let reason: ShowReason = 'configured';
    if (mode === 'shuffle') {
        mode = shufflePick(i.shuffle.modes, i.coverSince, i.now, i.shuffle.minutes);
        reason = 'shuffle';
    }
    // No moving scenes for viewers who asked for less motion: the clock (its text drifts slowly).
    if (i.reduceMotion && CANVAS_MODES.includes(mode)) {
        return { mode: 'clock', reason: 'reduced-motion' };
    }
    return { mode, reason };
}
