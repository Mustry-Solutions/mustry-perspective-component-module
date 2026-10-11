// The canvas behind every animated mode: picks the renderer (WebGL2 first, 2D
// when that fails or the context is lost), runs it in a frame loop, and swaps
// to a fresh canvas when the mode changes or falls back.
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
    /** WebGL2 failed (or lost its context): draw the 2D version on a fresh canvas. */
    fallback: boolean;
}

/** A full-viewport canvas running one mode's renderer at up to 30 fps. */
export class CanvasMode extends React.Component<CanvasModeProps, CanvasModeState> {
    private canvas: HTMLCanvasElement | null = null;
    private loop: FrameLoop | null = null;
    private renderer: ModeRenderer | null = null;

    constructor(props: CanvasModeProps) {
        super(props);
        this.state = { fallback: false };
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
            this.renderer.configure(this.props.props);
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
        let renderer: ModeRenderer | null = null;
        if (!this.state.fallback && GL_MODES.includes(this.props.mode)) {
            renderer = createGLRenderer(this.props.mode, canvas, this.props.props.config.quality);
            if (!renderer) {
                // The canvas may now hold a half-made GL context: re-render with a new one.
                this.setState({ fallback: true });
                return;
            }
        } else {
            renderer = create2DRenderer(this.props.mode, canvas);
        }
        this.renderer = renderer;
        canvas.dataset.renderer = renderer.kind;
        renderer.configure(this.props.props);
        this.loop = new FrameLoop((dt, now) => {
            const r = this.renderer;
            if (r instanceof GLMode && r.contextLost) {
                this.stop();
                this.setState({ fallback: true });
                return;
            }
            if (r) {
                r.frame(dt, now);
            }
        });
        this.loop.start();
    }

    private stop(): void {
        if (this.loop) {
            this.loop.stop();
            this.loop = null;
        }
        if (this.renderer) {
            this.renderer.dispose();
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
