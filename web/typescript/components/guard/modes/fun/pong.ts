// Pong renderer: chunky retro scoreboard, dashed net, a phosphor glow and CRT
// scanlines. The field is letterboxed to 16:9 on any screen.
import { drift } from '../../idleLogic';
import { GuardProps } from '../../guardProps';
import { fitCanvas } from '../frameLoop';
import { ModeRenderer } from '../renderer';
import { BALL, FIELD_H, FIELD_W, PADDLE_H, PADDLE_W, PADDLE_X, PongSim, WIN } from './pongSim';

/** 3 x 5 bitmap digits, the way the arcade drew them. */
const DIGITS = [
    '111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'
];

const PHOSPHOR = '#d8ffe8';

export class PongRenderer implements ModeRenderer {
    readonly kind = '2d' as const;
    private readonly ctx: CanvasRenderingContext2D | null;
    private readonly sim: PongSim;
    private names: [string, string] = ['DAY SHIFT', 'NIGHT SHIFT'];
    private flash = 0;
    private banner = 0;
    private drifting = true;

    constructor(private readonly canvas: HTMLCanvasElement, random: () => number = Math.random) {
        this.ctx = canvas.getContext('2d');
        this.sim = new PongSim(random);
    }

    configure(props: GuardProps): void {
        this.names = [props.modes.pong.left.trim() || 'DAY SHIFT', props.modes.pong.right.trim() || 'NIGHT SHIFT'];
        this.drifting = props.burnIn.drift;
    }

    private digit(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, px: number): void {
        const bits = DIGITS[n];
        for (let i = 0; i < 15; i++) {
            if (bits[i] === '1') {
                ctx.fillRect(x + (i % 3) * px, y + Math.floor(i / 3) * px, px, px);
            }
        }
    }

    private number(ctx: CanvasRenderingContext2D, n: number, cx: number, y: number, px: number): void {
        const s = String(n);
        const w = s.length * 4 * px - px;
        [...s].forEach((c, i) => this.digit(ctx, Number(c), cx - w / 2 + i * 4 * px, y, px));
    }

    frame(dtMs: number, now: number): void {
        const ctx = this.ctx;
        if (!ctx) {
            return;
        }
        fitCanvas(this.canvas);
        const dt = Math.min(dtMs, 100) / 1000;
        // Small sub-steps keep the fast ball from tunnelling through a paddle.
        const steps = Math.ceil(dt / 0.008);
        for (let i = 0; i < steps; i++) {
            const ev = this.sim.step(dt / steps);
            if (ev.point >= 0) {
                this.flash = 0.25;
            }
            if (ev.game >= 0) {
                this.banner = 3.5;
            }
        }
        const W = this.canvas.width;
        const H = this.canvas.height;
        ctx.fillStyle = '#030805';
        ctx.fillRect(0, 0, W, H);
        const s = Math.min(W / FIELD_W, H / FIELD_H) * 0.9;
        // The net and the scores would burn in: the whole field wanders a little.
        const d = this.drifting ? drift(now) : { x: 0, y: 0 };
        const ox = (W - FIELD_W * s) / 2 + d.x * W * 0.04;
        const oy = (H - FIELD_H * s) / 2 + d.y * H * 0.04;
        const X = (x: number) => ox + x * s;
        const Y = (y: number) => oy + y * s;

        ctx.save();
        ctx.shadowColor = 'rgba(160, 255, 200, 0.85)';
        ctx.shadowBlur = s * 1.6;
        ctx.fillStyle = PHOSPHOR;
        // Net.
        for (let y = 2; y < FIELD_H; y += 6) {
            ctx.fillRect(X(FIELD_W / 2 - 0.5), Y(y), s, s * 3);
        }
        // Scores and names.
        const px = s * 2.4;
        this.number(ctx, this.sim.score[0], X(FIELD_W * 0.3), Y(6), px);
        this.number(ctx, this.sim.score[1], X(FIELD_W * 0.7), Y(6), px);
        ctx.shadowBlur = s * 0.8;
        ctx.font = `700 ${Math.round(s * 3.2)}px 'Courier New', monospace`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.55;
        ctx.fillText(this.names[0], X(FIELD_W * 0.3), Y(25));
        ctx.fillText(this.names[1], X(FIELD_W * 0.7), Y(25));
        ctx.font = `700 ${Math.round(s * 2.4)}px 'Courier New', monospace`;
        ctx.fillText(`GAMES ${this.sim.games[0]} - ${this.sim.games[1]}  ·  FIRST TO ${WIN}`, X(FIELD_W / 2), Y(FIELD_H - 3));
        ctx.globalAlpha = 1;
        ctx.shadowBlur = s * 1.6;
        // Paddles and ball.
        ctx.fillRect(X(PADDLE_X), Y(this.sim.paddles[0] - PADDLE_H / 2), PADDLE_W * s, PADDLE_H * s);
        ctx.fillRect(X(FIELD_W - PADDLE_X - PADDLE_W), Y(this.sim.paddles[1] - PADDLE_H / 2), PADDLE_W * s, PADDLE_H * s);
        if (this.sim.pause <= 0) {
            ctx.fillRect(X(this.sim.ballX - BALL / 2), Y(this.sim.ballY - BALL / 2), BALL * s, BALL * s);
        }
        // Game over banner.
        if (this.banner > 0 && this.sim.lastWinner >= 0) {
            this.banner -= dt;
            ctx.globalAlpha = Math.min(1, this.banner);
            ctx.font = `900 ${Math.round(s * 7)}px 'Courier New', monospace`;
            ctx.fillText(`${this.names[this.sim.lastWinner]} WINS`, X(FIELD_W / 2), Y(FIELD_H * 0.58));
            ctx.globalAlpha = 1;
        }
        ctx.restore();

        // A point flashes the screen; scanlines and a vignette sell the tube.
        if (this.flash > 0) {
            this.flash -= dt;
            ctx.fillStyle = `rgba(200, 255, 220, ${(this.flash * 0.3).toFixed(3)})`;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        for (let y = 0; y < H; y += 3) {
            ctx.fillRect(0, y, W, 1);
        }
        const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, W, H);
    }

    dispose(): void {
        // Nothing held beyond the canvas.
    }
}
