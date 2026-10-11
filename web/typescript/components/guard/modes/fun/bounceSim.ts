// Bounce: a badge drifts diagonally and bounces off the screen edges, as
// screensavers have since the DVD player. Everybody waits for it to hit a
// corner exactly; when it does, there is confetti. Pure; node-tested.

export interface BounceEvents {
    /** Edges hit this step (0, 1 or 2). */
    bounces: number;
    /** Both a vertical and a horizontal edge within CORNER_PX of each other. */
    corner: boolean;
}

/** How close (px) the other edge must be when one edge is hit for it to count as a corner. */
export const CORNER_PX = 6;

/** Speed as a fraction of min(width, height) per second. */
export const SPEED = 0.16;

export class BounceSim {
    x = 0;
    y = 0;
    vx = 1;
    vy = 1;
    bounces = 0;
    corners = 0;
    /** Simulation seconds since the last corner (or since start). */
    sinceCorner = 0;
    private placed = false;

    constructor(private readonly random: () => number) {}

    /** Place the badge somewhere random the first time the size is known. */
    private place(w: number, h: number, bw: number, bh: number): void {
        this.x = this.random() * Math.max(0, w - bw);
        this.y = this.random() * Math.max(0, h - bh);
        // An angle away from 45 degrees, so it does not trace the same diagonal forever.
        const a = (0.55 + this.random() * 0.4) * (Math.PI / 4) + (this.random() < 0.5 ? 0 : Math.PI / 4);
        this.vx = Math.cos(a) * (this.random() < 0.5 ? -1 : 1);
        this.vy = Math.sin(a) * (this.random() < 0.5 ? -1 : 1);
        this.placed = true;
    }

    /** Advance dt seconds in a w x h screen with a bw x bh badge. */
    step(dt: number, w: number, h: number, bw: number, bh: number): BounceEvents {
        if (!this.placed) {
            this.place(w, h, bw, bh);
        }
        this.sinceCorner += dt;
        const speed = SPEED * Math.min(w, h);
        const maxX = Math.max(0, w - bw);
        const maxY = Math.max(0, h - bh);
        this.x += this.vx * speed * dt;
        this.y += this.vy * speed * dt;
        let hitX = false;
        let hitY = false;
        if (this.x <= 0 || this.x >= maxX) {
            this.x = Math.min(maxX, Math.max(0, this.x));
            this.vx = this.x <= 0 ? Math.abs(this.vx) : -Math.abs(this.vx);
            hitX = true;
        }
        if (this.y <= 0 || this.y >= maxY) {
            this.y = Math.min(maxY, Math.max(0, this.y));
            this.vy = this.y <= 0 ? Math.abs(this.vy) : -Math.abs(this.vy);
            hitY = true;
        }
        const nearY = this.y <= CORNER_PX || this.y >= maxY - CORNER_PX;
        const nearX = this.x <= CORNER_PX || this.x >= maxX - CORNER_PX;
        // One corner hits both edges within a frame or two: count it once.
        const corner = ((hitX && nearY) || (hitY && nearX)) && this.sinceCorner >= 0.5;
        const bounces = (hitX ? 1 : 0) + (hitY ? 1 : 0);
        this.bounces += bounces;
        if (corner) {
            this.corners++;
            this.sinceCorner = 0;
        }
        return { bounces, corner };
    }
}
