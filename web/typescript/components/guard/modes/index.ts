// Picks the renderer for a canvas mode: WebGL2 when the browser has it, else
// a simpler 2D version. A GL failure after the context exists (a shader the
// driver rejects) leaves the canvas unusable for 2D, so the caller retries the
// 2D fallback on a fresh canvas.
import { Mode } from '../guardProps';
import { BounceRenderer } from './fun/bounce';
import { DucksRenderer } from './fun/ducks';
import { PongRenderer } from './fun/pong';
import { AuroraGL } from './gl/aurora';
import { FlowGL } from './gl/flow';
import { HaloGL } from './gl/halo';
import { PipesGL } from './gl/pipesGL';
import { LavaGL, SynthwaveGL, TunnelGL } from './gl/showpieces';
import { StarfieldGL } from './gl/starfieldGL';
import { PipesRenderer } from './pipes';
import { QualitySetting } from './quality';
import { ModeRenderer } from './renderer';
import { Starfield } from './starfield';

let warned = false;

export function createGLRenderer(mode: Mode, canvas: HTMLCanvasElement, quality: QualitySetting): ModeRenderer | null {
    try {
        switch (mode) {
            case 'pipes':
                return new PipesGL(canvas, quality);
            case 'aurora':
                return new AuroraGL(canvas, quality);
            case 'halo':
                return new HaloGL(canvas, quality);
            case 'starfield':
                return new StarfieldGL(canvas, quality);
            case 'synthwave':
                return new SynthwaveGL(canvas, quality);
            case 'lava':
                return new LavaGL(canvas, quality);
            case 'tunnel':
                return new TunnelGL(canvas, quality);
            case 'flow':
                return new FlowGL(canvas, quality);
            default:
                return null;
        }
    } catch (e) {
        if (!warned) {
            warned = true;
            // A warning, not an error: the fallback works, and kiosk consoles get read for errors.
            console.warn(`Mustry Screensaver: WebGL2 unavailable (${e instanceof Error ? e.message : e}); using the 2D modes.`);
        }
        return null;
    }
}

/**
 * The 2D renderers: the funny modes are 2D by design (they run everywhere);
 * pipes has its own 2D fallback; the other GL modes fall back to the 2D starfield.
 */
export function create2DRenderer(mode: Mode, canvas: HTMLCanvasElement): ModeRenderer {
    switch (mode) {
        case 'pipes':
            return new PipesRenderer(canvas);
        case 'bounce':
            return new BounceRenderer(canvas);
        case 'pong':
            return new PongRenderer(canvas);
        case 'ducks':
            return new DucksRenderer(canvas);
        default:
            return new Starfield(canvas);
    }
}
