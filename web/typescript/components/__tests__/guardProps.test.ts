import { EN_GUARD_LABELS } from '../../shared/labels/guard';
import { DEFAULT_LINES, mapGuardProps, normMode, PropReader } from '../guard/guardProps';

/** A PropertyTree stand-in over a plain object, with 'a.b[0].c' paths. */
function tree(obj: Record<string, unknown>): PropReader {
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

describe('mapGuardProps', () => {
    it('applies schema defaults to an empty tree', () => {
        const p = mapGuardProps(tree({}));
        expect(p.config).toEqual({
            enabled: true, timeoutSec: 600, mode: 'clock', wakeOnMove: true, moveThresholdPx: 8, wakeLock: false, quality: 'auto', reduceMotion: 'auto',
            locale: '', labels: EN_GUARD_LABELS
        });
        expect(p.burnIn).toEqual({ drift: true, night: { enabled: true, from: '22:00', to: '06:00', mode: 'clock', level: 0.4 } });
        expect(p.alarm).toEqual({ wakePriority: 3, pinPriority: 2, includeAcked: true, sources: [], staleAfterSec: 8 });
        expect(p.lines).toBe(DEFAULT_LINES);
        expect(p.modes.legend).toBe(true);
        expect(p.modes.pipes).toEqual({ resetAfterSec: 120, orbit: true });
        expect(p.modes.bounce).toEqual({ text: 'IDLE' });
        expect(p.modes.pong).toEqual({ left: 'DAY SHIFT', right: 'NIGHT SHIFT' });
        expect(p.modes.shuffle).toEqual({ modes: [], minutes: 5 });
    });

    it('picks the locale pack and applies label overrides on top', () => {
        const p = mapGuardProps(tree({ config: { locale: 'fr-BE', labels: { wakeHint: 'Touchez l’écran', line: '' } } }));
        expect(p.config.locale).toBe('fr-BE');
        expect(p.config.labels.wakeHint).toBe('Touchez l’écran');
        expect(p.config.labels.line).toBe('Ligne {n}');
        expect(p.config.labels.critical).toBe('Critique');
        expect(mapGuardProps(tree({ config: { locale: 'xx' } })).config.labels).toEqual(EN_GUARD_LABELS);
    });

    it('reads bound values', () => {
        const p = mapGuardProps(tree({
            config: { mode: 'Aurora', timeoutSec: 30, quality: 'LOW' },
            alarm: { wakePriority: 'Critical', pinPriority: 'Low', sources: ['Line 1*', '', 3] },
            lines: [{ label: 'Boiler', state: 'fault', flow: 1.5 }, { label: 'Feed' }]
        }));
        expect(p.config.mode).toBe('aurora');
        expect(p.config.quality).toBe('low');
        expect(p.config.timeoutSec).toBe(30);
        expect(p.alarm.wakePriority).toBe(4);
        expect(p.alarm.pinPriority).toBe(1);
        expect(p.alarm.sources).toEqual(['Line 1*']);
        expect(p.lines).toEqual([
            { label: 'Boiler', state: 'fault', flow: 1.5, color: '' },
            { label: 'Feed', state: 'running', flow: 0.5, color: '' }
        ]);
    });

    it('caps the number of lines', () => {
        const lines = Array.from({ length: 30 }, (_, i) => ({ label: `P${i}` }));
        expect(mapGuardProps(tree({ lines })).lines).toHaveLength(12);
    });

    it('falls back to the clock for unknown modes', () => {
        expect(normMode('toasters')).toBe('clock');
        expect(normMode(' CLOCK ')).toBe('clock');
        expect(normMode('halo')).toBe('halo');
        expect(normMode('Shuffle')).toBe('shuffle');
        expect(normMode('ducks')).toBe('ducks');
    });

    it('reads the shuffle list, keeping only canvas modes', () => {
        const p = mapGuardProps(tree({ modes: { shuffle: { modes: ['Lava', 'clock', 'nope', 'pong'], minutes: 2 } } }));
        expect(p.modes.shuffle).toEqual({ modes: ['lava', 'pong'], minutes: 2 });
    });
});
