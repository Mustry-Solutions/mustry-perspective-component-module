// Bounce renderer: the badge, a colour change on every bounce, and confetti
// plus a headline when it finally hits a corner. A stats line keeps score.
import { drift } from '../../idleLogic';
import { GuardProps } from '../../guardProps';
import { fitCanvas } from '../frameLoop';
import { ModeRenderer } from '../renderer';
import { BounceSim } from './bounceSim';

const COLORS = ['#ff4d6d', '#ffb703', '#3ddc97', '#4cc9f0', '#b388ff', '#ff8fab', '#90e0ef', '#f9f871'];

interface Confetti {
    x: number;
    y: number;
    vx: number;
    vy: number;
    spin: number;
    angle: number;
    color: string;
    life: number;
}

function ago(sec: number): string {
    if (sec < 90) {
        return `${Math.round(sec)} s`;
    }
    if (sec < 5400) {
        return `${Math.round(sec / 60)} min`;
    }
    return `${(sec / 3600).toFixed(1)} h`;
}

export class BounceRenderer implements ModeRenderer {
    readonly kind = '2d' as const;
    private readonly ctx: CanvasRenderingContext2D | null;
    private readonly sim: BounceSim;
    private text = 'IDLE';
    private drifting = true;
    private color = 0;
    private confetti: Confetti[] = [];
    private headline = 0;

    constructor(private readonly canvas: HTMLCanvasElement, random: () => number = Math.random) {
        this.ctx = canvas.getContext('2d');
        this.sim = new BounceSim(random);
    }

    configure(props: GuardProps): void {
        this.text = props.modes.bounce.text.trim() || 'IDLE';
        this.drifting = props.burnIn.drift;
    }

    private burst(x: number, y: number, unit: number): void {
        for (let i = 0; i < 160; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = unit * (0.25 + Math.random() * 0.75);
            this.confetti.push({
                x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - unit * 0.4, spin: (Math.random() - 0.5) * 12,
                angle: Math.random() * 6, color: COLORS[i % COLORS.length], life: 3 + Math.random() * 2
            });
        }
        this.headline = 3.5;
    }

    frame(dtMs: number, now: number): void {
        const ctx = this.ctx;
        if (!ctx) {
            return;
        }
        fitCanvas(this.canvas);
        const w = this.canvas.width;
        const h = this.canvas.height;
        const unit = Math.min(w, h);
        const dt = Math.min(dtMs, 100) / 1000;
        const fontPx = Math.round(unit * 0.075);
        ctx.font = `800 ${fontPx}px Inter, 'Segoe UI', system-ui, sans-serif`;
        const textW = ctx.measureText(this.text).width;
        const bw = textW + fontPx * 1.1;
        const bh = fontPx * 1.7;
        const ev = this.sim.step(dt, w, h, bw, bh);
        if (ev.bounces > 0) {
            this.color = (this.color + 1) % COLORS.length;
        }
        if (ev.corner) {
            this.burst(this.sim.x + bw / 2, this.sim.y + bh / 2, unit);
        }

        ctx.fillStyle = '#050608';
        ctx.fillRect(0, 0, w, h);

        // Confetti behind the badge.
        const g = unit * 0.9;
        this.confetti = this.confetti.filter((c) => (c.life -= dt) > 0);
        for (const c of this.confetti) {
            c.vy += g * dt;
            c.vx *= 0.99;
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.angle += c.spin * dt;
            ctx.save();
            ctx.globalAlpha = Math.min(1, c.life);
            ctx.translate(c.x, c.y);
            ctx.rotate(c.angle);
            ctx.fillStyle = c.color;
            ctx.fillRect(-unit * 0.006, -unit * 0.0035, unit * 0.012, unit * 0.007);
            ctx.restore();
        }

        // The badge.
        const col = COLORS[this.color];
        const x = this.sim.x;
        const y = this.sim.y;
        const r = bh * 0.22;
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = unit * 0.03;
        ctx.lineWidth = Math.max(2, unit * 0.006);
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + bw, y, x + bw, y + bh, r);
        ctx.arcTo(x + bw, y + bh, x, y + bh, r);
        ctx.arcTo(x, y + bh, x, y, r);
        ctx.arcTo(x, y, x + bw, y, r);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, x + bw / 2, y + bh / 2 + fontPx * 0.04);
        ctx.restore();

        // The celebration.
        if (this.headline > 0) {
            this.headline -= dt;
            const t = Math.min(1, this.headline);
            ctx.save();
            ctx.globalAlpha = t;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const pop = 1 + Math.max(0, this.headline - 3) * 0.6;
            ctx.font = `900 ${Math.round(unit * 0.12 * pop)}px Inter, 'Segoe UI', system-ui, sans-serif`;
            ctx.fillText('CORNER!', w / 2, h / 2);
            ctx.restore();
        }

        // The scoreboard, small and dim, wandering slowly like all idle text.
        const d = this.drifting ? drift(now) : { x: 0, y: 0 };
        ctx.save();
        ctx.font = `500 ${Math.round(unit * 0.022)}px Inter, 'Segoe UI', system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(215, 220, 228, 0.32)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const stats = `bounces ${this.sim.bounces.toLocaleString()}  ·  corners ${this.sim.corners}  ·  ` +
            (this.sim.corners > 0 ? `last corner ${ago(this.sim.sinceCorner)} ago` : `no corner yet (${ago(this.sim.sinceCorner)})`);
        ctx.fillText(stats, w / 2 + d.x * w * 0.15, h * 0.95 + d.y * h * 0.02);
        ctx.restore();
    }

    dispose(): void {
        this.confetti = [];
    }
}
