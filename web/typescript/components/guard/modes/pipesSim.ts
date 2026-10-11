// The Pipes idle mode's simulation: one walker per configured pipe, growing
// cell by cell through a shared 3D grid, turning now and then and never
// crossing another pipe. Pure (an injected random source), node-tested; the
// canvas renderer in pipes.ts draws what it produces.

export type Vec3 = [number, number, number];

export interface Segment {
    /** Index of the pipe (into the configured list) this segment belongs to. */
    pipe: number;
    from: Vec3;
    to: Vec3;
    /** A ball joint at `from`: the pipe turned or started there. */
    joint: boolean;
    /** Distance along this run of pipe at `from`, in cells (flow pulses travel along it). */
    dist: number;
}

export const DIRS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

interface Walker {
    pos: Vec3;
    dir: number;
    /** The next segment starts with a joint. */
    turned: boolean;
    /** Cells grown since this run spawned. */
    dist: number;
}

/** Growth speed in cells per second at flow = 1. */
export const CELLS_PER_SEC = 4;

/** Above this share of the grid filled, the scene starts over. */
export const FULL_RATIO = 0.55;

export class PipesSim {
    readonly size: Vec3;
    segments: Segment[] = [];
    private occupied = new Set<number>();
    private walkers: Walker[] = [];
    /** Per pipe: fractional cells of growth owed (flow accumulates across frames). */
    private owed: number[] = [];
    private readonly random: () => number;

    constructor(size: Vec3, random: () => number) {
        this.size = size;
        this.random = random;
    }

    private key(p: Vec3): number {
        return (p[0] * this.size[1] + p[1]) * this.size[2] + p[2];
    }

    private inside(p: Vec3): boolean {
        return p[0] >= 0 && p[1] >= 0 && p[2] >= 0 && p[0] < this.size[0] && p[1] < this.size[1] && p[2] < this.size[2];
    }

    private free(p: Vec3): boolean {
        return this.inside(p) && !this.occupied.has(this.key(p));
    }

    private cells(): number {
        return this.size[0] * this.size[1] * this.size[2];
    }

    fillRatio(): number {
        return this.occupied.size / this.cells();
    }

    /** Empty the scene; walkers respawn on their next step. */
    reset(): void {
        this.segments = [];
        this.occupied.clear();
        this.walkers = [];
        this.owed = [];
    }

    private randomFreeCell(): Vec3 | null {
        for (let i = 0; i < 64; i++) {
            const p: Vec3 = [
                Math.floor(this.random() * this.size[0]),
                Math.floor(this.random() * this.size[1]),
                Math.floor(this.random() * this.size[2])
            ];
            if (this.free(p)) {
                return p;
            }
        }
        return null;
    }

    private spawn(index: number): Walker | null {
        const pos = this.randomFreeCell();
        if (pos === null) {
            return null;
        }
        this.occupied.add(this.key(pos));
        const w: Walker = { pos, dir: Math.floor(this.random() * DIRS.length), turned: true, dist: 0 };
        this.walkers[index] = w;
        return w;
    }

    private freeDirs(pos: Vec3): number[] {
        const out: number[] = [];
        DIRS.forEach((d, i) => {
            if (this.free([pos[0] + d[0], pos[1] + d[1], pos[2] + d[2]])) {
                out.push(i);
            }
        });
        return out;
    }

    /**
     * Grow pipe `index` by one cell. Returns the new segment, or null when the
     * pipe was boxed in (it respawns elsewhere on the next step).
     */
    stepPipe(index: number): Segment | null {
        let w = this.walkers[index];
        if (!w) {
            w = this.spawn(index) as Walker;
            if (!w) {
                return null;
            }
        }
        const options = this.freeDirs(w.pos);
        if (options.length === 0) {
            delete this.walkers[index];
            return null;
        }
        let dir = w.dir;
        const ahead = options.includes(dir);
        // Turn when blocked, and now and then anyway.
        if (!ahead || this.random() < 0.25) {
            const turns = options.filter((d) => d !== dir);
            if (turns.length > 0) {
                dir = turns[Math.floor(this.random() * turns.length)];
            }
        }
        const joint = w.turned || dir !== w.dir;
        const d = DIRS[dir];
        const to: Vec3 = [w.pos[0] + d[0], w.pos[1] + d[1], w.pos[2] + d[2]];
        const seg: Segment = { pipe: index, from: w.pos, to, joint, dist: w.dist };
        this.occupied.add(this.key(to));
        this.segments.push(seg);
        w.pos = to;
        w.dir = dir;
        w.turned = false;
        w.dist += 1;
        return seg;
    }

    /**
     * Advance time for every pipe by dtMs at the given flows (0 = stopped,
     * 1 = CELLS_PER_SEC, capped at 3). Returns how many segments were added.
     * Starts over when the grid is full enough.
     */
    advance(dtMs: number, flows: number[]): number {
        if (this.fillRatio() >= FULL_RATIO) {
            this.reset();
        }
        let added = 0;
        const dt = Math.max(0, Math.min(dtMs, 1000)) / 1000;
        flows.forEach((flow, i) => {
            const f = Number.isFinite(flow) ? Math.min(3, Math.max(0, flow)) : 0;
            const owed = (this.owed[i] || 0) + f * CELLS_PER_SEC * dt;
            let whole = Math.floor(owed);
            this.owed[i] = owed - whole;
            while (whole-- > 0) {
                if (this.stepPipe(i) !== null) {
                    added++;
                }
            }
        });
        return added;
    }
}

/** Colours by state, ISA-101 flavoured: grey is normal-at-rest, colour means something. */
export const STATE_COLORS: Record<string, string> = {
    running: '#3fb68b',
    idle: '#8a94a6',
    warning: '#f2b33d',
    fault: '#e5484d',
    off: '#4a5160'
};

export function pipeColor(state: string, override: string): string {
    if (override && override.trim() !== '') {
        return override.trim();
    }
    return STATE_COLORS[(state || '').trim().toLowerCase()] || STATE_COLORS.running;
}

/** A small deterministic PRNG (mulberry32) so tests and demos can be repeatable. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
