// Flow: some thirty thousand particles drifting through a curl-noise field,
// leaving glowing trails that fade. Particles live on the GPU: a transform
// feedback pass moves them, a points pass paints them into a trail buffer that
// is faded each frame (ping-pong), and the trail is copied into the scene.
import { GuardProps } from '../../guardProps';
import { QualitySetting } from '../quality';
import { GLMode } from '../renderer';
import { FULLSCREEN_VS, program, uniforms } from './gl';

// Gradient noise, not value noise: value noise has zero slope along its grid
// lines, which the curl turns into straight seams the particles line up on.
const GRADIENT_NOISE = `
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec2 grad2(vec2 i) {
    float a = hash12(i) * 6.28318;
    return vec2(cos(a), sin(a));
}
float gnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(grad2(i), f);
    float b = dot(grad2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(grad2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(grad2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`;

const UPDATE_VS = `#version 300 es
layout(location = 0) in vec4 aState;   // x, y in [0, 1], age, heading
uniform float uTime;
uniform float uDt;
uniform float uAspect;
out vec4 oState;
${GRADIENT_NOISE}
float psi(vec2 q) {
    // Two octaves, the second rotated so the two lattices never line up.
    vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * q;
    return gnoise(q * 1.5 + vec2(uTime * 0.02, 0.0)) + 0.45 * gnoise(r * 3.7 - vec2(0.0, uTime * 0.035));
}
void main() {
    vec2 pos = aState.xy;
    float age = aState.z + uDt;
    vec2 q = vec2(pos.x * uAspect, pos.y);
    const float e = 0.003;
    // Curl of a scalar potential: divergence-free, so particles swirl instead of bunching up.
    vec2 v = vec2(psi(q + vec2(0.0, e)) - psi(q - vec2(0.0, e)),
                  -(psi(q + vec2(e, 0.0)) - psi(q - vec2(e, 0.0)))) / (2.0 * e);
    vec2 vel = v * 0.06;
    pos += vec2(vel.x / uAspect, vel.y) * uDt;
    float id = float(gl_VertexID);
    float life = 5.0 + 9.0 * hash12(vec2(id, 7.0));
    if (age > life || pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0) {
        pos = vec2(hash12(vec2(id, uTime)), hash12(vec2(uTime, id + 3.7)));
        age = 0.0;
    }
    oState = vec4(pos, age, atan(vel.y, vel.x));
}`;

const NULL_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`;

const DRAW_VS = `#version 300 es
layout(location = 0) in vec4 aState;
uniform float uTime;
uniform float uPointSize;
uniform float uIntensity;
out vec3 vColor;
vec3 palette(float t) {
    return vec3(0.5) + vec3(0.5) * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}
void main() {
    gl_Position = vec4(aState.xy * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = uPointSize;
    float fadeIn = smoothstep(0.0, 0.6, aState.z);
    // Colour by heading, the whole palette turning slowly.
    vColor = palette(aState.w / 6.28318 + uTime * 0.006) * uIntensity * fadeIn;
}`;

const DRAW_FS = `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 o;
void main() { o = vec4(vColor, 1.0); }`;

const FADE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform float uKeep;
out vec4 o;
void main() {
    // Multiply, then subtract a little: in 8-bit buffers a pure multiply never reaches black.
    o = vec4(max(texture(uPrev, vUv).rgb * uKeep - 0.0025, 0.0), 1.0);
}`;

const COPY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTrail;
out vec4 o;
void main() {
    vec2 q = vUv - 0.5;
    vec3 bg = vec3(0.008, 0.01, 0.02) * (1.0 - dot(q, q));
    o = vec4(bg + texture(uTrail, vUv).rgb, 1.0);
}`;

interface Trail {
    tex: WebGLTexture;
    fb: WebGLFramebuffer;
}

export class FlowGL extends GLMode {
    private readonly count: number;
    private readonly update: WebGLProgram;
    private readonly drawProg: WebGLProgram;
    private readonly fade: WebGLProgram;
    private readonly copy: WebGLProgram;
    private readonly uUpdate;
    private readonly uDraw;
    private readonly uFade;
    private readonly uCopy;
    private readonly buffers: WebGLBuffer[];
    private readonly vaos: WebGLVertexArrayObject[];
    private readonly tf: WebGLTransformFeedback;
    private readonly quad: WebGLVertexArrayObject;
    private readonly hdr: boolean;
    private trails: Trail[] = [];
    private trailW = 0;
    private trailH = 0;
    private cur = 0;

    constructor(canvas: HTMLCanvasElement, quality: QualitySetting) {
        super(canvas, quality);
        const gl = this.gl;
        this.count = quality === 'low' ? 12288 : 32768;
        this.hdr = !!gl.getExtension('EXT_color_buffer_float');
        this.update = program(gl, UPDATE_VS, NULL_FS, ['oState']);
        this.drawProg = program(gl, DRAW_VS, DRAW_FS);
        this.fade = program(gl, FULLSCREEN_VS, FADE_FS);
        this.copy = program(gl, FULLSCREEN_VS, COPY_FS);
        this.uUpdate = uniforms(gl, this.update, ['uTime', 'uDt', 'uAspect'] as const);
        this.uDraw = uniforms(gl, this.drawProg, ['uTime', 'uPointSize', 'uIntensity'] as const);
        this.uFade = uniforms(gl, this.fade, ['uPrev', 'uKeep'] as const);
        this.uCopy = uniforms(gl, this.copy, ['uTrail'] as const);
        const init = new Float32Array(this.count * 4);
        for (let i = 0; i < this.count; i++) {
            init.set([Math.random(), Math.random(), Math.random() * 10, 0], i * 4);
        }
        this.buffers = [0, 1].map(() => {
            const b = gl.createBuffer() as WebGLBuffer;
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
            return b;
        });
        this.vaos = this.buffers.map((b) => {
            const vao = gl.createVertexArray() as WebGLVertexArrayObject;
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
            return vao;
        });
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.tf = gl.createTransformFeedback() as WebGLTransformFeedback;
        this.quad = gl.createVertexArray() as WebGLVertexArrayObject;
    }

    configure(_props: GuardProps): void {
        // Not linked to the plant: nothing to configure.
    }

    protected grading(): [number, number, number] {
        return [0.9, 1.0, 0.75];
    }

    private ensureTrails(w: number, h: number): void {
        if (w === this.trailW && h === this.trailH && this.trails.length === 2) {
            return;
        }
        const gl = this.gl;
        this.freeTrails();
        this.trailW = w;
        this.trailH = h;
        this.trails = [0, 1].map(() => {
            const tex = gl.createTexture() as WebGLTexture;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texStorage2D(gl.TEXTURE_2D, 1, this.hdr ? gl.RGBA16F : gl.RGBA8, w, h);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            const fb = gl.createFramebuffer() as WebGLFramebuffer;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return { tex, fb };
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private freeTrails(): void {
        for (const t of this.trails) {
            this.gl.deleteTexture(t.tex);
            this.gl.deleteFramebuffer(t.fb);
        }
        this.trails = [];
    }

    protected draw(dt: number, _now: number, w: number, h: number): void {
        const gl = this.gl;
        this.ensureTrails(w, h);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);

        // 1. Move the particles: read buffer cur, write buffer 1 - cur.
        const src = this.cur;
        const dst = 1 - this.cur;
        gl.useProgram(this.update);
        gl.uniform1f(this.uUpdate.uTime, this.time);
        gl.uniform1f(this.uUpdate.uDt, Math.min(dt, 0.1));
        gl.uniform1f(this.uUpdate.uAspect, w / h);
        gl.bindVertexArray(this.vaos[src]);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.buffers[dst]);
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, this.count);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        this.cur = dst;

        // 2. Fade the previous trail into the other buffer, then paint the particles on top.
        const prev = this.trails[src];
        const next = this.trails[dst];
        gl.bindFramebuffer(gl.FRAMEBUFFER, next.fb);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.fade);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, prev.tex);
        gl.uniform1i(this.uFade.uPrev, 0);
        // Same trail length whatever the frame rate.
        gl.uniform1f(this.uFade.uKeep, Math.pow(0.968, Math.min(dt, 0.1) * 30));
        gl.bindVertexArray(this.quad);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(this.drawProg);
        gl.uniform1f(this.uDraw.uTime, this.time);
        gl.uniform1f(this.uDraw.uPointSize, Math.max(1, h / 720));
        gl.uniform1f(this.uDraw.uIntensity, 0.11 * (32768 / this.count));
        gl.bindVertexArray(this.vaos[this.cur]);
        gl.drawArrays(gl.POINTS, 0, this.count);
        gl.disable(gl.BLEND);

        // 3. Into the scene target for bloom and tone mapping.
        this.post.begin();
        gl.useProgram(this.copy);
        gl.bindTexture(gl.TEXTURE_2D, next.tex);
        gl.uniform1i(this.uCopy.uTrail, 0);
        gl.bindVertexArray(this.quad);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }

    protected disposeScene(): void {
        const gl = this.gl;
        this.freeTrails();
        this.buffers.forEach((b) => gl.deleteBuffer(b));
        this.vaos.forEach((v) => gl.deleteVertexArray(v));
        gl.deleteVertexArray(this.quad);
        gl.deleteTransformFeedback(this.tf);
        for (const p of [this.update, this.drawProg, this.fade, this.copy]) {
            gl.deleteProgram(p);
        }
    }
}
