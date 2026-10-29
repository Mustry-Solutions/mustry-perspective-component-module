// Starfield idle mode: flying through stars at a speed (and in a colour) that
// can be bound to the plant, e.g. the line rate and the line state.
import { GuardProps } from '../guardProps';
import { cssToRgb, fitCanvas, Rgb } from './frameLoop';
import { ModeRenderer } from './renderer';

export interface StarfieldConfig {
    speed: number;
    color: string;
    density: number;
}

interface Star {
    x: number;
    y: number;
    z: number;
    pz: number;
}

const WHITE: Rgb = [255, 255, 255];

/** The 2D fallback for browsers without WebGL2 (see gl/starfieldGL.ts for the real one). */
export class Starfield implements ModeRenderer {
    readonly kind = '2d' as const;
    private stars: Star[] = [];
    private cfg: StarfieldConfig = { speed: 1, color: '', density: 400 };
    private rgb: Rgb = WHITE;
    private readonly ctx: CanvasRenderingContext2D | null;

    constructor(private readonly canvas: HTMLCanvasElement) {
        this.ctx = canvas.getContext('2d');
    }

    configure(props: GuardProps): void {
        const cfg: StarfieldConfig = props.modes.starfield;
        const density = Math.round(Math.min(3000, Math.max(50, Number.isFinite(cfg.density) ? cfg.density : 400)));
        if (density !== this.stars.length) {
            this.stars = Array.from({ length: density }, () => this.spawn(Math.random()));
        }
        if (this.ctx && cfg.color !== this.cfg.color) {
            this.rgb = cssToRgb(this.ctx, cfg.color, WHITE);
        }
        this.cfg = { ...cfg, density };
    }

    private spawn(z: number): Star {
        return { x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1), z, pz: z };
    }

    dispose(): void {
        // Nothing held beyond the canvas.
    }

    frame(dtMs: number): void {
        const ctx = this.ctx;
        if (!ctx) {
            return;
        }
        fitCanvas(this.canvas);
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const scale = Math.max(w, h) * 0.5;
        const speed = Number.isFinite(this.cfg.speed) ? Math.min(20, Math.max(0, this.cfg.speed)) : 1;
        const dz = speed * 0.25 * (dtMs / 1000);
        ctx.fillStyle = '#020306';
        ctx.fillRect(0, 0, w, h);
        const [r, g, b] = this.rgb;
        ctx.lineCap = 'round';
        for (let i = 0; i < this.stars.length; i++) {
            const s = this.stars[i];
            s.pz = s.z;
            s.z -= dz;
            if (s.z <= 0.02) {
                this.stars[i] = this.spawn(1);
                continue;
            }
            const sx = cx + (s.x / s.z) * scale;
            const sy = cy + (s.y / s.z) * scale;
            if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) {
                this.stars[i] = this.spawn(1);
                continue;
            }
            const px = cx + (s.x / s.pz) * scale;
            const py = cy + (s.y / s.pz) * scale;
            const near = 1 - s.z;
            ctx.strokeStyle = `rgba(${r},${g},${b},${(0.15 + near * 0.85).toFixed(3)})`;
            ctx.lineWidth = Math.max(1, near * 3 * (w / 1600 + 0.5));
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(sx + 0.01, sy + 0.01);
            ctx.stroke();
        }
    }
}
