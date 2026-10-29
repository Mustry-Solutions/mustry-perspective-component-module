import { DIRS, FULL_RATIO, PipesSim, pipeColor, seededRandom, STATE_COLORS } from '../guard/modes/pipesSim';

describe('PipesSim', () => {
    it('grows connected, non-overlapping pipes', () => {
        const sim = new PipesSim([8, 6, 6], seededRandom(42));
        for (let i = 0; i < 40; i++) {
            sim.stepPipe(0);
            sim.stepPipe(1);
        }
        const cells = new Set<string>();
        for (const s of sim.segments) {
            const step = s.to.map((v, i) => v - s.from[i]);
            expect(DIRS.some((d) => d.every((v, i) => v === step[i]))).toBe(true);
            for (const v of s.to) {
                expect(v).toBeGreaterThanOrEqual(0);
            }
            const key = s.to.join(',');
            expect(cells.has(key)).toBe(false);
            cells.add(key);
        }
        expect(sim.segments.length).toBeGreaterThan(40);
    });

    it('starts each run with a joint', () => {
        const sim = new PipesSim([8, 6, 6], seededRandom(1));
        expect(sim.stepPipe(0)!.joint).toBe(true);
    });

    it('grows with flow and stops at zero flow', () => {
        const sim = new PipesSim([16, 10, 10], seededRandom(7));
        expect(sim.advance(1000, [1, 0, 0.5])).toBeGreaterThanOrEqual(5);
        const byPipe = [0, 0, 0];
        sim.segments.forEach((s) => byPipe[s.pipe]++);
        expect(byPipe[0]).toBe(4);
        expect(byPipe[1]).toBe(0);
        expect(byPipe[2]).toBe(2);
    });

    it('carries fractional growth between frames', () => {
        const sim = new PipesSim([16, 10, 10], seededRandom(3));
        let added = 0;
        for (let i = 0; i < 30; i++) {
            added += sim.advance(1000 / 30, [1]);
        }
        expect(added).toBeGreaterThanOrEqual(3);
        expect(added).toBeLessThanOrEqual(4);
    });

    it('starts over once the grid is full enough', () => {
        const sim = new PipesSim([4, 3, 3], seededRandom(9));
        for (let i = 0; i < 400; i++) {
            sim.advance(1000, [3, 3]);
            expect(sim.fillRatio()).toBeLessThanOrEqual(FULL_RATIO + 0.25);
        }
    });

    it('colours follow state with an override', () => {
        expect(pipeColor('fault', '')).toBe(STATE_COLORS.fault);
        expect(pipeColor(' Running ', '')).toBe(STATE_COLORS.running);
        expect(pipeColor('unknown', '')).toBe(STATE_COLORS.running);
        expect(pipeColor('fault', '#123456')).toBe('#123456');
    });
});
