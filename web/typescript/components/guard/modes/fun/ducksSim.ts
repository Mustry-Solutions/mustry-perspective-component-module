// Safety Ducks: rubber ducks in hard hats paddle across a pool; every so
// often one of them says something sensible. Pure; node-tested.

export type Hat = 'white' | 'yellow' | 'orange' | 'none';

export interface Duck {
    /** Position as a fraction of the screen width; ducks leave at one side and come back. */
    x: number;
    /** 0 = far (small, pale) .. 2 = near (big). */
    layer: number;
    dir: 1 | -1;
    /** Screen widths per second. */
    speed: number;
    /** Bobbing phase offset. */
    phase: number;
    hat: Hat;
    vest: boolean;
}

export interface Bubble {
    duck: number;
    text: string;
    /** Seconds left. */
    life: number;
}

export const SLOGANS = [
    'Safety first!',
    'Quack.',
    'Hard hat on? Good.',
    'Lock out, tag out.',
    'Did someone ack that alarm?',
    'Hydrate.',
    'Near miss? Report it.',
    'Is the line running?',
    'Break time!',
    '5S your pond.',
    'Mind the wet floor.',
    'Quack quack. (shift handover)'
];

export const DUCK_COUNT = 9;
const HATS: Hat[] = ['white', 'yellow', 'orange', 'white', 'none'];

/** The water surface height offset at x (screen widths) and time t, in fractions of screen height. */
export function waveY(x: number, t: number): number {
    return 0.008 * Math.sin(x * 9 + t * 1.3) + 0.005 * Math.sin(x * 23 - t * 2.1) + 0.003 * Math.sin(x * 51 + t * 3.7);
}

export class DucksSim {
    ducks: Duck[] = [];
    bubble: Bubble | null = null;
    time = 0;
    private nextBubble = 4;

    constructor(private readonly random: () => number, count = DUCK_COUNT) {
        for (let i = 0; i < count; i++) {
            const layer = i % 3;
            const dir: 1 | -1 = this.random() < 0.65 ? 1 : -1;
            this.ducks.push({
                x: this.random() * 1.2 - 0.1,
                layer,
                dir,
                speed: (0.012 + this.random() * 0.012) * (0.6 + layer * 0.3),
                phase: this.random() * 10,
                hat: HATS[Math.floor(this.random() * HATS.length)],
                vest: this.random() < 0.35
            });
        }
        // Far ducks first, so near ones are drawn over them.
        this.ducks.sort((a, b) => a.layer - b.layer);
    }

    step(dt: number): void {
        this.time += dt;
        for (const d of this.ducks) {
            d.x += d.dir * d.speed * dt;
            if (d.dir === 1 && d.x > 1.15) {
                d.x = -0.15;
            } else if (d.dir === -1 && d.x < -0.15) {
                d.x = 1.15;
            }
        }
        if (this.bubble) {
            this.bubble.life -= dt;
            if (this.bubble.life <= 0) {
                this.bubble = null;
            }
        }
        this.nextBubble -= dt;
        if (this.nextBubble <= 0 && !this.bubble) {
            // Only a duck well inside the screen gets to speak, and near ducks are easier to read.
            const speakers = this.ducks.map((d, i) => ({ d, i })).filter(({ d }) => d.x > 0.15 && d.x < 0.8 && d.layer > 0);
            if (speakers.length > 0) {
                const pick = speakers[Math.floor(this.random() * speakers.length)];
                this.bubble = { duck: pick.i, text: SLOGANS[Math.floor(this.random() * SLOGANS.length)], life: 4.5 };
            }
            this.nextBubble = 7 + this.random() * 8;
        }
    }
}
