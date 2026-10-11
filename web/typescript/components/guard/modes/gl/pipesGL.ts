// Pipes in WebGL2: the PipesSim scene as lit, glossy tubes with ball joints and
// flanges, a slowly orbiting camera, a fading floor grid, and bright pulses
// that travel along each pipe at its bound flow. Fault pipes throb.
import { GuardProps, LineSpec, MAX_LINES } from '../../guardProps';
import { lineLook } from '../lineStyle';
import { CELLS_PER_SEC, PipesSim, Segment, Vec3 as Cell } from '../pipesSim';
import { QualitySetting } from '../quality';
import { GLMode } from '../renderer';
import { FULLSCREEN_VS, lookAt, multiply, perspective, program, toLinear, uniforms, Vec3 } from './gl';

export const GRID: Cell = [16, 10, 10];
const RADIUS = 0.24;
/** Flow pulses travel this many cells per second at flow 1. */
const PULSE_SPEED = 2.5;
/** Seconds of fade to black before the scene starts over. */
const FADE_SEC = 1.6;
/** Start over at this share of the grid filled: past it the scene turns into a tangle. */
const FILL_RESET = 0.3;
/** Growth runs slower than the 2D version: a calmer scene, and the pulses read better on long runs. */
const GROWTH = 0.6;
const TUBE_FLOATS = 11;
const BALL_FLOATS = 7;
const MAX_TUBES = GRID[0] * GRID[1] * GRID[2];

const LIGHTING = `
uniform vec3 uColor[${MAX_LINES}];
uniform float uGlow[${MAX_LINES}];
uniform float uBeacon[${MAX_LINES}];
uniform float uPhase[${MAX_LINES}];
uniform vec3 uEye;
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform float uTime;
const vec3 KEY = vec3(-0.48, 0.81, 0.33);
vec3 envColor(vec3 r) {
    float up = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 c = mix(vec3(0.012, 0.016, 0.026), vec3(0.11, 0.15, 0.23), up * up);
    c += vec3(1.0, 0.93, 0.82) * pow(max(dot(r, KEY), 0.0), 48.0) * 4.0;
    c += vec3(0.35, 0.55, 1.0) * pow(max(dot(r, normalize(vec3(0.8, 0.15, -0.55))), 0.0), 10.0) * 0.7;
    return c;
}
vec3 shade(vec3 base, vec3 n, vec3 pos) {
    vec3 v = normalize(uEye - pos);
    float wrap = max(dot(n, KEY) * 0.7 + 0.3, 0.0);
    float hemi = 0.5 + 0.5 * n.y;
    vec3 h = normalize(KEY + v);
    float spec = pow(max(dot(n, h), 0.0), 90.0) * 1.8;
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 refl = envColor(reflect(-v, n)) * mix(0.2, 1.0, fres);
    return base * (wrap * 0.85 + hemi * 0.12) + spec + refl * mix(vec3(1.0), base * 1.4 + 0.25, 0.5);
}
vec3 fogged(vec3 c, vec3 pos) {
    return mix(c, uFogColor, smoothstep(uFog.x, uFog.y, distance(uEye, pos)));
}
float beacon(int i) {
    return uBeacon[i] * (0.5 + 0.5 * sin(uTime * 4.5));
}`;

const TUBE_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 iFrom;
layout(location = 3) in vec3 iTo;
layout(location = 4) in vec4 iData;   // pipe, dist at from, birth, grow seconds
layout(location = 5) in float iRadius; // 1 = tube, > 1 = flange
uniform mat4 uViewProj;
uniform float uTime;
out vec3 vWorld;
out vec3 vNormal;
out float vS;
out float vFlange;
flat out int vPipe;
void main() {
    vec3 d = iTo - iFrom;
    float len = length(d);
    vec3 z = d / len;
    float grow = clamp((uTime - iData.z) / max(iData.w, 0.001), 0.0, 1.0);
    vec3 up = abs(z.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 x = normalize(cross(up, z));
    vec3 y = cross(z, x);
    float r = ${RADIUS} * iRadius;
    vec3 world = iFrom + x * aPos.x * r + y * aPos.y * r + z * aPos.z * len * grow;
    vWorld = world;
    vNormal = x * aNormal.x + y * aNormal.y + z * aNormal.z;
    vS = iData.y + aPos.z * len * grow;
    vFlange = iRadius > 1.05 ? 1.0 : 0.0;
    vPipe = int(iData.x);
    gl_Position = uViewProj * vec4(world, 1.0);
}`;

const TUBE_FS = `#version 300 es
precision highp float;
${LIGHTING}
in vec3 vWorld;
in vec3 vNormal;
in float vS;
in float vFlange;
flat in int vPipe;
out vec4 o;
void main() {
    vec3 base = uColor[vPipe];
    vec3 c = shade(base * mix(1.0, 0.7, vFlange), normalize(vNormal), vWorld);
    float ph = fract((vS - uPhase[vPipe]) / 3.0);
    float pulse = smoothstep(0.0, 0.04, ph) * (1.0 - smoothstep(0.04, 0.3, ph)) * (1.0 - vFlange);
    c += (base * 4.0 + 0.35) * pulse * uGlow[vPipe];
    c += base * beacon(vPipe) * 1.8;
    o = vec4(fogged(c, vWorld), 1.0);
}`;

const BALL_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 iCenter; // xyz, pipe
layout(location = 3) in vec3 iData;   // birth, radius, emissive
uniform mat4 uViewProj;
uniform float uTime;
out vec3 vWorld;
out vec3 vNormal;
out float vEmissive;
flat out int vPipe;
void main() {
    float pop = clamp((uTime - iData.x) / 0.2, 0.0, 1.0);
    pop = pop * pop * (3.0 - 2.0 * pop);
    vec3 world = iCenter.xyz + aPos * ${RADIUS} * iData.y * pop;
    vWorld = world;
    vNormal = aNormal;
    vEmissive = iData.z;
    vPipe = int(iCenter.w);
    gl_Position = uViewProj * vec4(world, 1.0);
}`;

const BALL_FS = `#version 300 es
precision highp float;
${LIGHTING}
in vec3 vWorld;
in vec3 vNormal;
in float vEmissive;
flat in int vPipe;
out vec4 o;
void main() {
    vec3 base = uColor[vPipe];
    vec3 c = shade(base, normalize(vNormal), vWorld);
    c += (base * 3.0 + 0.3) * vEmissive * (0.75 + 0.25 * sin(uTime * 6.0)) * max(uGlow[vPipe], 0.25);
    c += base * beacon(vPipe) * 1.8;
    o = vec4(fogged(c, vWorld), 1.0);
}`;

const FLOOR_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
uniform mat4 uViewProj;
uniform float uFloorY;
out vec3 vWorld;
void main() {
    vWorld = vec3(aPos.x * 60.0, uFloorY, aPos.y * 60.0);
    gl_Position = uViewProj * vec4(vWorld, 1.0);
}`;

const FLOOR_FS = `#version 300 es
precision highp float;
uniform vec3 uEye;
uniform vec3 uFogColor;
uniform vec2 uFog;
in vec3 vWorld;
out vec4 o;
void main() {
    vec2 g = abs(fract(vWorld.xz - 0.5) - 0.5) / fwidth(vWorld.xz);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float d = length(vWorld.xz);
    vec3 c = uFogColor * 0.45;
    c += vec3(0.1, 0.24, 0.5) * line * 0.22 * exp(-d * 0.06);
    c += vec3(0.04, 0.08, 0.15) * exp(-d * 0.12) * 0.5;
    o = vec4(mix(c, uFogColor, smoothstep(uFog.x, uFog.y * 1.4, distance(uEye, vWorld))), 1.0);
}`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uFogColor;
out vec4 o;
void main() {
    vec3 top = vec3(0.004, 0.006, 0.012);
    vec3 c = mix(uFogColor, top, smoothstep(0.35, 1.0, vUv.y));
    o = vec4(c, 1.0);
}`;

/** A unit cylinder along +z (z in [0, 1], radius 1), open ends: [interleaved pos+normal, indices]. */
export function cylinderMesh(n: number): [Float32Array, Uint16Array] {
    const v: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a);
        const y = Math.sin(a);
        v.push(x, y, 0, x, y, 0, x, y, 1, x, y, 0);
    }
    for (let i = 0; i < n; i++) {
        const b = i * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    return [new Float32Array(v), new Uint16Array(idx)];
}

/** A unit UV sphere: [interleaved pos+normal, indices]. */
export function sphereMesh(lat: number, lon: number): [Float32Array, Uint16Array] {
    const v: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= lat; i++) {
        const t = (i / lat) * Math.PI;
        for (let j = 0; j <= lon; j++) {
            const p = (j / lon) * Math.PI * 2;
            const x = Math.sin(t) * Math.cos(p);
            const y = Math.cos(t);
            const z = Math.sin(t) * Math.sin(p);
            v.push(x, y, z, x, y, z);
        }
    }
    for (let i = 0; i < lat; i++) {
        for (let j = 0; j < lon; j++) {
            const a = i * (lon + 1) + j;
            const b = a + lon + 1;
            idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    return [new Float32Array(v), new Uint16Array(idx)];
}

function world(c: Cell): Vec3 {
    return [c[0] - (GRID[0] - 1) / 2, c[1] - (GRID[1] - 1) / 2, c[2] - (GRID[2] - 1) / 2];
}

interface Mesh {
    vao: WebGLVertexArrayObject;
    count: number;
    buffers: WebGLBuffer[];
}

const FOG_COLOR: Vec3 = [0.018, 0.026, 0.045];

export class PipesGL extends GLMode {
    private readonly sim: PipesSim;
    private lines: LineSpec[] = [];
    private orbit = true;
    private resetAfter = 120;
    private sceneAge = 0;
    private fade = 1;
    private fadingOut = false;
    private phases = new Float32Array(MAX_LINES);
    private uploaded = 0;
    /** Per pipe: when its last queued segment finishes growing (renderer seconds). */
    private growEnd = new Float64Array(MAX_LINES);
    /** Per uploaded segment: birth and grow duration, to place the growing heads. */
    private births: Array<[number, number]> = [];
    private readonly tubeProg: WebGLProgram;
    private readonly ballProg: WebGLProgram;
    private readonly floorProg: WebGLProgram;
    private readonly skyProg: WebGLProgram;
    private readonly uTube;
    private readonly uBall;
    private readonly uFloor;
    private readonly uSky;
    private readonly tubes: Mesh;
    private readonly flanges: Mesh;
    private readonly balls: Mesh;
    private readonly heads: Mesh;
    private readonly floor: Mesh;
    private readonly skyVao: WebGLVertexArrayObject;
    private readonly tubeBuf: WebGLBuffer;
    private readonly flangeBuf: WebGLBuffer;
    private readonly ballBuf: WebGLBuffer;
    private readonly headBuf: WebGLBuffer;
    private tubeCount = 0;
    private flangeCount = 0;
    private ballCount = 0;
    private headCount = 0;

    constructor(canvas: HTMLCanvasElement, quality: QualitySetting, random: () => number = Math.random) {
        super(canvas, quality);
        const gl = this.gl;
        this.sim = new PipesSim(GRID, random);
        const names = ['uViewProj', 'uTime', 'uEye', 'uFogColor', 'uFog', 'uColor', 'uGlow', 'uBeacon', 'uPhase'] as const;
        this.tubeProg = program(gl, TUBE_VS, TUBE_FS);
        this.ballProg = program(gl, BALL_VS, BALL_FS);
        this.floorProg = program(gl, FLOOR_VS, FLOOR_FS);
        this.skyProg = program(gl, FULLSCREEN_VS, SKY_FS);
        this.uTube = uniforms(gl, this.tubeProg, names);
        this.uBall = uniforms(gl, this.ballProg, names);
        this.uFloor = uniforms(gl, this.floorProg, ['uViewProj', 'uFloorY', 'uEye', 'uFogColor', 'uFog'] as const);
        this.uSky = uniforms(gl, this.skyProg, ['uFogColor'] as const);

        const [cyl, cylIdx] = cylinderMesh(24);
        const [sph, sphIdx] = sphereMesh(12, 20);
        this.tubeBuf = this.instanceBuffer(MAX_TUBES * TUBE_FLOATS);
        this.flangeBuf = this.instanceBuffer(MAX_TUBES * TUBE_FLOATS);
        this.ballBuf = this.instanceBuffer(MAX_TUBES * BALL_FLOATS);
        this.headBuf = this.instanceBuffer(MAX_LINES * BALL_FLOATS);
        this.tubes = this.instancedMesh(cyl, cylIdx, this.tubeBuf, [3, 3, 4, 1]);
        this.flanges = this.instancedMesh(cyl, cylIdx, this.flangeBuf, [3, 3, 4, 1]);
        this.balls = this.instancedMesh(sph, sphIdx, this.ballBuf, [4, 3]);
        this.heads = this.instancedMesh(sph, sphIdx, this.headBuf, [4, 3]);
        this.floor = this.floorMesh();
        this.skyVao = gl.createVertexArray() as WebGLVertexArrayObject;
    }

    private instanceBuffer(floats: number): WebGLBuffer {
        const gl = this.gl;
        const b = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
        return b;
    }

    /** A mesh (pos+normal at locations 0, 1) with per-instance attributes from location 2 on. */
    private instancedMesh(verts: Float32Array, idx: Uint16Array, inst: WebGLBuffer, layout: number[]): Mesh {
        const gl = this.gl;
        const vao = gl.createVertexArray() as WebGLVertexArrayObject;
        gl.bindVertexArray(vao);
        const vb = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        const ib = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, inst);
        const stride = layout.reduce((a, b) => a + b, 0) * 4;
        let offset = 0;
        layout.forEach((size, i) => {
            gl.enableVertexAttribArray(2 + i);
            gl.vertexAttribPointer(2 + i, size, gl.FLOAT, false, stride, offset);
            gl.vertexAttribDivisor(2 + i, 1);
            offset += size * 4;
        });
        gl.bindVertexArray(null);
        return { vao, count: idx.length, buffers: [vb, ib] };
    }

    private floorMesh(): Mesh {
        const gl = this.gl;
        const vao = gl.createVertexArray() as WebGLVertexArrayObject;
        gl.bindVertexArray(vao);
        const vb = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
        gl.bindVertexArray(null);
        return { vao, count: 4, buffers: [vb] };
    }

    configure(props: GuardProps): void {
        if (props.lines.length !== this.lines.length) {
            this.restart();
        }
        this.lines = props.lines;
        this.orbit = props.modes.pipes.orbit;
        this.resetAfter = Math.max(10, Number.isFinite(props.modes.pipes.resetAfterSec) ? props.modes.pipes.resetAfterSec : 120);
    }

    private restart(): void {
        this.sim.reset();
        this.uploaded = 0;
        this.births = [];
        this.tubeCount = this.flangeCount = this.ballCount = 0;
        this.growEnd.fill(0);
        this.sceneAge = 0;
    }

    /** Push segments the sim added since the last frame into the instance buffers. */
    private upload(): void {
        const gl = this.gl;
        const segs = this.sim.segments;
        if (segs.length < this.uploaded) {
            this.restart();
        }
        const fresh = segs.slice(this.uploaded);
        if (fresh.length === 0) {
            return;
        }
        const tubes: number[] = [];
        const flanges: number[] = [];
        const balls: number[] = [];
        for (const s of fresh) {
            const look = this.lines[s.pipe] ? lineLook(this.lines[s.pipe]) : null;
            const speed = look ? Math.max(look.speed, 0.05) : 0.5;
            const grow = Math.min(2.5, Math.max(0.08, 1 / (speed * GROWTH * CELLS_PER_SEC)));
            let birth = Math.max(this.time, this.growEnd[s.pipe]);
            if (birth - this.time > 1) {
                birth = this.time;
            }
            this.growEnd[s.pipe] = birth + grow;
            this.births.push([birth, grow]);
            const a = world(s.from);
            const b = world(s.to);
            tubes.push(a[0], a[1], a[2], b[0], b[1], b[2], s.pipe, s.dist, birth, grow, 1);
            if (s.joint) {
                balls.push(a[0], a[1], a[2], s.pipe, birth, 1.32, 0);
            } else {
                const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                flanges.push(a[0] - d[0] * 0.05, a[1] - d[1] * 0.05, a[2] - d[2] * 0.05,
                    a[0] + d[0] * 0.05, a[1] + d[1] * 0.05, a[2] + d[2] * 0.05, s.pipe, 0, birth, 0.001, 1.28);
            }
        }
        const put = (buf: WebGLBuffer, data: number[], count: number, floats: number): number => {
            if (data.length > 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.bufferSubData(gl.ARRAY_BUFFER, count * floats * 4, new Float32Array(data));
            }
            return count + data.length / floats;
        };
        this.tubeCount = put(this.tubeBuf, tubes, this.tubeCount, TUBE_FLOATS);
        this.flangeCount = put(this.flangeBuf, flanges, this.flangeCount, TUBE_FLOATS);
        this.ballCount = put(this.ballBuf, balls, this.ballCount, BALL_FLOATS);
        this.uploaded = segs.length;
    }

    /** The growing tip of every pipe: a glowing ball at the end of its newest segment. */
    private updateHeads(): void {
        const latest = new Map<number, number>();
        const segs = this.sim.segments;
        for (let i = segs.length - 1; i >= 0 && latest.size < this.lines.length; i--) {
            if (!latest.has(segs[i].pipe)) {
                latest.set(segs[i].pipe, i);
            }
        }
        const data: number[] = [];
        latest.forEach((i, pipe) => {
            const s: Segment = segs[i];
            const [birth, grow] = this.births[i] || [0, 1];
            const t = Math.min(1, Math.max(0, (this.time - birth) / grow));
            const a = world(s.from);
            const b = world(s.to);
            data.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, pipe, -1000, 1.42, 1);
        });
        this.headCount = data.length / BALL_FLOATS;
        if (data.length > 0) {
            const gl = this.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.headBuf);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(data));
        }
    }

    protected grading(): [number, number, number] {
        return [0.85, 1.05 * this.fade, 1.0];
    }

    protected draw(dt: number, _now: number, w: number, h: number): void {
        const gl = this.gl;
        // Scene lifecycle: grow, then fade out and start over.
        this.sceneAge += dt;
        if (!this.fadingOut && (this.sceneAge > this.resetAfter || this.sim.fillRatio() > FILL_RESET)) {
            this.fadingOut = true;
        }
        if (this.fadingOut) {
            this.fade = Math.max(0, this.fade - dt / FADE_SEC);
            if (this.fade === 0) {
                this.fadingOut = false;
                this.restart();
            }
        } else {
            this.fade = Math.min(1, this.fade + dt / FADE_SEC);
            const looks = this.lines.map(lineLook);
            this.sim.advance(dt * 1000, looks.map((l) => l.speed * GROWTH));
            looks.forEach((l, i) => {
                this.phases[i] = (this.phases[i] + l.speed * PULSE_SPEED * dt) % 3000;
            });
        }
        this.upload();
        this.updateHeads();

        // Camera.
        const angle = (this.orbit ? this.time * (2 * Math.PI / 150) : 0) + 0.7;
        const radius = 23;
        const eye: Vec3 = [Math.sin(angle) * radius, 7.5 + Math.sin(this.time * 0.07) * 1.5, Math.cos(angle) * radius];
        const view = lookAt(eye, [0, -0.8, 0], [0, 1, 0]);
        const proj = perspective((38 * Math.PI) / 180, w / h, 0.5, 120);
        const viewProj = multiply(proj, view);

        // Per-line uniforms.
        const colors = new Float32Array(MAX_LINES * 3);
        const glow = new Float32Array(MAX_LINES);
        const beacon = new Float32Array(MAX_LINES);
        this.lines.slice(0, MAX_LINES).forEach((line, i) => {
            const look = lineLook(line);
            const lin = toLinear(look.rgb);
            colors.set(lin, i * 3);
            glow[i] = look.glow;
            beacon[i] = look.beacon;
        });

        gl.clearColor(FOG_COLOR[0], FOG_COLOR[1], FOG_COLOR[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.disable(gl.BLEND);

        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(this.skyProg);
        gl.uniform3fv(this.uSky.uFogColor, FOG_COLOR);
        gl.bindVertexArray(this.skyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.useProgram(this.floorProg);
        gl.uniformMatrix4fv(this.uFloor.uViewProj, false, viewProj);
        gl.uniform1f(this.uFloor.uFloorY, -(GRID[1] / 2) - 0.6);
        gl.uniform3fv(this.uFloor.uEye, eye);
        gl.uniform3fv(this.uFloor.uFogColor, FOG_COLOR);
        gl.uniform2f(this.uFloor.uFog, 18, 52);
        gl.bindVertexArray(this.floor.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        const setCommon = (u: typeof this.uTube) => {
            gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
            gl.uniform1f(u.uTime, this.time);
            gl.uniform3fv(u.uEye, eye);
            gl.uniform3fv(u.uFogColor, FOG_COLOR);
            gl.uniform2f(u.uFog, 20, 48);
            gl.uniform3fv(u.uColor, colors);
            gl.uniform1fv(u.uGlow, glow);
            gl.uniform1fv(u.uBeacon, beacon);
            gl.uniform1fv(u.uPhase, this.phases);
        };
        // Tubes are open-ended, so no back-face culling: their inside shows at a growing tip.
        gl.disable(gl.CULL_FACE);
        gl.useProgram(this.tubeProg);
        setCommon(this.uTube);
        if (this.tubeCount > 0) {
            gl.bindVertexArray(this.tubes.vao);
            gl.drawElementsInstanced(gl.TRIANGLES, this.tubes.count, gl.UNSIGNED_SHORT, 0, this.tubeCount);
        }
        if (this.flangeCount > 0) {
            gl.bindVertexArray(this.flanges.vao);
            gl.drawElementsInstanced(gl.TRIANGLES, this.flanges.count, gl.UNSIGNED_SHORT, 0, this.flangeCount);
        }
        gl.useProgram(this.ballProg);
        setCommon(this.uBall);
        if (this.ballCount > 0) {
            gl.bindVertexArray(this.balls.vao);
            gl.drawElementsInstanced(gl.TRIANGLES, this.balls.count, gl.UNSIGNED_SHORT, 0, this.ballCount);
        }
        if (this.headCount > 0) {
            gl.bindVertexArray(this.heads.vao);
            gl.drawElementsInstanced(gl.TRIANGLES, this.heads.count, gl.UNSIGNED_SHORT, 0, this.headCount);
        }
        gl.bindVertexArray(null);
    }

    protected disposeScene(): void {
        const gl = this.gl;
        for (const m of [this.tubes, this.flanges, this.balls, this.heads, this.floor]) {
            gl.deleteVertexArray(m.vao);
            m.buffers.forEach((b) => gl.deleteBuffer(b));
        }
        for (const b of [this.tubeBuf, this.flangeBuf, this.ballBuf, this.headBuf]) {
            gl.deleteBuffer(b);
        }
        gl.deleteVertexArray(this.skyVao);
        for (const p of [this.tubeProg, this.ballProg, this.floorProg, this.skyProg]) {
            gl.deleteProgram(p);
        }
    }
}
