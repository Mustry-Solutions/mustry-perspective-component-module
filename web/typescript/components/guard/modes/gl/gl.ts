// Small WebGL2 helpers shared by the GL idle modes: context creation, shader
// programs, a fullscreen triangle and the bit of matrix math the 3D modes need.
// No library: the whole GL layer is a few hundred lines and the bundle stays small.

export type Vec3 = [number, number, number];

/** A WebGL2 context for an idle-mode canvas, or null when the browser has none. */
export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
    try {
        return canvas.getContext('webgl2', {
            alpha: false,
            antialias: false, // MSAA happens in our own scene target (see post.ts)
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: 'default'
        });
    } catch (e) {
        return null;
    }
}

/**
 * Compile and link a program; throws with the driver's log so the caller can fall back to 2D.
 * `feedback` names vertex outputs captured by transform feedback (interleaved).
 */
export function program(gl: WebGL2RenderingContext, vs: string, fs: string, feedback?: string[]): WebGLProgram {
    const compile = (type: number, src: string): WebGLShader => {
        const s = gl.createShader(type) as WebGLShader;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(s);
            gl.deleteShader(s);
            throw new Error(`shader compile failed: ${log}`);
        }
        return s;
    };
    const p = gl.createProgram() as WebGLProgram;
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    if (feedback) {
        gl.transformFeedbackVaryings(p, feedback, gl.INTERLEAVED_ATTRIBS);
    }
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(`program link failed: ${gl.getProgramInfoLog(p)}`);
    }
    return p;
}

/** Uniform locations by name. */
export function uniforms<K extends string>(gl: WebGL2RenderingContext, p: WebGLProgram, names: readonly K[]): Record<K, WebGLUniformLocation | null> {
    const out = {} as Record<K, WebGLUniformLocation | null>;
    for (const n of names) {
        out[n] = gl.getUniformLocation(p, n);
    }
    return out;
}

/** Vertex shader for a fullscreen triangle drawn with gl.drawArrays(TRIANGLES, 0, 3) and no buffers. */
export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** GLSL noise shared by the fragment shaders (value noise + fbm, cheap enough for a Raspberry Pi). */
export const NOISE_GLSL = `
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        a *= 0.5;
    }
    return v;
}`;

// --- matrices (column-major, as GL wants them) ----------------------------------

export function perspective(fovyRad: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1 / Math.tan(fovyRad / 2);
    const nf = 1 / (near - far);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) * nf;
    m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
}

function sub(a: Vec3, b: Vec3): Vec3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: Vec3): Vec3 {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Float32Array {
    const z = normalize(sub(eye, target));
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    const m = new Float32Array(16);
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
    m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
    m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
    m[15] = 1;
    return m;
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let s = 0;
            for (let k = 0; k < 4; k++) {
                s += a[k * 4 + r] * b[c * 4 + k];
            }
            out[c * 4 + r] = s;
        }
    }
    return out;
}

/** sRGB 0-255 -> linear 0-1, for lighting maths (the post pass converts back). */
export function toLinear(rgb: [number, number, number]): Vec3 {
    return rgb.map((c) => Math.pow(c / 255, 2.2)) as Vec3;
}
