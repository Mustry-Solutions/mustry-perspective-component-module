// Aurora: northern lights over a mountain ridge and a still lake, one curtain
// per line (up to six), coloured by its state and moving with its flow. A
// line in fault turns its curtain red and makes it throb. One fullscreen
// fragment shader; the lake is the sky evaluated again, mirrored and rippled.
import { GuardProps, LineSpec } from '../../guardProps';
import { lineLook } from '../lineStyle';
import { QualitySetting } from '../quality';
import { GLMode } from '../renderer';
import { FULLSCREEN_VS, NOISE_GLSL, program, toLinear, uniforms } from './gl';

export const MAX_CURTAINS = 6;

const AURORA_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform int uCount;
uniform vec3 uColor[${MAX_CURTAINS}];
uniform float uGlow[${MAX_CURTAINS}];
uniform float uBeacon[${MAX_CURTAINS}];
uniform float uPhase[${MAX_CURTAINS}];
out vec4 o;
${NOISE_GLSL}
const float HORIZON = 0.2;

float ridge(float x) {
    // Ridged noise gives sharp summits; a second, finer layer gives crags.
    float r1 = 1.0 - abs(2.0 * fbm(vec2(x * 0.6, 3.7)) - 1.0);
    float r2 = 1.0 - abs(2.0 * vnoise(vec2(x * 4.0, 9.1)) - 1.0);
    return HORIZON + 0.01 + pow(r1, 3.0) * 0.16 + r2 * 0.02;
}

vec3 curtains(vec2 p) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < ${MAX_CURTAINS}; i++) {
        if (i >= uCount) break;
        float fi = float(i);
        float ph = uPhase[i];
        // Each line is a ribbon in its own part of the sky, folding as it moves.
        float x = p.x + 0.22 * sin(p.x * 1.3 + ph * 0.3 + fi * 2.1) + 0.07 * sin(p.x * 4.1 - ph * 0.5);
        float span = smoothstep(0.38, 0.62, fbm(vec2(p.x * 0.55 + ph * 0.025 + fi * 11.0, fi * 3.7)));
        if (span <= 0.001) continue;
        // The hem snakes across the sky: big slow folds plus noise.
        float base = 0.42 + 0.2 * fi / max(float(uCount - 1), 1.0)
                   + 0.07 * sin(x * 2.2 + ph * 0.2 + fi * 1.7)
                   + 0.14 * (fbm(vec2(x * 0.8 + ph * 0.04, fi * 7.3)) - 0.5);
        float h = p.y - base;
        if (h < -0.03) continue;
        float lower = smoothstep(-0.03, 0.006, h);
        // A bright lower hem and long, faint rays above it.
        float hem = exp(-max(h, 0.0) * 22.0);
        float tall = exp(-max(h, 0.0) * 4.5);
        float rays = pow(vnoise(vec2(x * 34.0 + ph * 0.8, fi * 3.1)), 2.2);
        rays = 0.15 + 0.85 * rays * (0.5 + 0.5 * vnoise(vec2(x * 9.0 - ph * 0.3, fi + 4.0)));
        float beacon = uBeacon[i] * (0.5 + 0.5 * sin(uTime * 3.0 + fi));
        float level = (0.3 + 0.7 * uGlow[i]) * (1.0 + beacon * 1.3) * span;
        vec3 hemCol = uColor[i];
        vec3 topCol = uColor[i] * 0.35 + vec3(0.18, 0.04, 0.32);
        acc += (hemCol * hem * 0.9 + mix(hemCol, topCol, smoothstep(0.0, 0.25, h)) * tall * rays * 0.55) * lower * level;
    }
    return acc;
}

vec3 sky(vec2 p, vec2 uv) {
    vec3 c = mix(vec3(0.02, 0.05, 0.08), vec3(0.003, 0.006, 0.02), smoothstep(HORIZON, 1.0, uv.y));
    vec2 sp = uv * uRes / 2.2;
    float star = step(0.9975, hash12(floor(sp)));
    c += vec3(0.8, 0.85, 1.0) * star * (0.5 + 0.5 * sin(uTime * 2.0 + hash12(floor(sp) + 3.0) * 40.0)) * smoothstep(HORIZON, 0.6, uv.y);
    return c + curtains(p);
}

void main() {
    vec2 uv = vUv;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
    vec3 c;
    if (uv.y >= HORIZON) {
        c = sky(p, uv);
        float r = ridge(p.x);
        if (uv.y < r) {
            // Mountains: near black, a faint rim where the aurora lights the snow.
            float rim = smoothstep(r - 0.008, r, uv.y);
            c = vec3(0.004, 0.007, 0.012) + curtains(vec2(p.x, r + 0.05)) * rim * 0.15;
        }
    } else {
        // The lake: mirror around the horizon with a gentle ripple, darker and bluer.
        float depth = HORIZON - uv.y;
        float ripple = 0.004 * sin(depth * 220.0 - uTime * 1.3) + 0.002 * sin(p.x * 40.0 + uTime);
        vec2 m = vec2(uv.x + ripple, HORIZON + depth * 1.8 + ripple);
        vec2 mp = vec2((m.x - 0.5) * aspect, m.y);
        c = sky(mp, m);
        if (m.y < ridge(mp.x)) {
            c = vec3(0.004, 0.007, 0.012);
        }
        c *= vec3(0.45, 0.55, 0.65) * (1.0 - depth * 2.2);
    }
    o = vec4(c, 1.0);
}`;

export class AuroraGL extends GLMode {
    private readonly prog: WebGLProgram;
    private readonly u;
    private readonly vao: WebGLVertexArrayObject;
    private lines: LineSpec[] = [];
    private phases = new Float32Array(MAX_CURTAINS);

    constructor(canvas: HTMLCanvasElement, quality: QualitySetting) {
        super(canvas, quality);
        this.prog = program(this.gl, FULLSCREEN_VS, AURORA_FS);
        this.u = uniforms(this.gl, this.prog, ['uRes', 'uTime', 'uCount', 'uColor', 'uGlow', 'uBeacon', 'uPhase'] as const);
        this.vao = this.gl.createVertexArray() as WebGLVertexArrayObject;
    }

    configure(props: GuardProps): void {
        this.lines = props.lines.slice(0, MAX_CURTAINS);
    }

    protected grading(): [number, number, number] {
        return [0.8, 1.0, 0.7];
    }

    protected draw(dt: number, _now: number, w: number, h: number): void {
        const gl = this.gl;
        const colors = new Float32Array(MAX_CURTAINS * 3);
        const glow = new Float32Array(MAX_CURTAINS);
        const beacon = new Float32Array(MAX_CURTAINS);
        this.lines.forEach((line, i) => {
            const look = lineLook(line);
            colors.set(toLinear(look.rgb), i * 3);
            glow[i] = look.glow;
            beacon[i] = look.beacon;
            // Even a stopped line drifts a little: an aurora that freezes looks broken.
            this.phases[i] = (this.phases[i] + (0.08 + look.speed * 0.5) * dt) % 10000;
        });
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(this.prog);
        gl.uniform2f(this.u.uRes, w, h);
        gl.uniform1f(this.u.uTime, this.time);
        gl.uniform1i(this.u.uCount, this.lines.length);
        gl.uniform3fv(this.u.uColor, colors);
        gl.uniform1fv(this.u.uGlow, glow);
        gl.uniform1fv(this.u.uBeacon, beacon);
        gl.uniform1fv(this.u.uPhase, this.phases);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }

    protected disposeScene(): void {
        this.gl.deleteProgram(this.prog);
        this.gl.deleteVertexArray(this.vao);
    }
}
