// The contract between IdleGuard's canvas and an idle mode's renderer, and the
// base class of the WebGL2 modes (scene target, post-processing, quality).
import { GuardProps } from '../guardProps';
import { canvasSize } from './frameLoop';
import { createGL, releaseGL } from './gl/gl';
import { PostFx } from './gl/post';
import { Governor, QualitySetting } from './quality';

export interface ModeRenderer {
    readonly kind: 'webgl2' | '2d';
    configure(props: GuardProps): void;
    /** Draw one frame. dtMs is the time since the previous frame, now is Date.now(). */
    frame(dtMs: number, now: number): void;
    dispose(): void;
}

/** Device pixel ratio and size caps for GL canvases: a 4K wall at DPR 2 is 33 Mpx of fill per pass. */
const GL_MAX_DPR = 1.5;
/** Longest side of a GL canvas (landscape or portrait), before the GPU's own limit. */
export const GL_MAX_SIDE = 2560;

/** Fit a GL canvas to its CSS size; the longest side is capped at GL_MAX_SIDE and at the GPU's limit (`maxSide`). */
export function fitGLCanvas(canvas: HTMLCanvasElement, maxSide = GL_MAX_SIDE): void {
    const dpr = Math.min(window.devicePixelRatio || 1, GL_MAX_DPR);
    const [w, h] = canvasSize(canvas.clientWidth, canvas.clientHeight, dpr, Math.min(GL_MAX_SIDE, maxSide));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
}

export abstract class GLMode implements ModeRenderer {
    readonly kind = 'webgl2' as const;
    protected readonly gl: WebGL2RenderingContext;
    protected readonly post: PostFx;
    protected readonly governor: Governor;
    /** Seconds since the mode started; small numbers keep shader maths precise. */
    protected time = 0;
    private lost = false;
    /** The GPU's limit on a render target's side (4096 on a Raspberry Pi 4): the canvas never exceeds it. */
    private readonly maxSide: number;

    /** Throws when WebGL2 or a shader is unavailable; the caller falls back to a 2D renderer. */
    constructor(protected readonly canvas: HTMLCanvasElement, quality: QualitySetting) {
        const gl = createGL(canvas);
        if (!gl) {
            throw new Error('WebGL2 is not available');
        }
        this.gl = gl;
        const limit = (name: number): number => {
            const v = Number(gl.getParameter(name));
            return Number.isFinite(v) && v > 0 ? v : GL_MAX_SIDE;
        };
        this.maxSide = Math.min(limit(gl.MAX_RENDERBUFFER_SIZE), limit(gl.MAX_TEXTURE_SIZE));
        this.post = new PostFx(gl);
        this.governor = new Governor(quality);
        canvas.addEventListener('webglcontextlost', this.onLost);
    }

    private onLost = (e: Event): void => {
        e.preventDefault();
        this.lost = true;
    };

    get contextLost(): boolean {
        return this.lost || this.gl.isContextLost();
    }

    abstract configure(props: GuardProps): void;

    /** Draw the scene into the bound HDR target (size w x h). */
    protected abstract draw(dtSec: number, now: number, w: number, h: number): void;

    /** Bloom strength, exposure and threshold for this mode's look. */
    protected grading(): [number, number, number] {
        return [0.9, 1.0, 0.9];
    }

    frame(dtMs: number, now: number): void {
        if (this.contextLost) {
            return;
        }
        this.governor.sample(dtMs);
        const dt = Math.min(dtMs, 250) / 1000;
        this.time += dt;
        fitGLCanvas(this.canvas, this.maxSide);
        this.post.resize(this.canvas.width, this.canvas.height, this.governor.current);
        this.post.begin();
        this.draw(dt, now, this.post.sceneWidth, this.post.sceneHeight);
        const [bloom, exposure, threshold] = this.grading();
        this.post.end(this.time, bloom, exposure, threshold);
    }

    dispose(): void {
        this.canvas.removeEventListener('webglcontextlost', this.onLost);
        try {
            if (!this.contextLost) {
                this.disposeScene();
                this.post.dispose();
            }
        } finally {
            // Hand the GPU memory back now rather than at the next GC, even when a failed scene would not dispose.
            releaseGL(this.canvas);
        }
    }

    protected abstract disposeScene(): void;
}
