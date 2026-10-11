// Dev preview of the canvas idle modes, outside Perspective: `npm run preview`,
// then open build/preview/index.html#pipes (or any canvas mode: #lava, #pong, ...).
// Query: ?quality=high|low|auto&fault=1&off=1&lines=3&speed=2&legacy=1 (2D fallback).
// Not part of the module bundle.
import { mapGuardProps, Mode, PropReader } from '../typescript/components/guard/guardProps';
import { FrameLoop } from '../typescript/components/guard/modes/frameLoop';
import { create2DRenderer, createGLRenderer } from '../typescript/components/guard/modes/index';

function reader(obj: Record<string, unknown>): PropReader {
    const get = (path: string): unknown => {
        let cur: unknown = obj;
        for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
            if (cur === null || typeof cur !== 'object') {
                return undefined;
            }
            cur = (cur as Record<string, unknown>)[part];
        }
        return cur;
    };
    return {
        readString: (p, d = '') => (typeof get(p) === 'string' ? get(p) as string : d),
        readBoolean: (p, d = false) => (typeof get(p) === 'boolean' ? get(p) as boolean : d),
        readNumber: <T>(p: string, d: T) => (typeof get(p) === 'number' ? get(p) as unknown as T : d),
        readArray: (p, d = []) => (Array.isArray(get(p)) ? get(p) as unknown[] : d),
        readLength: (p) => (Array.isArray(get(p)) ? (get(p) as unknown[]).length : 0)
    };
}

const q = new URLSearchParams(location.search);
const mode = (location.hash.replace('#', '') || 'pipes') as Mode;
const all = [
    { label: 'Line 1', state: q.get('fault') ? 'fault' : 'running', flow: 0.9 },
    { label: 'Line 2', state: 'running', flow: 0.6 },
    { label: 'CIP', state: 'idle', flow: 0.25 },
    { label: 'Utilities', state: 'warning', flow: 0.7 },
    { label: 'Palletiser', state: 'running', flow: 1.2 },
    { label: 'Boiler', state: 'off', flow: 0 }
];
const props = mapGuardProps(reader({
    config: { mode, quality: q.get('quality') || 'auto' },
    lines: all.slice(0, Number(q.get('lines') || 4)).map((l) => (q.get('off') ? { ...l, state: 'off', flow: 0 } : l)),
    modes: { starfield: { speed: Number(q.get('speed') || 1.5), color: q.get('color') || '' } }
}));

const canvas = document.getElementById('c') as HTMLCanvasElement;
const r = (!q.get('legacy') && createGLRenderer(mode, canvas, props.config.quality)) || create2DRenderer(mode, canvas);
r.configure(props);
document.body.dataset.renderer = r.kind;
let frames = 0;
new FrameLoop((dt, now) => {
    r.frame(dt, now);
    frames++;
    document.body.dataset.frames = String(frames);
}).start();
