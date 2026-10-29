// Post-processing shared by the GL idle modes: render the scene into an HDR
// target (with MSAA when the quality level allows), then bloom, tone-map,
// vignette and dither into the canvas. Dithering matters on big TVs: dark
// gradients band badly in 8 bits.
import { FULLSCREEN_VS, program, uniforms } from './gl';

export interface PostSettings {
    /** Internal resolution as a fraction of the canvas (the quality governor lowers it). */
    scale: number;
    msaa: boolean;
    bloom: boolean;
}

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform float uThreshold;
out vec4 o;
void main() {
    vec3 c = texture(uScene, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    o = vec4(c * smoothstep(uThreshold, uThreshold + 0.6, l), 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;
out vec4 o;
void main() {
    // 9-tap Gaussian folded into 5 linear samples.
    vec3 c = texture(uSrc, vUv).rgb * 0.2270270270;
    c += texture(uSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture(uSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture(uSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
    c += texture(uSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
    o = vec4(c, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uTime;
out vec4 o;
vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
    vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;
    c = aces(c * uExposure);
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.9;
    c = pow(c, vec3(1.0 / 2.2));
    // Triangular dither, one 8-bit step, animated so it never forms a pattern.
    float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453)
            - fract(sin(dot(gl_FragCoord.xy - uTime, vec2(39.3468, 11.135))) * 24634.6345);
    o = vec4(c + n / 255.0, 1.0);
}`;

interface Target {
    fb: WebGLFramebuffer;
    tex: WebGLTexture;
    w: number;
    h: number;
}

export class PostFx {
    private readonly bright: WebGLProgram;
    private readonly blur: WebGLProgram;
    private readonly composite: WebGLProgram;
    private readonly uBright;
    private readonly uBlur;
    private readonly uComposite;
    private readonly vao: WebGLVertexArrayObject;
    private readonly hdr: boolean;
    private settings: PostSettings = { scale: 1, msaa: true, bloom: true };
    private width = 0;
    private height = 0;
    // Scene: rendered into msaaFb (renderbuffers) and resolved into scene, or straight into scene.
    private msaaFb: WebGLFramebuffer | null = null;
    private msaaColor: WebGLRenderbuffer | null = null;
    private depth: WebGLRenderbuffer | null = null;
    private scene: Target | null = null;
    private bloomA: Target | null = null;
    private bloomB: Target | null = null;
    private black: WebGLTexture;

    constructor(private readonly gl: WebGL2RenderingContext) {
        this.hdr = !!gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');
        this.bright = program(gl, FULLSCREEN_VS, BRIGHT_FS);
        this.blur = program(gl, FULLSCREEN_VS, BLUR_FS);
        this.composite = program(gl, FULLSCREEN_VS, COMPOSITE_FS);
        this.uBright = uniforms(gl, this.bright, ['uScene', 'uThreshold'] as const);
        this.uBlur = uniforms(gl, this.blur, ['uSrc', 'uDir'] as const);
        this.uComposite = uniforms(gl, this.composite, ['uScene', 'uBloom', 'uBloomStrength', 'uExposure', 'uTime'] as const);
        this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
        this.black = gl.createTexture() as WebGLTexture;
        gl.bindTexture(gl.TEXTURE_2D, this.black);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    }

    /** The scene size in pixels (after the quality scale). */
    get sceneWidth(): number {
        return this.scene ? this.scene.w : 1;
    }

    get sceneHeight(): number {
        return this.scene ? this.scene.h : 1;
    }

    private internalFormat(): number {
        return this.hdr ? this.gl.RGBA16F : this.gl.RGBA8;
    }

    private makeTarget(w: number, h: number): Target {
        const gl = this.gl;
        const tex = gl.createTexture() as WebGLTexture;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, this.internalFormat(), w, h);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer() as WebGLFramebuffer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { fb, tex, w, h };
    }

    private freeTarget(t: Target | null): void {
        if (t) {
            this.gl.deleteFramebuffer(t.fb);
            this.gl.deleteTexture(t.tex);
        }
    }

    private release(): void {
        const gl = this.gl;
        this.freeTarget(this.scene);
        this.freeTarget(this.bloomA);
        this.freeTarget(this.bloomB);
        this.scene = this.bloomA = this.bloomB = null;
        if (this.msaaFb) gl.deleteFramebuffer(this.msaaFb);
        if (this.msaaColor) gl.deleteRenderbuffer(this.msaaColor);
        if (this.depth) gl.deleteRenderbuffer(this.depth);
        this.msaaFb = this.msaaColor = this.depth = null;
    }

    /** (Re)build the targets for a canvas size and quality. Cheap when nothing changed. */
    resize(width: number, height: number, settings: PostSettings): void {
        const s = settings;
        if (width === this.width && height === this.height && this.scene
            && s.scale === this.settings.scale && s.msaa === this.settings.msaa && s.bloom === this.settings.bloom) {
            return;
        }
        const gl = this.gl;
        this.release();
        this.width = width;
        this.height = height;
        this.settings = { ...s };
        const w = Math.max(1, Math.round(width * s.scale));
        const h = Math.max(1, Math.round(height * s.scale));
        this.scene = this.makeTarget(w, h);
        const samples = s.msaa ? Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number) : 0;
        this.depth = gl.createRenderbuffer() as WebGLRenderbuffer;
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
        if (samples > 0) {
            this.msaaColor = gl.createRenderbuffer() as WebGLRenderbuffer;
            gl.bindRenderbuffer(gl.RENDERBUFFER, this.msaaColor);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, this.internalFormat(), w, h);
            gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
            this.msaaFb = gl.createFramebuffer() as WebGLFramebuffer;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFb);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msaaColor);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
        } else {
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
        }
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('scene framebuffer incomplete');
        }
        if (s.bloom) {
            const bw = Math.max(1, Math.round(w / 4));
            const bh = Math.max(1, Math.round(h / 4));
            this.bloomA = this.makeTarget(bw, bh);
            this.bloomB = this.makeTarget(bw, bh);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /** Bind the scene target; draw the scene after this. */
    begin(): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFb || (this.scene as Target).fb);
        gl.viewport(0, 0, this.sceneWidth, this.sceneHeight);
    }

    private pass(prog: WebGLProgram, target: Target | null): void {
        const gl = this.gl;
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
        gl.viewport(0, 0, target ? target.w : this.width, target ? target.h : this.height);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** Resolve, bloom and composite into the canvas. */
    end(time: number, bloomStrength = 0.9, exposure = 1.0, threshold = 0.9): void {
        const gl = this.gl;
        const scene = this.scene as Target;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        if (this.msaaFb) {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFb);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scene.fb);
            gl.blitFramebuffer(0, 0, scene.w, scene.h, 0, 0, scene.w, scene.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        }
        gl.activeTexture(gl.TEXTURE0);
        let bloomTex = this.black;
        if (this.bloomA && this.bloomB) {
            const a = this.bloomA;
            const b = this.bloomB;
            gl.useProgram(this.bright);
            gl.bindTexture(gl.TEXTURE_2D, scene.tex);
            gl.uniform1i(this.uBright.uScene, 0);
            gl.uniform1f(this.uBright.uThreshold, threshold);
            this.pass(this.bright, a);
            for (const radius of [1, 2.5]) {
                gl.useProgram(this.blur);
                gl.uniform1i(this.uBlur.uSrc, 0);
                gl.bindTexture(gl.TEXTURE_2D, a.tex);
                gl.uniform2f(this.uBlur.uDir, radius / a.w, 0);
                this.pass(this.blur, b);
                gl.bindTexture(gl.TEXTURE_2D, b.tex);
                gl.uniform2f(this.uBlur.uDir, 0, radius / a.h);
                this.pass(this.blur, a);
            }
            bloomTex = a.tex;
        }
        gl.useProgram(this.composite);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene.tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, bloomTex);
        gl.uniform1i(this.uComposite.uScene, 0);
        gl.uniform1i(this.uComposite.uBloom, 1);
        gl.uniform1f(this.uComposite.uBloomStrength, this.bloomA ? bloomStrength : 0);
        gl.uniform1f(this.uComposite.uExposure, exposure);
        gl.uniform1f(this.uComposite.uTime, time % 1000);
        this.pass(this.composite, null);
        gl.activeTexture(gl.TEXTURE0);
    }

    dispose(): void {
        const gl = this.gl;
        this.release();
        gl.deleteProgram(this.bright);
        gl.deleteProgram(this.blur);
        gl.deleteProgram(this.composite);
        gl.deleteVertexArray(this.vao);
        gl.deleteTexture(this.black);
    }
}
