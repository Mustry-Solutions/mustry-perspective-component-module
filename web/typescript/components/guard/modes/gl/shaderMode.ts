// Base for idle modes that are one fullscreen fragment shader with uRes and
// uTime (synthwave, lava, tunnel). The shader text supplies everything else.
import { GuardProps } from '../../guardProps';
import { QualitySetting } from '../quality';
import { GLMode } from '../renderer';
import { FULLSCREEN_VS, program, uniforms } from './gl';

export class ShaderMode extends GLMode {
    private readonly prog: WebGLProgram;
    private readonly u;
    private readonly vao: WebGLVertexArrayObject;

    constructor(canvas: HTMLCanvasElement, quality: QualitySetting, fragment: string,
            private readonly look: [number, number, number] = [0.9, 1.0, 0.9]) {
        super(canvas, quality);
        this.prog = program(this.gl, FULLSCREEN_VS, fragment);
        this.u = uniforms(this.gl, this.prog, ['uRes', 'uTime'] as const);
        this.vao = this.gl.createVertexArray() as WebGLVertexArrayObject;
    }

    configure(_props: GuardProps): void {
        // Not linked to the plant: nothing to configure.
    }

    protected grading(): [number, number, number] {
        return this.look;
    }

    protected draw(_dt: number, _now: number, w: number, h: number): void {
        const gl = this.gl;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(this.prog);
        gl.uniform2f(this.u.uRes, w, h);
        gl.uniform1f(this.u.uTime, this.time);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }

    protected disposeScene(): void {
        this.gl.deleteProgram(this.prog);
        this.gl.deleteVertexArray(this.vao);
    }
}
