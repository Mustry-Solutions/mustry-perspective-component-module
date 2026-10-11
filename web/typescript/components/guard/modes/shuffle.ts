// The shuffle mode: a different canvas mode every few minutes while the page
// stays idle, in an order shuffled per idle session. Deterministic from the
// moment the page went idle, so every render agrees without keeping state;
// never the same mode twice in a row.
// Pure; node-tested.
import { CANVAS_MODES, Mode } from '../guardProps';
import { seededRandom } from './pipesSim';

/** A permutation of 0..n-1 from a seed (Fisher-Yates). */
export function permutation(n: number, seed: number): number[] {
    const rand = seededRandom(seed);
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
}

/** Minimum minutes per mode: a screensaver that changes faster is just restless. */
export const MIN_MINUTES = 0.5;

/** The mode to show at `now` for a page idle since `idleSince`. An empty list means every canvas mode. */
export function shufflePick(list: readonly Mode[], idleSince: number, now: number, minutes: number): Mode {
    const pool = list.filter((m) => CANVAS_MODES.includes(m));
    const modes = pool.length > 0 ? Array.from(new Set(pool)) : [...CANVAS_MODES];
    const period = Math.max(MIN_MINUTES, Number.isFinite(minutes) ? minutes : 5) * 60_000;
    const slot = Math.floor(Math.max(0, now - idleSince) / period);
    // One shuffled order per idle session, cycled: distinct entries never repeat back to back.
    const order = permutation(modes.length, idleSince % 2147483647);
    const pick = order[slot % modes.length];
    return modes[pick];
}
