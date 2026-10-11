// Pipes idle mode: draws the PipesSim scene as shaded tubes with ball joints,
// in perspective, far segments first. One colour per configured pipe, from its
// bound state; growth speed from its bound flow.
import { GuardProps, LineSpec } from '../guardProps';
import { cssToRgb, fitCanvas, Rgb, shade } from './frameLoop';
import { PipesSim, pipeColor, Segment, Vec3 } from './pipesSim';
import { ModeRenderer } from './renderer';

export const GRID: Vec3 = [16, 10, 10];

/** Tube radius in grid cells. */
const RADIUS = 0.26;
/** Camera distance from the grid centre, in cells. */
const CAMERA = 21;
/** A fixed three-quarter view: yaw and pitch in radians. */
const YAW = 0.55;
const PITCH = -0.38;

/** Focal length in pixels: the whole grid fits the screen with a little margin. */
function focal(w: number, h: number): number {
    return Math.min(w * 0.95, h * 1.6);
}

interface Projected {
    x: number;
    y: number;
    /** Distance from the camera. */
    d: number;
}

type Drawable =
    | { kind: 'tube'; depth: number; a: Projected; b: Projected; rgb: Rgb }
    | { kind: 'ball'; depth: number; p: Projected; rgb: Rgb };

/** The 2D fallback for browsers without WebGL2 (see gl/pipesGL.ts for the real one). */
export class PipesRenderer implements ModeRenderer {
    readonly kind = '2d' as const;
    readonly sim: PipesSim;
    private specs: LineSpec[] = [];
    private colors: Rgb[] = [];
    private dirty = true;
    private sceneStarted = Date.now();
    private resetAfterMs = 90_000;
    private readonly ctx: CanvasRenderingContext2D | null;

    constructor(private readonly canvas: HTMLCanvasElement, random: () => number = Math.random) {
        this.ctx = canvas.getContext('2d');
        this.sim = new PipesSim(GRID, random);
    }

    configure(props: GuardProps): void {
        const specs = props.lines;
        const resetAfterSec = props.modes.pipes.resetAfterSec;
        const colorsKey = JSON.stringify(specs.map((s) => [s.state, s.color]));
        const oldKey = JSON.stringify(this.specs.map((s) => [s.state, s.color]));
        if (specs.length !== this.specs.length) {
            this.sim.reset();
            this.sceneStarted = Date.now();
        }
        this.specs = specs;
        if (this.ctx && (colorsKey !== oldKey || this.colors.length !== specs.length)) {
            this.colors = specs.map((s) => cssToRgb(this.ctx as CanvasRenderingContext2D, pipeColor(s.state, s.color), [63, 182, 139]));
            this.dirty = true;
        }
        this.resetAfterMs = Math.max(10, Number.isFinite(resetAfterSec) ? resetAfterSec : 90) * 1000;
    }

    frame(dtMs: number, now: number): void {
        if (!this.ctx) {
            return;
        }
        if (now - this.sceneStarted > this.resetAfterMs) {
            this.sim.reset();
            this.sceneStarted = now;
            this.dirty = true;
        }
        const before = this.sim.segments.length;
        const added = this.sim.advance(dtMs, this.specs.map((s) => s.flow));
        if (this.sim.segments.length < before) {
            // The sim started over because the grid filled up.
            this.sceneStarted = now;
        }
        if (fitCanvas(this.canvas) || added > 0 || this.sim.segments.length !== before) {
            this.dirty = true;
        }
        if (this.dirty) {
            this.dirty = false;
            this.draw();
        }
    }

    dispose(): void {
        // Nothing held beyond the canvas.
    }

    private project(p: Vec3, w: number, h: number): Projected {
        // Grid cell -> centred world coordinates.
        const x0 = p[0] - (GRID[0] - 1) / 2;
        const y0 = p[1] - (GRID[1] - 1) / 2;
        const z0 = p[2] - (GRID[2] - 1) / 2;
        // Yaw around Y, then pitch around X.
        const cy = Math.cos(YAW);
        const sy = Math.sin(YAW);
        const x1 = x0 * cy + z0 * sy;
        const z1 = -x0 * sy + z0 * cy;
        const cp = Math.cos(PITCH);
        const sp = Math.sin(PITCH);
        const y2 = y0 * cp - z1 * sp;
        const z2 = y0 * sp + z1 * cp;
        const d = z2 + CAMERA;
        const f = focal(w, h);
        return { x: w / 2 + (x1 / d) * f, y: h / 2 - (y2 / d) * f, d };
    }

    private draw(): void {
        const ctx = this.ctx as CanvasRenderingContext2D;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#05070b');
        bg.addColorStop(1, '#0b1018');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        const f = focal(w, h);
        const items: Drawable[] = [];
        const heads = new Map<number, Segment>();
        for (const s of this.sim.segments) {
            const rgb = this.colors[s.pipe] || [63, 182, 139];
            const a = this.project(s.from, w, h);
            const b = this.project(s.to, w, h);
            items.push({ kind: 'tube', depth: (a.d + b.d) / 2, a, b, rgb });
            if (s.joint) {
                items.push({ kind: 'ball', depth: a.d - 0.01, p: a, rgb });
            }
            heads.set(s.pipe, s);
        }
        heads.forEach((s) => {
            const p = this.project(s.to, w, h);
            items.push({ kind: 'ball', depth: p.d - 0.01, p, rgb: this.colors[s.pipe] || [63, 182, 139] });
        });
        items.sort((m, n) => n.depth - m.depth);
        for (const it of items) {
            if (it.kind === 'tube') {
                drawTube(ctx, it.a, it.b, it.rgb, f);
            } else {
                drawBall(ctx, it.p, it.rgb, f);
            }
        }
    }
}

function drawTube(ctx: CanvasRenderingContext2D, a: Projected, b: Projected, rgb: Rgb, f: number): void {
    const width = (2 * RADIUS * f) / ((a.d + b.d) / 2);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // The normal on the lit side (light from the upper left).
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 0 || (ny === 0 && nx > 0)) {
        nx = -nx;
        ny = -ny;
    }
    ctx.lineCap = 'round';
    const pass = (color: string, wd: number, off: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, wd);
        ctx.beginPath();
        ctx.moveTo(a.x + nx * off, a.y + ny * off);
        ctx.lineTo(b.x + nx * off, b.y + ny * off);
        ctx.stroke();
    };
    pass(shade(rgb, -0.55), width, 0);
    pass(shade(rgb, -0.15), width * 0.74, width * 0.06);
    pass(shade(rgb, 0.1), width * 0.42, width * 0.14);
    pass(shade(rgb, 0.6), width * 0.14, width * 0.24);
}

function drawBall(ctx: CanvasRenderingContext2D, p: Projected, rgb: Rgb, f: number): void {
    const r = (RADIUS * 1.3 * f) / p.d;
    const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
    g.addColorStop(0, shade(rgb, 0.65));
    g.addColorStop(0.45, shade(rgb, -0.05));
    g.addColorStop(1, shade(rgb, -0.6));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, r), 0, Math.PI * 2);
    ctx.fill();
}
