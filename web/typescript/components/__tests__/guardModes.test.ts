import { HALO_INNER, HALO_MAX_STEP, HALO_OUTER, haloRadii } from '../guard/modes/haloLayout';
import { hexToRgb, lineLook, normState } from '../guard/modes/lineStyle';
import { PipesSim, seededRandom, STATE_COLORS } from '../guard/modes/pipesSim';
import { Governor, LEVELS, normQuality, SLOW_FRAME_MS, WARMUP_MS, WINDOW_MS } from '../guard/modes/quality';

describe('quality governor', () => {
    function feed(g: Governor, frameMs: number, totalMs: number): number {
        let changes = 0;
        for (let t = 0; t < totalMs; t += frameMs) {
            if (g.sample(frameMs)) {
                changes++;
            }
        }
        return changes;
    }

    it('stays at the top on a fast screen', () => {
        const g = new Governor('auto');
        expect(feed(g, 33, 60_000)).toBe(0);
        expect(g.level).toBe(0);
        expect(g.current).toEqual(LEVELS[0]);
    });

    it('steps down one level per slow window, to the bottom and no further', () => {
        const g = new Governor('auto');
        feed(g, SLOW_FRAME_MS + 20, WARMUP_MS + WINDOW_MS + 100);
        expect(g.level).toBe(1);
        feed(g, SLOW_FRAME_MS + 20, 60_000);
        expect(g.level).toBe(LEVELS.length - 1);
        expect(g.current.bloom).toBe(false);
    });

    it('does not judge the warm-up (shader compilation stalls)', () => {
        const g = new Governor('auto');
        g.sample(WARMUP_MS - 1);
        feed(g, 33, WINDOW_MS + 100);
        expect(g.level).toBe(0);
    });

    it('never comes back up (no oscillation)', () => {
        const g = new Governor('auto');
        feed(g, 120, 10_000);
        const low = g.level;
        feed(g, 16, 60_000);
        expect(g.level).toBe(low);
    });

    it('high and low are fixed', () => {
        const hi = new Governor('high');
        feed(hi, 200, 30_000);
        expect(hi.level).toBe(0);
        const lo = new Governor('low');
        expect(lo.level).toBe(LEVELS.length - 1);
        expect(normQuality(' HIGH ')).toBe('high');
        expect(normQuality('ultra')).toBe('auto');
    });
});

describe('line looks', () => {
    it('maps state to colour, glow and beacon', () => {
        const fault = lineLook({ label: '', state: 'fault', flow: 1, color: '' });
        expect(fault.rgb).toEqual(hexToRgb(STATE_COLORS.fault));
        expect(fault.beacon).toBe(1);
        const running = lineLook({ label: '', state: 'Running', flow: 1, color: '' });
        expect(running.glow).toBe(1);
        expect(running.beacon).toBe(0);
        const off = lineLook({ label: '', state: 'off', flow: 2, color: '' });
        expect(off.speed).toBe(0);
        expect(off.glow).toBe(0);
    });

    it('scales glow with flow and clamps speed', () => {
        expect(lineLook({ label: '', state: 'running', flow: 0.25, color: '' }).glow).toBeCloseTo(0.5);
        expect(lineLook({ label: '', state: 'running', flow: 0, color: '' }).glow).toBe(0);
        expect(lineLook({ label: '', state: 'running', flow: 9, color: '' }).speed).toBe(3);
        expect(lineLook({ label: '', state: 'running', flow: NaN, color: '' }).speed).toBe(0);
    });

    it('honours a hex colour override and normalises states', () => {
        expect(lineLook({ label: '', state: 'fault', flow: 1, color: '#102030' }).rgb).toEqual([16, 32, 48]);
        expect(normState('weird')).toBe('running');
        expect(hexToRgb('nope')).toBeNull();
    });
});

describe('halo layout', () => {
    it('spaces rings between inner and outer, never further apart than the max step', () => {
        expect(haloRadii(0)).toEqual([]);
        expect(haloRadii(1)).toHaveLength(1);
        for (const n of [2, 4, 6, 12]) {
            const r = haloRadii(n);
            expect(r).toHaveLength(n);
            expect(r[0]).toBeCloseTo(HALO_INNER);
            expect(r[n - 1]).toBeLessThanOrEqual(HALO_OUTER + 1e-9);
            for (let i = 1; i < n; i++) {
                expect(r[i] - r[i - 1]).toBeLessThanOrEqual(HALO_MAX_STEP + 1e-9);
                expect(r[i]).toBeGreaterThan(r[i - 1]);
            }
        }
    });
});

describe('pipe distance', () => {
    it('counts cells along each run and restarts at a respawn', () => {
        const sim = new PipesSim([16, 10, 10], seededRandom(5));
        for (let i = 0; i < 30; i++) {
            sim.stepPipe(0);
        }
        const run = sim.segments.filter((s) => s.pipe === 0);
        expect(run[0].dist).toBe(0);
        for (let i = 1; i < run.length; i++) {
            // Either the next cell of the same run, or a fresh run (joint at dist 0).
            expect(run[i].dist === run[i - 1].dist + 1 || (run[i].dist === 0 && run[i].joint)).toBe(true);
        }
    });
});
