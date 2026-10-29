import { CANVAS_MODES, Mode } from '../guard/guardProps';
import { BounceSim, CORNER_PX } from '../guard/modes/fun/bounceSim';
import { DUCK_COUNT, DucksSim, SLOGANS, waveY } from '../guard/modes/fun/ducksSim';
import { BALL, FIELD_H, FIELD_W, PADDLE_H, PongSim, WIN } from '../guard/modes/fun/pongSim';
import { seededRandom } from '../guard/modes/pipesSim';
import { MIN_MINUTES, permutation, shufflePick } from '../guard/modes/shuffle';

describe('bounce', () => {
    const W = 1280;
    const H = 720;
    const BW = 200;
    const BH = 80;

    it('stays on screen and bounces', () => {
        const sim = new BounceSim(seededRandom(1));
        for (let i = 0; i < 30 * 600; i++) {
            sim.step(1 / 30, W, H, BW, BH);
            expect(sim.x).toBeGreaterThanOrEqual(0);
            expect(sim.y).toBeGreaterThanOrEqual(0);
            expect(sim.x).toBeLessThanOrEqual(W - BW);
            expect(sim.y).toBeLessThanOrEqual(H - BH);
        }
        expect(sim.bounces).toBeGreaterThan(50);
    });

    it('keeps still on an axis without room, instead of bouncing every frame', () => {
        // A badge wider than a portrait screen: x has nowhere to go.
        const sim = new BounceSim(seededRandom(3));
        let flashes = 0;
        let corners = 0;
        const ys = new Set<number>();
        for (let i = 0; i < 30 * 60; i++) {
            const ev = sim.step(1 / 30, 400, H, 600, BH);
            flashes += ev.bounces;
            corners += ev.corner ? 1 : 0;
            ys.add(Math.round(sim.y));
            expect(sim.x).toBe(0);
        }
        // Only the vertical edges count: a handful per minute, not one per frame.
        expect(flashes).toBeLessThan(60);
        expect(corners).toBe(0);
        expect(ys.size).toBeGreaterThan(100);
    });

    it('counts a corner hit once', () => {
        const sim = new BounceSim(seededRandom(2));
        sim.step(0, W, H, BW, BH); // places it
        sim.sinceCorner = 10;
        // Aim straight into the bottom-right corner from just inside it.
        sim.x = W - BW - 1;
        sim.y = H - BH - 1;
        sim.vx = Math.SQRT1_2;
        sim.vy = Math.SQRT1_2;
        const ev = sim.step(0.05, W, H, BW, BH);
        expect(ev.corner).toBe(true);
        expect(sim.corners).toBe(1);
        expect(sim.sinceCorner).toBe(0);
        // The next frames, still within CORNER_PX of both edges, do not count again.
        for (let i = 0; i < 3; i++) {
            expect(sim.step(0.001, W, H, BW, BH).corner).toBe(false);
        }
        expect(sim.corners).toBe(1);
    });

    it('an edge hit far from a corner is not a corner', () => {
        const sim = new BounceSim(seededRandom(3));
        sim.step(0, W, H, BW, BH);
        sim.sinceCorner = 10;
        sim.x = W - BW - 1;
        sim.y = (H - BH) / 2;
        sim.vx = 1;
        sim.vy = 0.2;
        const ev = sim.step(0.05, W, H, BW, BH);
        expect(ev.bounces).toBe(1);
        expect(ev.corner).toBe(false);
        expect(CORNER_PX).toBeGreaterThan(0);
    });
});

describe('pong', () => {
    it('keeps the ball and paddles in the field, scores, and finishes games', () => {
        const sim = new PongSim(seededRandom(11));
        let hits = 0;
        let points = 0;
        let games = 0;
        // An hour of play in 8 ms steps. The bounds are checked with plain
        // comparisons (450,000 steps of expect() calls take minutes) and the
        // first step that breaks one is reported.
        let broken = '';
        for (let i = 0; i < 3600 / 0.008 && broken === ''; i++) {
            const ev = sim.step(0.008);
            hits += ev.hit ? 1 : 0;
            points += ev.point >= 0 ? 1 : 0;
            games += ev.game >= 0 ? 1 : 0;
            if (sim.ballY < BALL / 2 - 1e-6 || sim.ballY > FIELD_H - BALL / 2 + 1e-6) {
                broken = `step ${i}: ball y ${sim.ballY} left the field`;
            } else if (sim.ballX <= -BALL * 3 || sim.ballX >= FIELD_W + BALL * 3) {
                broken = `step ${i}: ball x ${sim.ballX} ran away`;
            } else if (sim.paddles.some((p) => p < PADDLE_H / 2 || p > FIELD_H - PADDLE_H / 2)) {
                broken = `step ${i}: a paddle left the field (${sim.paddles.join(', ')})`;
            } else if (Math.max(...sim.score) >= WIN) {
                broken = `step ${i}: a score reached ${WIN} without ending the game`;
            }
        }
        expect(broken).toBe('');
        // Real rallies: many more hits than points, and games end.
        expect(hits).toBeGreaterThan(points * 2);
        expect(points).toBeGreaterThan(20);
        expect(games).toBeGreaterThan(0);
        expect(sim.games[0] + sim.games[1]).toBe(games);
    });

    it('predicts where the ball crosses, bouncing off the walls', () => {
        const sim = new PongSim(seededRandom(5));
        sim.pause = 0;
        sim.ballX = 80;
        sim.ballY = 45;
        sim.vx = 60;
        sim.vy = 60;
        const y = sim.predictY(154);
        expect(y).toBeGreaterThanOrEqual(BALL / 2);
        expect(y).toBeLessThanOrEqual(FIELD_H - BALL / 2);
        // 74 units across at 45 degrees: 45 + 74 = 119 -> reflected off the bottom.
        expect(y).toBeCloseTo(FIELD_H - BALL / 2 - (45 + 74 - (FIELD_H - BALL / 2)), 5);
    });
});

describe('ducks', () => {
    it('keeps its ducks, wraps them around, and lets them speak', () => {
        const sim = new DucksSim(seededRandom(4));
        expect(sim.ducks).toHaveLength(DUCK_COUNT);
        let spoke = 0;
        let last: string | null = null;
        for (let i = 0; i < 30 * 300; i++) {
            sim.step(1 / 30);
            for (const d of sim.ducks) {
                expect(d.x).toBeGreaterThanOrEqual(-0.16);
                expect(d.x).toBeLessThanOrEqual(1.16);
            }
            if (sim.bubble && sim.bubble.text !== last) {
                spoke++;
                expect(SLOGANS).toContain(sim.bubble.text);
                expect(sim.ducks[sim.bubble.duck].layer).toBeGreaterThan(0);
            }
            last = sim.bubble ? sim.bubble.text : null;
        }
        expect(spoke).toBeGreaterThan(5);
        // Far ducks are drawn first.
        const layers = sim.ducks.map((d) => d.layer);
        expect([...layers].sort()).toEqual(layers);
    });

    it('waves are gentle', () => {
        for (let x = 0; x < 1; x += 0.01) {
            expect(Math.abs(waveY(x, 3.3))).toBeLessThan(0.02);
        }
    });
});

describe('shuffle', () => {
    const ALL = [...CANVAS_MODES];

    it('is a permutation', () => {
        const p = permutation(11, 42);
        expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: 11 }, (_, i) => i));
    });

    it('changes mode once per period, never repeating back to back, and visits every mode', () => {
        const since = 1_700_000_000_000;
        const period = 2 * 60_000;
        const seen = new Set<Mode>();
        let prev: Mode | null = null;
        for (let slot = 0; slot < ALL.length * 3; slot++) {
            const at = since + slot * period + 1000;
            const m = shufflePick([], since, at, 2);
            expect(shufflePick([], since, at + period - 2000, 2)).toBe(m);
            if (prev !== null) {
                expect(m).not.toBe(prev);
            }
            seen.add(m);
            prev = m;
        }
        expect(seen.size).toBe(ALL.length);
    });

    it('honours a list, ignores unknown or non-canvas entries, and has a minimum period', () => {
        const since = 5_000;
        const picks = new Set<Mode>();
        for (let i = 0; i < 20; i++) {
            picks.add(shufflePick(['lava', 'ducks', 'clock' as Mode, 'lava'], since, since + i * 60_000, 1));
        }
        expect([...picks].sort()).toEqual(['ducks', 'lava']);
        // A silly period is raised to the minimum: no change within it.
        const a = shufflePick([], since, since + 1000, 0.01);
        expect(shufflePick([], since, since + MIN_MINUTES * 60_000 - 1000, 0.01)).toBe(a);
    });

    it('a different idle session gets a different order', () => {
        const orders = new Set<string>();
        for (const since of [1, 2, 3, 4, 5]) {
            orders.add(Array.from({ length: 5 }, (_, i) => shufflePick([], since * 1e6, since * 1e6 + i * 300_000, 5)).join(','));
        }
        expect(orders.size).toBeGreaterThan(1);
    });
});
