// The fullscreen-shader showpieces: no plant data, just something good to
// look at. Each is one fragment shader on ShaderMode.
import { QualitySetting } from '../quality';
import { NOISE_GLSL } from './gl';
import { ShaderMode } from './shaderMode';

/** Cosine palette (Inigo Quilez): smooth hue cycles for the colour-shifting modes. */
const PALETTE_GLSL = `
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}`;

// --- Synthwave: a retro sunset flyover ------------------------------------------

const SYNTHWAVE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
out vec4 o;
${NOISE_GLSL}
const float HORIZON = 0.42;

float ridge(float x, float seed, float scale) {
    float r = 1.0 - abs(2.0 * fbm(vec2(x * scale + seed, seed)) - 1.0);
    // Leave a valley in the middle so the sun can set into it.
    return pow(r, 2.0) * mix(0.35, 1.0, smoothstep(0.15, 0.7, abs(x)));
}

void main() {
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y);
    vec3 c;
    if (p.y > HORIZON) {
        float h = (p.y - HORIZON) / (1.0 - HORIZON);
        c = mix(vec3(0.75, 0.16, 0.45), vec3(0.14, 0.03, 0.27), smoothstep(0.0, 0.45, h));
        c = mix(c, vec3(0.02, 0.01, 0.06), smoothstep(0.4, 1.0, h));
        // Stars in the upper sky.
        vec2 sp = vUv * uRes / 2.0;
        float star = step(0.997, hash12(floor(sp)));
        c += vec3(1.0, 0.85, 1.0) * star * smoothstep(0.35, 0.8, h) * (0.6 + 0.4 * sin(uTime * 3.0 + hash12(floor(sp)) * 50.0));
        // The sun: a warm disc with horizontal bands cut out of its lower half.
        vec2 sc = vec2(0.0, HORIZON + 0.2);
        float r = length(p - sc);
        float R = 0.22;
        vec3 sun = mix(vec3(1.0, 0.12, 0.45), vec3(1.0, 0.72, 0.12), smoothstep(sc.y - R, sc.y + R, p.y));
        float k = (sc.y - p.y) / R;                 // 0 at the centre, 1 at the bottom
        float band = fract(p.y * 34.0 + uTime * 0.25);
        float cut = k > 0.0 ? step(band, k * 0.55) : 0.0;
        float disc = smoothstep(R, R - 0.004, r) * (1.0 - cut);
        c = mix(c, sun * 0.8, disc);
        c += vec3(1.0, 0.3, 0.6) * exp(-max(r - R, 0.0) * 12.0) * 0.25;
        // Two mountain ranges, the near one with a neon rim.
        float far = HORIZON + 0.11 * ridge(p.x, 3.0, 1.3);
        float near = HORIZON + 0.07 * ridge(p.x, 11.0, 2.2);
        if (p.y < far) {
            c = mix(vec3(0.09, 0.02, 0.16), c, 0.25);
            c += vec3(0.4, 0.2, 1.0) * smoothstep(0.004, 0.0, far - p.y) * 0.8;
        }
        if (p.y < near) {
            c = vec3(0.03, 0.005, 0.07);
            c += vec3(0.1, 0.9, 1.0) * smoothstep(0.004, 0.0, near - p.y) * 1.4;
        }
    } else {
        // The floor: a neon grid racing towards the viewer.
        float d = HORIZON - p.y;
        float z = 0.35 / d;
        vec2 g = vec2(p.x * z * 1.6, z + uTime * 1.6);
        vec2 gw = fwidth(g);
        vec2 l = abs(fract(g - 0.5) - 0.5) / (gw * 1.4);
        float line = 1.0 - min(min(l.x, l.y), 1.0);
        float fade = smoothstep(0.0, 0.08, d);
        vec3 lineCol = mix(vec3(1.0, 0.12, 0.8), vec3(0.15, 0.85, 1.0), smoothstep(0.0, 0.5, d));
        c = vec3(0.02, 0.0, 0.05) + lineCol * line * 2.2 * fade;
        // Haze and the sun's reflection at the horizon.
        c += vec3(0.9, 0.2, 0.5) * exp(-d * 30.0) * 0.35;
        c += vec3(1.0, 0.45, 0.35) * exp(-abs(p.x) * 8.0) * exp(-d * 9.0) * 0.18;
    }
    o = vec4(c, 1.0);
}`;

// --- Lava: a lava lamp the size of the screen -------------------------------------

const LAVA_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
out vec4 o;
${PALETTE_GLSL}
const int N = 10;

void main() {
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
    float f = 0.0;
    vec2 grad = vec2(0.0);
    for (int i = 0; i < N; i++) {
        float fi = float(i);
        // Blobs rise and sink slowly on their own periods and sway sideways.
        vec2 c = vec2(sin(uTime * (0.05 + 0.013 * fi) + fi * 1.7) * 0.42 * aspect,
                      sin(uTime * (0.07 + 0.011 * fi) + fi * 2.9) * 0.42);
        float r = 0.07 + 0.045 * sin(fi * 3.1 + 1.0) + 0.02 * sin(uTime * 0.2 + fi);
        vec2 d = p - c;
        float dd = dot(d, d) + 1e-4;
        f += r * r / dd;
        grad += -2.0 * r * r * d / (dd * dd);
    }
    // Three wax colours, one drifting into the next over a few minutes each.
    vec3 waxes[3] = vec3[3](vec3(1.0, 0.32, 0.06), vec3(0.85, 0.12, 0.55), vec3(0.08, 0.75, 0.7));
    float ph = uTime * 0.006;
    int k = int(mod(floor(ph), 3.0));
    vec3 base = mix(waxes[k], waxes[(k + 1) % 3], smoothstep(0.0, 1.0, fract(ph)));
    vec3 c = base * 0.04 * (1.0 - length(p) * 0.5) + base * min(f, 6.0) * 0.03;
    float inside = smoothstep(0.95, 1.05, f);
    if (inside > 0.0) {
        vec3 n = normalize(vec3(-grad * 0.06, 1.0));
        vec3 l = normalize(vec3(-0.4, 0.5, 0.8));
        float diff = max(dot(n, l), 0.0);
        float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
        float rim = pow(1.0 - n.z, 2.0);
        vec3 wax = base * (0.22 + 0.62 * diff) + vec3(1.0, 0.92, 0.85) * spec * 0.9 + base * rim * 1.4;
        c = mix(c, wax, inside);
    }
    o = vec4(c, 1.0);
}`;

// --- Tunnel: a neon wormhole -------------------------------------------------------

const TUNNEL_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
out vec4 o;
${PALETTE_GLSL}

void main() {
    vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    // The far end wanders, so the tunnel bends.
    p -= vec2(sin(uTime * 0.23), cos(uTime * 0.17)) * 0.08 * (1.0 - length(p));
    float r = length(p);
    float a = atan(p.y, p.x) + uTime * 0.08 + 0.4 / max(r, 0.05) * sin(uTime * 0.1);
    float z = 0.35 / max(r, 0.001) + uTime * 1.1;
    float u = a / 6.28318;
    // Rings travelling at you, and ribs along the walls.
    float ring = fract(z * 0.9);
    float ringLine = exp(-ring * 28.0) + exp(-(1.0 - ring) * 60.0);
    float ribs = fract(u * 12.0 + z * 0.05);
    float ribLine = exp(-abs(ribs - 0.5) * 70.0);
    vec3 col = palette(z * 0.04 + uTime * 0.01, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    vec3 c = col * (ringLine * 2.4 + ribLine * 0.9);
    // Fog into the distance, a hot core far away.
    float near = smoothstep(0.0, 0.5, r);
    c *= near;
    c += col * exp(-r * 14.0) * 1.2;
    c += vec3(0.02, 0.01, 0.05);
    o = vec4(c, 1.0);
}`;

export class SynthwaveGL extends ShaderMode {
    constructor(canvas: HTMLCanvasElement, quality: QualitySetting) {
        super(canvas, quality, SYNTHWAVE_FS, [1.0, 1.0, 0.9]);
    }
}

export class LavaGL extends ShaderMode {
    constructor(canvas: HTMLCanvasElement, quality: QualitySetting) {
        super(canvas, quality, LAVA_FS, [0.6, 1.0, 0.85]);
    }
}

export class TunnelGL extends ShaderMode {
    constructor(canvas: HTMLCanvasElement, quality: QualitySetting) {
        super(canvas, quality, TUNNEL_FS, [1.1, 1.0, 0.8]);
    }
}
