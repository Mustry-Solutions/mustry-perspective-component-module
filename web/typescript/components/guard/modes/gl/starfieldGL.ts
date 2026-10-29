// Starfield in WebGL2: stars with colour temperature that stretch into warp
// streaks as the bound speed rises, over a slowly turning nebula. The bound
// colour tints both. At speed 0 the stars hang still and twinkle.
import { GuardProps } from '../../guardProps';
import { cssRgb } from '../lineStyle';
import { QualitySetting } from '../quality';
import { GLMode } from '../renderer';
import { FULLSCREEN_VS, NOISE_GLSL, program, toLinear, uniforms, Vec3 } from './gl';

const NEBULA_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uTravel;
uniform vec3 uTint;
uniform float uTinted;
out vec4 o;
${NOISE_GLSL}
void main() {
    vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float a = uTime * 0.01;
    p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
    // Flying in: the cloud scales up slowly with distance travelled.
    float z = 1.0 / (1.0 + fract(uTravel * 0.02) * 0.6);
    vec2 q = p * 2.2 * z + vec2(uTravel * 0.01, 0.0);
    float n1 = fbm(q + fbm(q * 1.7 + uTime * 0.01));
    float n2 = fbm(q * 2.3 - vec2(4.1, 1.7));
    vec3 deep = vec3(0.02, 0.025, 0.08);
    vec3 c1 = mix(vec3(0.20, 0.06, 0.35), uTint, uTinted * 0.7);
    vec3 c2 = mix(vec3(0.02, 0.22, 0.32), uTint * 0.6, uTinted * 0.5);
    vec3 c = deep * (1.0 - length(p) * 0.6);
    c += c1 * pow(smoothstep(0.35, 0.95, n1), 2.0) * 0.55;
    c += c2 * pow(smoothstep(0.4, 0.9, n2), 2.5) * 0.45;
    c += c1 * pow(smoothstep(0.78, 1.0, n1), 3.0) * 1.4; // bright knots feed the bloom
    o = vec4(c, 1.0);
}`;

const STAR_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;   // x: 0 tail .. 1 head, y: -1 .. 1 across
layout(location = 1) in vec4 iStar;     // xy direction, seed, temperature 0..1
layout(location = 2) in float iSize;
uniform vec2 uRes;
uniform float uTravel;
uniform float uStreak;
uniform float uTime;
uniform vec3 uTint;
uniform float uTinted;
out vec2 vCoord;
out vec3 vColor;
vec3 temperature(float t) {
    // Cool blue-white through white to warm amber.
    vec3 hot = vec3(0.62, 0.74, 1.0);
    vec3 mid = vec3(1.0, 0.97, 0.92);
    vec3 cool = vec3(1.0, 0.72, 0.42);
    return t < 0.5 ? mix(hot, mid, t * 2.0) : mix(mid, cool, (t - 0.5) * 2.0);
}
void main() {
    float depth = mix(0.03, 1.0, fract(iStar.z - uTravel));
    float back = min(depth + uStreak * (1.0 + 2.0 * (1.0 - depth)), 1.0);
    float aspect = uRes.x / uRes.y;
    vec2 head = iStar.xy / depth;
    vec2 tail = iStar.xy / back;
    vec2 dir = head - tail;
    float len = length(dir);
    vec2 n = len > 1e-5 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
    float width = iSize * (0.0015 + 0.0042 * (1.0 - depth));
    vec2 p = mix(tail, head, aCorner.x) + n * aCorner.y * width;
    // A little extra on the head end so a still star is a dot, not nothing.
    p += (len > 1e-5 ? dir / len : vec2(0.0)) * (aCorner.x - 0.5) * width * 2.0;
    gl_Position = vec4(p.x, p.y * aspect, 0.0, 1.0);
    float near = 1.0 - depth;
    float fadeIn = smoothstep(1.0, 0.8, depth);
    float twinkle = 0.8 + 0.2 * sin(uTime * 2.7 + iStar.z * 91.0);
    vColor = mix(temperature(iStar.w), uTint, uTinted * 0.55) * (0.25 + near * near * 3.2) * fadeIn * twinkle;
    vCoord = aCorner;
}`;

const STAR_FS = `#version 300 es
precision highp float;
in vec2 vCoord;
in vec3 vColor;
out vec4 o;
void main() {
    // A hot, round head and a tail that fades and thins behind it.
    float t = clamp(vCoord.x, 0.0, 1.0);
    // A thin trail that fades out behind, and a round, hot head.
    float trail = pow(t, 4.0) * exp(-vCoord.y * vCoord.y * 9.0);
    float hx = (1.0 - t) * 6.0;
    float head = exp(-(hx * hx + vCoord.y * vCoord.y * 4.0));
    o = vec4(vColor * (trail * 0.7 + head), 1.0);
}`;

const WHITE: [number, number, number] = [255, 255, 255];

export class StarfieldGL extends GLMode {
    private readonly nebula: WebGLProgram;
    private readonly stars: WebGLProgram;
    private readonly uNebula;
    private readonly uStars;
    private readonly vao: WebGLVertexArrayObject;
    private readonly quadBuf: WebGLBuffer;
    private readonly instBuf: WebGLBuffer;
    private readonly emptyVao: WebGLVertexArrayObject;
    private count = 0;
    private travel = 0;
    private speed = 1;
    private tint: Vec3 = [1, 1, 1];
    private tinted = 0;

    constructor(canvas: HTMLCanvasElement, quality: QualitySetting) {
        super(canvas, quality);
        const gl = this.gl;
        this.nebula = program(gl, FULLSCREEN_VS, NEBULA_FS);
        this.stars = program(gl, STAR_VS, STAR_FS);
        this.uNebula = uniforms(gl, this.nebula, ['uRes', 'uTime', 'uTravel', 'uTint', 'uTinted'] as const);
        this.uStars = uniforms(gl, this.stars, ['uRes', 'uTravel', 'uStreak', 'uTime', 'uTint', 'uTinted'] as const);
        this.emptyVao = gl.createVertexArray() as WebGLVertexArrayObject;
        this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
        gl.bindVertexArray(this.vao);
        this.quadBuf = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
        this.instBuf = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0);
        gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
        gl.vertexAttribDivisor(2, 1);
        gl.bindVertexArray(null);
    }

    configure(props: GuardProps): void {
        const s = props.modes.starfield;
        this.speed = Number.isFinite(s.speed) ? Math.min(20, Math.max(0, s.speed)) : 1;
        const tinted = s.color.trim() !== '';
        this.tinted = tinted ? 1 : 0;
        this.tint = tinted ? toLinear(cssRgb(s.color, WHITE)) : [1, 1, 1];
        // Thin streaks need about four times the 2D version's density to fill the screen.
        const n = Math.round(Math.min(3000, Math.max(50, Number.isFinite(s.density) ? s.density : 400)) * 4);
        if (n !== this.count) {
            this.seed(n);
        }
    }

    private seed(n: number): void {
        const data = new Float32Array(n * 5);
        for (let i = 0; i < n; i++) {
            // Uniform in a disc, a little denser towards the edge where streaks are long.
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * 1.3;
            data.set([Math.cos(a) * r, Math.sin(a) * r, Math.random(), Math.pow(Math.random(), 1.5), 0.6 + Math.random() * 1.2], i * 5);
        }
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        this.count = n;
    }

    protected grading(): [number, number, number] {
        return [1.1, 1.0, 0.8];
    }

    protected draw(dt: number, _now: number, w: number, h: number): void {
        const gl = this.gl;
        this.travel += this.speed * 0.09 * dt;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(this.nebula);
        gl.uniform2f(this.uNebula.uRes, w, h);
        gl.uniform1f(this.uNebula.uTime, this.time);
        gl.uniform1f(this.uNebula.uTravel, this.travel);
        gl.uniform3fv(this.uNebula.uTint, this.tint);
        gl.uniform1f(this.uNebula.uTinted, this.tinted);
        gl.bindVertexArray(this.emptyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(this.stars);
        gl.uniform2f(this.uStars.uRes, w, h);
        gl.uniform1f(this.uStars.uTravel, this.travel);
        gl.uniform1f(this.uStars.uStreak, Math.min(0.25, 0.002 + this.speed * 0.012));
        gl.uniform1f(this.uStars.uTime, this.time);
        gl.uniform3fv(this.uStars.uTint, this.tint);
        gl.uniform1f(this.uStars.uTinted, this.tinted);
        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
    }

    protected disposeScene(): void {
        const gl = this.gl;
        gl.deleteProgram(this.nebula);
        gl.deleteProgram(this.stars);
        gl.deleteVertexArray(this.vao);
        gl.deleteVertexArray(this.emptyVao);
        gl.deleteBuffer(this.quadBuf);
        gl.deleteBuffer(this.instBuf);
    }
}
