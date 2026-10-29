// How a line's bound state and flow look in the line-driven modes (pipes,
// aurora, halo): colour, how strongly its flow pulses glow, whether it blinks.
// Pure apart from colour parsing; node-tested.
import { LineSpec } from '../guardProps';
import { pipeColor } from './pipesSim';

export interface LineLook {
    /** sRGB 0-255. */
    rgb: [number, number, number];
    /** Strength of the moving flow highlights (0 = none). */
    glow: number;
    /** A slow alarm-like pulse over the whole element (0 = none, 1 = full). */
    beacon: number;
    /** Motion speed: the flow, clamped to 0-3; 0 when the line is off. */
    speed: number;
}

const GLOW: Record<string, number> = { running: 1, warning: 0.9, fault: 0.6, idle: 0.3, off: 0 };
const BEACON: Record<string, number> = { warning: 0.3, fault: 1 };

export function normState(state: string): string {
    const s = (state || '').trim().toLowerCase();
    return s in GLOW ? s : 'running';
}

/** '#rrggbb' -> [r, g, b]; null for anything else. */
export function hexToRgb(hex: string): [number, number, number] | null {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) {
        return null;
    }
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

let parser: CanvasRenderingContext2D | null = null;
const parsed = new Map<string, [number, number, number]>();

/** Any CSS colour -> rgb (browser only; hex works everywhere). Unknown colours give the fallback. */
export function cssRgb(color: string, fallback: [number, number, number]): [number, number, number] {
    const hex = hexToRgb(color);
    if (hex) {
        return hex;
    }
    const cached = parsed.get(color);
    if (cached) {
        return cached;
    }
    if (typeof document === 'undefined') {
        return fallback;
    }
    if (!parser) {
        parser = document.createElement('canvas').getContext('2d');
    }
    if (!parser) {
        return fallback;
    }
    parser.fillStyle = '#000001';
    parser.fillStyle = color;
    const v = String(parser.fillStyle);
    const rgb = v === '#000001' ? fallback : (hexToRgb(v) || fallback);
    parsed.set(color, rgb);
    return rgb;
}

export function lineLook(line: LineSpec): LineLook {
    const state = normState(line.state);
    const flow = Number.isFinite(line.flow) ? Math.min(3, Math.max(0, line.flow)) : 0;
    const fallback = hexToRgb(pipeColor(state, '')) as [number, number, number];
    return {
        rgb: cssRgb(pipeColor(state, line.color), fallback),
        glow: GLOW[state] * Math.min(1, flow * 2),
        beacon: BEACON[state] || 0,
        speed: state === 'off' ? 0 : flow
    };
}
