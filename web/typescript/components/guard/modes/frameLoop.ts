// A requestAnimationFrame loop capped at a frame rate. Browsers stop rAF in
// hidden tabs, so a hidden screensaver costs nothing.

export const DEFAULT_FPS = 30;

export class FrameLoop {
    private raf: number | null = null;
    private last = 0;
    private readonly minFrameMs: number;

    constructor(private readonly draw: (dtMs: number, now: number) => void, fps = DEFAULT_FPS) {
        this.minFrameMs = 1000 / fps - 2;
    }

    start(): void {
        if (this.raf !== null) {
            return;
        }
        this.last = performance.now();
        const step = (t: number) => {
            this.raf = window.requestAnimationFrame(step);
            const dt = t - this.last;
            if (dt < this.minFrameMs) {
                return;
            }
            this.last = t;
            this.draw(Math.min(dt, 250), Date.now());
        };
        this.raf = window.requestAnimationFrame(step);
    }

    stop(): void {
        if (this.raf !== null) {
            window.cancelAnimationFrame(this.raf);
            this.raf = null;
        }
    }
}

/** Match the canvas backing store to its CSS size times devicePixelRatio. Returns true when it changed. */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        return true;
    }
    return false;
}

export type Rgb = [number, number, number];

/**
 * Any CSS colour -> rgb, by letting a canvas normalise it. Unknown colours
 * fall back. Canvas reports '#rrggbb' for opaque colours and 'rgba(...)' otherwise.
 */
export function cssToRgb(ctx: CanvasRenderingContext2D, color: string, fallback: Rgb): Rgb {
    if (!color || color.trim() === '') {
        return fallback;
    }
    ctx.fillStyle = '#000001';
    ctx.fillStyle = color;
    const v = String(ctx.fillStyle);
    if (v === '#000001') {
        return fallback;
    }
    if (v.startsWith('#') && v.length === 7) {
        return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    }
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : fallback;
}

/** Mix towards black (k < 0) or white (k > 0). */
export function shade(c: Rgb, k: number): string {
    const t = k < 0 ? 0 : 255;
    const a = Math.abs(k);
    const ch = (v: number) => Math.round(v + (t - v) * a);
    return `rgb(${ch(c[0])},${ch(c[1])},${ch(c[2])})`;
}
