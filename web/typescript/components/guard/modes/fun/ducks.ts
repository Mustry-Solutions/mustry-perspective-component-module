// Safety Ducks renderer: a pool seen from the side, caustic light, rising
// bubbles, and rubber ducks (hard hats, the odd hi-vis vest) bobbing on the
// waves. All drawn with paths; no images.
import { GuardProps } from '../../guardProps';
import { fitCanvas } from '../frameLoop';
import { ModeRenderer } from '../renderer';
import { Duck, DucksSim, waveY } from './ducksSim';

/** The water line, as a fraction of the screen height. */
const SURFACE = 0.44;
const HAT_COLORS: Record<string, [string, string]> = {
    white: ['#f4f6f8', '#c9ced6'],
    yellow: ['#ffd34d', '#d9a400'],
    orange: ['#ff8a2a', '#cc5d00']
};

interface Fizz {
    x: number;
    y: number;
    r: number;
    speed: number;
    wobble: number;
}

export class DucksRenderer implements ModeRenderer {
    readonly kind = '2d' as const;
    private readonly ctx: CanvasRenderingContext2D | null;
    private readonly sim: DucksSim;
    private fizz: Fizz[] = [];

    constructor(private readonly canvas: HTMLCanvasElement, private readonly random: () => number = Math.random) {
        this.ctx = canvas.getContext('2d');
        this.sim = new DucksSim(random);
        for (let i = 0; i < 45; i++) {
            this.fizz.push(this.newFizz(true));
        }
    }

    configure(_props: GuardProps): void {
        // Ducks need no configuration. They know what they are doing.
    }

    private newFizz(anywhere: boolean): Fizz {
        return {
            x: this.random(),
            y: anywhere ? SURFACE + this.random() * (1 - SURFACE) : 1.02,
            r: 0.002 + this.random() * 0.006,
            speed: 0.03 + this.random() * 0.06,
            wobble: this.random() * 10
        };
    }

    private drawDuck(ctx: CanvasRenderingContext2D, d: Duck, x: number, y: number, size: number, tilt: number): void {
        const S = size;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        ctx.scale(d.dir, 1);
        const pale = d.layer === 0 ? 0.82 : 1;
        ctx.globalAlpha = pale;
        // Body with a tail.
        const body = ctx.createLinearGradient(0, -0.4 * S, 0, 0.3 * S);
        body.addColorStop(0, '#ffe066');
        body.addColorStop(1, '#f2b705');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(0, -0.05 * S, 0.55 * S, 0.32 * S, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-0.38 * S, -0.2 * S);
        ctx.quadraticCurveTo(-0.62 * S, -0.22 * S, -0.7 * S, -0.46 * S);
        ctx.quadraticCurveTo(-0.5 * S, -0.34 * S, -0.3 * S, -0.06 * S);
        ctx.fill();
        // Hi-vis vest: an orange band with a reflective stripe, clipped to the body.
        if (d.vest) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(0, -0.05 * S, 0.55 * S, 0.32 * S, 0, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = '#ff6b1a';
            ctx.fillRect(-0.18 * S, -0.5 * S, 0.34 * S, 0.9 * S);
            ctx.fillStyle = '#e8eef3';
            ctx.fillRect(-0.18 * S, -0.12 * S, 0.34 * S, 0.06 * S);
            ctx.restore();
        }
        // Wing.
        ctx.fillStyle = '#e8a800';
        ctx.beginPath();
        ctx.ellipse(-0.1 * S, -0.08 * S, 0.24 * S, 0.12 * S, -0.35, 0, Math.PI * 2);
        ctx.fill();
        // Head, beak, eye.
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(0.3 * S, -0.48 * S, 0.24 * S, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff8c1a';
        ctx.beginPath();
        ctx.ellipse(0.56 * S, -0.43 * S, 0.14 * S, 0.06 * S, 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1b1b1b';
        ctx.beginPath();
        ctx.arc(0.37 * S, -0.54 * S, 0.035 * S, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0.382 * S, -0.552 * S, 0.012 * S, 0, Math.PI * 2);
        ctx.fill();
        // Hard hat: a dome, a ridge and a brim.
        const hat = HAT_COLORS[d.hat];
        if (hat) {
            const hg = ctx.createLinearGradient(0, -0.9 * S, 0, -0.62 * S);
            hg.addColorStop(0, hat[0]);
            hg.addColorStop(1, hat[1]);
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.arc(0.28 * S, -0.64 * S, 0.21 * S, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(0.02 * S, -0.66 * S, 0.54 * S, 0.05 * S);
            ctx.fillStyle = hat[1];
            ctx.fillRect(0.26 * S, -0.86 * S, 0.04 * S, 0.21 * S);
        }
        ctx.restore();
    }

    private drawBubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, unit: number, alpha: number): void {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `600 ${Math.round(unit * 0.03)}px Inter, 'Segoe UI', system-ui, sans-serif`;
        const tw = ctx.measureText(text).width;
        const pad = unit * 0.018;
        const bw = tw + pad * 2;
        const bh = unit * 0.03 + pad * 1.6;
        const bx = Math.max(unit * 0.02, Math.min(x - bw / 2, ctx.canvas.width - bw - unit * 0.02));
        const by = y - bh - unit * 0.03;
        const r = bh * 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
        ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
        ctx.arcTo(bx, by + bh, bx, by, r);
        ctx.arcTo(bx, by, bx + bw, by, r);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - unit * 0.012, by + bh - 1);
        ctx.lineTo(x + unit * 0.012, by + bh - 1);
        ctx.lineTo(x, by + bh + unit * 0.022);
        ctx.fill();
        ctx.fillStyle = '#1d2733';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + pad, by + bh / 2);
        ctx.restore();
    }

    frame(dtMs: number): void {
        const ctx = this.ctx;
        if (!ctx) {
            return;
        }
        fitCanvas(this.canvas);
        const dt = Math.min(dtMs, 100) / 1000;
        this.sim.step(dt);
        const t = this.sim.time;
        const W = this.canvas.width;
        const H = this.canvas.height;
        const unit = Math.min(W, H);
        const surf = (xFrac: number) => (SURFACE + waveY(xFrac, t)) * H;

        // Above the water: a warm, tiled pool-hall wall.
        const wall = ctx.createLinearGradient(0, 0, 0, SURFACE * H);
        wall.addColorStop(0, '#f6efe4');
        wall.addColorStop(1, '#e3d7c6');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, W, SURFACE * H + 2);
        ctx.strokeStyle = 'rgba(160, 140, 115, 0.18)';
        ctx.lineWidth = 1;
        const tile = unit * 0.09;
        for (let x = 0; x < W; x += tile) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, SURFACE * H);
            ctx.stroke();
        }
        for (let y = 0; y < SURFACE * H; y += tile) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        // Ducks, far to near; the water is drawn over their lower halves afterwards.
        const sizes = [0.07, 0.1, 0.14];
        const placed: Array<{ x: number; y: number; size: number }> = [];
        this.sim.ducks.forEach((d) => {
            const x = d.x * W;
            const size = sizes[d.layer] * unit;
            const bob = Math.sin(t * 1.7 + d.phase) * unit * 0.004;
            const y = surf(d.x) + size * (0.12 - d.layer * 0.02) + bob;
            const slope = (waveY(d.x + 0.01, t) - waveY(d.x - 0.01, t)) / 0.02 * (H / W);
            this.drawDuck(ctx, d, x, y, size, Math.atan(slope) * 0.8 + Math.sin(t * 1.3 + d.phase) * 0.04);
            placed.push({ x, y, size });
        });

        // The water: a translucent body with a wavy top, then caustics and bubbles.
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let i = 0; i <= 64; i++) {
            const xf = i / 64;
            ctx.lineTo(xf * W, surf(xf));
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        const water = ctx.createLinearGradient(0, SURFACE * H, 0, H);
        water.addColorStop(0, 'rgba(40, 170, 215, 0.62)');
        water.addColorStop(0.35, 'rgba(18, 110, 170, 0.92)');
        water.addColorStop(1, 'rgba(6, 40, 78, 1)');
        ctx.fillStyle = water;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
            const cx = ((i / 7 + t * 0.012 * (i % 2 ? 1 : -1)) % 1 + 1) % 1 * W;
            const g = ctx.createLinearGradient(cx - unit * 0.08, 0, cx + unit * 0.08, 0);
            g.addColorStop(0, 'rgba(120, 220, 255, 0)');
            g.addColorStop(0.5, `rgba(120, 220, 255, ${(0.05 + 0.03 * Math.sin(t * 0.7 + i)).toFixed(3)})`);
            g.addColorStop(1, 'rgba(120, 220, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(cx - unit * 0.08, SURFACE * H);
            ctx.lineTo(cx + unit * 0.08, SURFACE * H);
            ctx.lineTo(cx + unit * 0.2, H);
            ctx.lineTo(cx - unit * 0.02, H);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(220, 245, 255, 0.55)';
        ctx.lineWidth = Math.max(1, unit * 0.002);
        for (const f of this.fizz) {
            f.y -= f.speed * dt;
            const fx = (f.x + Math.sin(t * 2 + f.wobble) * 0.004) * W;
            if (f.y * H < surf(f.x) + 4) {
                Object.assign(f, this.newFizz(false));
                continue;
            }
            ctx.beginPath();
            ctx.arc(fx, f.y * H, f.r * unit, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
        // A bright line where the light catches the surface.
        ctx.strokeStyle = 'rgba(230, 250, 255, 0.85)';
        ctx.lineWidth = Math.max(1.5, unit * 0.003);
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
            const xf = i / 64;
            if (i === 0) {
                ctx.moveTo(0, surf(0));
            } else {
                ctx.lineTo(xf * W, surf(xf));
            }
        }
        ctx.stroke();

        // Whoever has something to say.
        const b = this.sim.bubble;
        if (b && placed[b.duck]) {
            const p = placed[b.duck];
            this.drawBubble(ctx, b.text, p.x, p.y - p.size * 0.9, unit, Math.min(1, b.life * 2, (4.5 - b.life) * 4));
        }
    }

    dispose(): void {
        this.fizz = [];
    }
}
