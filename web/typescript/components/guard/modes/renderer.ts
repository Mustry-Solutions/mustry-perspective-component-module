// The contract between IdleGuard's canvas and an idle mode's renderer, and the
// base class of the WebGL2 modes (scene target, post-processing, quality).
import { GuardProps } from '../guardProps';
import { createGL } from './gl/gl';
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
const GL_MAX_WIDTH = 2560;

export function fitGLCanvas(canvas: HTMLCanvasElement): void {
    const dpr = Math.min(window.devicePixelRatio || 1, GL_MAX_DPR);
    let w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    let h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w > GL_MAX_WIDTH) {
        h = Math.round(h * GL_MAX_WIDTH / w);
        w = GL_MAX_WIDTH;
    }
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

    /** Throws when WebGL2 or a shader is unavailable; the caller falls back to a 2D renderer. */
    constructor(protected readonly canvas: HTMLCanvasElement, quality: QualitySetting) {
        const gl = createGL(canvas);
        if (!gl) {
            throw new Error('WebGL2 is not available');
        }
        this.gl = gl;
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
        fitGLCanvas(this.canvas);
        this.post.resize(this.canvas.width, this.canvas.height, this.governor.current);
        this.post.begin();
        this.draw(dt, now, this.post.sceneWidth, this.post.sceneHeight);
        const [bloom, exposure, threshold] = this.grading();
        this.post.end(this.time, bloom, exposure, threshold);
    }

    dispose(): void {
        this.canvas.removeEventListener('webglcontextlost', this.onLost);
        if (!this.contextLost) {
            this.disposeScene();
            this.post.dispose();
        }
        // Hand the GPU memory back now rather than at the next GC.
        const ext = this.gl.getExtension('WEBGL_lose_context');
        if (ext) {
            ext.loseContext();
        }
    }

    protected abstract disposeScene(): void;
}
