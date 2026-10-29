// Halo: one neon ring per line around a clock. Each ring carries two comets
// that orbit at the line's flow and leave a fading tail; the ring's colour is
// the line's state, and a faulted ring throbs. Dial ticks and a soft core give
// it depth; bloom does the neon. One fullscreen fragment shader.
import { drift } from '../../idleLogic';
import { GuardProps, LineSpec, MAX_LINES } from '../../guardProps';
import { HALO_DRIFT, haloRadii } from '../haloLayout';
import { lineLook } from '../lineStyle';
import { QualitySetting } from '../quality';
import { GLMode } from '../renderer';
import { FULLSCREEN_VS, program, toLinear, uniforms } from './gl';

const HALO_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform vec2 uCenter;   // pixels
uniform float uTime;
uniform int uCount;
uniform float uRadius[${MAX_LINES}];   // pixels
uniform vec3 uColor[${MAX_LINES}];
uniform float uGlow[${MAX_LINES}];
uniform float uBeacon[${MAX_LINES}];
uniform float uPhase[${MAX_LINES}];
uniform float uSpeed[${MAX_LINES}];
uniform float uDir[${MAX_LINES}];   // +1 counter-clockwise, -1 clockwise
out vec4 o;
const float TAU = 6.28318530718;

void main() {
    vec2 px = vUv * uRes;
    vec2 d = px - uCenter;
    float r = length(d);
    float a = atan(d.y, d.x);
    float unit = min(uRes.x, uRes.y);
    vec3 c = vec3(0.006, 0.008, 0.016) + vec3(0.02, 0.035, 0.07) * exp(-r / (unit * 0.35));
    // Dial: fine ticks just outside the outermost ring.
    if (uCount > 0) {
        float outer = uRadius[uCount - 1] + unit * 0.035;
        float tick = smoothstep(0.92, 1.0, cos(a * 60.0)) * smoothstep(unit * 0.012, 0.0, abs(r - outer));
        float major = smoothstep(0.995, 1.0, cos(a * 12.0)) * smoothstep(unit * 0.02, 0.0, abs(r - outer));
        c += vec3(0.25, 0.32, 0.45) * (tick * 0.35 + major * 0.8);
    }
    for (int i = 0; i < ${MAX_LINES}; i++) {
        if (i >= uCount) break;
        float ring = uRadius[i];
        float dist = abs(r - ring);
        float w = unit * 0.0035;
        vec3 col = uColor[i];
        float beacon = uBeacon[i] * (0.5 + 0.5 * sin(uTime * 4.0 + float(i)));
        // The track: a thin, dim line.
        c += col * (0.07 + beacon * 0.5) * exp(-dist * dist / (w * w));
        // Two comets per ring, half a turn apart, tails behind them.
        float head = uPhase[i];
        float behind = mod(uDir[i] * (head - a), TAU * 0.5);
        float tailLen = 0.6 + 1.6 * clamp(uSpeed[i], 0.0, 1.5) / 1.5;
        float tail = pow(clamp(1.0 - behind / tailLen, 0.0, 1.0), 2.2);
        float core = exp(-dist * dist / (w * w * 1.5));
        float halo = exp(-dist / (w * 5.0)) * 0.25;
        float level = (0.15 + uGlow[i]) * (1.0 + beacon);
        c += col * (core * 3.2 + halo) * tail * level;
        // The comet head: a hot spot.
        float hd = min(behind, TAU * 0.5 - behind) * ring;
        c += (col * 4.0 + 1.0) * exp(-(hd * hd + dist * dist) / (w * w * 6.0)) * level;
    }
    o = vec4(c, 1.0);
}`;

export class HaloGL extends GLMode {
    private readonly prog: WebGLProgram;
    private readonly u;
    private readonly vao: WebGLVertexArrayObject;
    private lines: LineSpec[] = [];
    private drifting = true;
    private phases = new Float32Array(MAX_LINES);

    constructor(canvas: HTMLCanvasElement, quality: QualitySetting) {
        super(canvas, quality);
        this.prog = program(this.gl, FULLSCREEN_VS, HALO_FS);
        this.u = uniforms(this.gl, this.prog, ['uRes', 'uCenter', 'uTime', 'uCount', 'uRadius', 'uColor', 'uGlow', 'uBeacon', 'uPhase', 'uSpeed', 'uDir'] as const);
        this.vao = this.gl.createVertexArray() as WebGLVertexArrayObject;
        // Start each ring at a different angle so the comets do not line up.
        for (let i = 0; i < MAX_LINES; i++) {
            this.phases[i] = i * 2.399;
        }
    }

    configure(props: GuardProps): void {
        this.lines = props.lines.slice(0, MAX_LINES);
        this.drifting = props.burnIn.drift;
    }

    protected grading(): [number, number, number] {
        return [1.25, 1.0, 0.7];
    }

    protected draw(dt: number, now: number, w: number, h: number): void {
        const gl = this.gl;
        const n = this.lines.length;
        const unit = Math.min(w, h);
        const radii = new Float32Array(MAX_LINES);
        haloRadii(n).forEach((r, i) => {
            radii[i] = r * unit;
        });
        const colors = new Float32Array(MAX_LINES * 3);
        const glow = new Float32Array(MAX_LINES);
        const beacon = new Float32Array(MAX_LINES);
        const speed = new Float32Array(MAX_LINES);
        const dirs = new Float32Array(MAX_LINES);
        this.lines.forEach((line, i) => {
            const look = lineLook(line);
            colors.set(toLinear(look.rgb), i * 3);
            glow[i] = look.glow;
            beacon[i] = look.beacon;
            speed[i] = look.speed;
            // Inner rings turn faster, like gears; direction alternates.
            const dir = i % 2 === 0 ? 1 : -1;
            dirs[i] = dir;
            this.phases[i] = (this.phases[i] + dir * look.speed * 0.9 * dt * (1.4 - i * 0.05)) % (Math.PI * 2);
        });
        const dr = this.drifting ? drift(now) : { x: 0, y: 0 };
        // GL's y runs up; the page's runs down.
        const cx = w / 2 + dr.x * HALO_DRIFT.x * w;
        const cy = h / 2 - dr.y * HALO_DRIFT.y * h;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(this.prog);
        gl.uniform2f(this.u.uRes, w, h);
        gl.uniform2f(this.u.uCenter, cx, cy);
        gl.uniform1f(this.u.uTime, this.time);
        gl.uniform1i(this.u.uCount, n);
        gl.uniform1fv(this.u.uRadius, radii);
        gl.uniform3fv(this.u.uColor, colors);
        gl.uniform1fv(this.u.uGlow, glow);
        gl.uniform1fv(this.u.uBeacon, beacon);
        gl.uniform1fv(this.u.uPhase, this.phases);
        gl.uniform1fv(this.u.uSpeed, speed);
        gl.uniform1fv(this.u.uDir, dirs);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }

    protected disposeScene(): void {
        this.gl.deleteProgram(this.prog);
        this.gl.deleteVertexArray(this.vao);
    }
}
