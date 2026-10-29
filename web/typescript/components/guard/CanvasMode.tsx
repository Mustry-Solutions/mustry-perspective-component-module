// The canvas behind every animated mode: picks the renderer (WebGL2 first, 2D
// when that fails, the context is lost or a frame throws), runs it in a frame
// loop, and swaps to a fresh canvas when the mode changes or falls back.
import * as React from 'react';
import { GL_MODES, GuardProps, Mode } from './guardProps';
import { FrameLoop } from './modes/frameLoop';
import { create2DRenderer, createGLRenderer } from './modes/index';
import { GLMode, ModeRenderer } from './modes/renderer';

interface CanvasModeProps {
    mode: Mode;
    props: GuardProps;
}

interface CanvasModeState {
    /** The mode the state belongs to: a new mode (a shuffle slot) starts without fallback. */
    mode: Mode;
    /** WebGL2 failed for this mode (or lost its context, or a frame threw): draw the 2D version on a fresh canvas. */
    fallback: boolean;
}

let warnedFrame = false;

/** A warning, not an error: the fallback works, and kiosk consoles get read for errors. */
function warnFrame(e: unknown): void {
    if (!warnedFrame) {
        warnedFrame = true;
        console.warn(`Mustry Screensaver: an idle mode failed (${e instanceof Error ? e.message : e}); falling back.`);
    }
}

/** A full-viewport canvas running one mode's renderer at up to 30 fps. */
export class CanvasMode extends React.Component<CanvasModeProps, CanvasModeState> {
    private canvas: HTMLCanvasElement | null = null;
    private loop: FrameLoop | null = null;
    private renderer: ModeRenderer | null = null;

    constructor(props: CanvasModeProps) {
        super(props);
        this.state = { mode: props.mode, fallback: false };
    }

    /**
     * The fallback applies to the mode that failed only: one lost context must
     * not turn every later shuffle slot into the 2D version for the whole idle
     * session, so a new mode tries WebGL2 again.
     */
    static getDerivedStateFromProps(props: CanvasModeProps, state: CanvasModeState): Partial<CanvasModeState> | null {
        return props.mode !== state.mode ? { mode: props.mode, fallback: false } : null;
    }

    componentDidMount(): void {
        this.start();
    }

    componentDidUpdate(prev: CanvasModeProps, prevState: CanvasModeState): void {
        if (prevState.fallback !== this.state.fallback || prev.mode !== this.props.mode
            || prev.props.config.quality !== this.props.props.config.quality) {
            this.stop();
            this.start();
        } else if (prev.props !== this.props.props && this.renderer) {
            try {
                this.renderer.configure(this.props.props);
            } catch (e) {
                this.fail(e);
            }
        }
    }

    componentWillUnmount(): void {
        this.stop();
    }

    private start(): void {
        const canvas = this.canvas;
        if (!canvas) {
            return;
        }
        const wantGL = !this.state.fallback && GL_MODES.includes(this.props.mode);
        let renderer: ModeRenderer | null = null;
        try {
            renderer = wantGL
                ? createGLRenderer(this.props.mode, canvas, this.props.props.config.quality)
                : create2DRenderer(this.props.mode, canvas);
            if (renderer) {
                renderer.configure(this.props.props);
            }
        } catch (e) {
            warnFrame(e);
            if (renderer) {
                disposeQuietly(renderer);
            }
            renderer = null;
        }
        if (!renderer) {
            if (wantGL) {
                // The canvas may now hold a half-made GL context: re-render with a new one.
                this.setState({ fallback: true });
            }
            return;
        }
        this.renderer = renderer;
        canvas.dataset.renderer = renderer.kind;
        this.loop = new FrameLoop((dt, now) => {
            const r = this.renderer;
            if (!r) {
                return;
            }
            if (r instanceof GLMode && r.contextLost) {
                this.fail(null);
                return;
            }
            try {
                r.frame(dt, now);
            } catch (e) {
                // A frame that throws (a framebuffer the driver will not complete on
                // resize, ...) would throw every frame: stop, and fall back like a lost context.
                this.fail(e);
            }
        });
        this.loop.start();
    }

    /** The running renderer failed: stop it; a GL one gives way to the 2D version on a fresh canvas. */
    private fail(e: unknown): void {
        if (e !== null) {
            warnFrame(e);
        }
        const wasGL = this.renderer !== null && this.renderer.kind === 'webgl2';
        this.stop();
        if (wasGL && !this.state.fallback) {
            this.setState({ fallback: true });
        }
        // A failing 2D renderer just stops: the overlay's text and hint stay up.
    }

    private stop(): void {
        if (this.loop) {
            this.loop.stop();
            this.loop = null;
        }
        if (this.renderer) {
            disposeQuietly(this.renderer);
            this.renderer = null;
        }
    }

    render() {
        return (
            <canvas
                // A canvas that held a GL context cannot give a 2D one: new mode or fallback, new canvas.
                key={`${this.props.mode}-${this.state.fallback ? '2d' : 'gl'}`}
                className="mustry-idle-canvas"
                ref={(c) => { this.canvas = c; }}
            />
        );
    }
}

/** Dispose a renderer that may be half-broken; a throw here must not stop the fallback. */
function disposeQuietly(r: ModeRenderer): void {
    try {
        r.dispose();
    } catch (e) {
        // Nothing left to save.
    }
}
