// Picks how hard the GL modes work. A wall TV driven by a Raspberry Pi and a
// control-room PC with a real GPU run the same module; the governor watches
// the frame interval and steps down (never up, so it cannot oscillate) when a
// screen cannot keep up. Pure: node-tested.

export type QualitySetting = 'auto' | 'high' | 'low';

export interface QualityLevel {
    /** Internal resolution as a fraction of the canvas. */
    scale: number;
    msaa: boolean;
    bloom: boolean;
}

export const LEVELS: readonly QualityLevel[] = [
    { scale: 1, msaa: true, bloom: true },
    { scale: 1, msaa: false, bloom: true },
    { scale: 0.75, msaa: false, bloom: true },
    { scale: 0.6, msaa: false, bloom: false }
];

/** Slower than this on average (under ~20 fps) and the governor steps down. */
export const SLOW_FRAME_MS = 50;
/** Frame intervals are averaged over windows of this long. */
export const WINDOW_MS = 2000;
/** The first frames include shader compilation; they are not judged. */
export const WARMUP_MS = 1500;

export function normQuality(value: string): QualitySetting {
    const v = (value || '').trim().toLowerCase();
    return v === 'high' || v === 'low' ? v : 'auto';
}

export class Governor {
    level: number;
    private readonly locked: boolean;
    private elapsed = 0;
    private sum = 0;
    private frames = 0;

    constructor(setting: QualitySetting) {
        this.level = setting === 'low' ? LEVELS.length - 1 : 0;
        this.locked = setting !== 'auto';
    }

    get current(): QualityLevel {
        return LEVELS[this.level];
    }

    /** Feed the interval since the previous frame. Returns true when the level changed. */
    sample(intervalMs: number): boolean {
        if (this.locked || !Number.isFinite(intervalMs) || intervalMs <= 0) {
            return false;
        }
        this.elapsed += intervalMs;
        if (this.elapsed < WARMUP_MS) {
            return false;
        }
        this.sum += intervalMs;
        this.frames++;
        if (this.sum < WINDOW_MS) {
            return false;
        }
        const avg = this.sum / this.frames;
        this.sum = 0;
        this.frames = 0;
        if (avg > SLOW_FRAME_MS && this.level < LEVELS.length - 1) {
            this.level++;
            return true;
        }
        return false;
    }
}
