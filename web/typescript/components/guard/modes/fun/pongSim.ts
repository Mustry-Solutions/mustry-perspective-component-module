// Pong, played by two tireless AIs on a 160 x 90 field: the day shift against
// the night shift. Each paddle aims for where the ball will arrive, with an
// aiming error drawn per rally; now and then the error is too big and a
// point is scored. First to 11 wins the game. Pure; node-tested.

export const FIELD_W = 160;
export const FIELD_H = 90;
export const PADDLE_H = 16;
export const PADDLE_W = 2.5;
export const PADDLE_X = 6;
export const BALL = 2.2;
export const WIN = 11;
const PADDLE_SPEED = 72;
const SERVE_SPEED = 62;
const MAX_SPEED = 135;
const SERVE_PAUSE = 1.2;

export interface PongEvents {
    hit: boolean;
    /** 0 = left scored, 1 = right scored, -1 = no point. */
    point: number;
    /** The side that just won a game, or -1. */
    game: number;
}

export class PongSim {
    ballX = FIELD_W / 2;
    ballY = FIELD_H / 2;
    vx = 0;
    vy = 0;
    paddles = [FIELD_H / 2, FIELD_H / 2];
    score = [0, 0];
    games = [0, 0];
    /** Seconds until the next serve (the ball waits in the middle). */
    pause = SERVE_PAUSE;
    /** The side that won the last game, shown for a while; -1 for none. */
    lastWinner = -1;
    private aim = [0, 0];
    private serveTo = 1;

    constructor(private readonly random: () => number) {
        this.newAims();
    }

    /** Per rally: usually a small aiming error, sometimes one big enough to miss. */
    private newAims(): void {
        for (const i of [0, 1]) {
            const miss = this.random() < 0.18;
            this.aim[i] = (this.random() * 2 - 1) * (miss ? PADDLE_H * 0.95 : PADDLE_H * 0.32);
        }
    }

    private serve(): void {
        this.ballX = FIELD_W / 2;
        this.ballY = FIELD_H * (0.3 + this.random() * 0.4);
        const angle = (this.random() * 2 - 1) * 0.5;
        this.vx = Math.cos(angle) * SERVE_SPEED * (this.serveTo === 1 ? 1 : -1);
        this.vy = Math.sin(angle) * SERVE_SPEED;
        this.newAims();
    }

    /** Where the ball will cross x, bouncing off top and bottom. */
    predictY(x: number): number {
        if (this.vx === 0) {
            return this.ballY;
        }
        const t = (x - this.ballX) / this.vx;
        if (t < 0) {
            return FIELD_H / 2;
        }
        const span = FIELD_H - BALL;
        let y = (this.ballY - BALL / 2) + this.vy * t;
        y = ((y % (2 * span)) + 2 * span) % (2 * span);
        return (y > span ? 2 * span - y : y) + BALL / 2;
    }

    step(dt: number): PongEvents {
        const ev: PongEvents = { hit: false, point: -1, game: -1 };
        // Paddles: chase the predicted crossing when the ball comes their way, else drift to the middle.
        [0, 1].forEach((i) => {
            const x = i === 0 ? PADDLE_X + PADDLE_W : FIELD_W - PADDLE_X - PADDLE_W;
            const coming = this.pause <= 0 && (i === 0 ? this.vx < 0 : this.vx > 0);
            const target = coming ? this.predictY(x) + this.aim[i] : FIELD_H / 2;
            const d = target - this.paddles[i];
            const max = (coming ? PADDLE_SPEED : PADDLE_SPEED * 0.35) * dt;
            this.paddles[i] += Math.max(-max, Math.min(max, d));
            this.paddles[i] = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, this.paddles[i]));
        });
        if (this.pause > 0) {
            this.pause -= dt;
            if (this.pause <= 0) {
                this.serve();
            }
            return ev;
        }
        this.ballX += this.vx * dt;
        this.ballY += this.vy * dt;
        if (this.ballY < BALL / 2) {
            this.ballY = BALL - this.ballY;
            this.vy = Math.abs(this.vy);
        } else if (this.ballY > FIELD_H - BALL / 2) {
            this.ballY = 2 * (FIELD_H - BALL / 2) - this.ballY;
            this.vy = -Math.abs(this.vy);
        }
        // Paddle contact: the bounce angle follows where the ball met the paddle.
        for (const i of [0, 1]) {
            const face = i === 0 ? PADDLE_X + PADDLE_W : FIELD_W - PADDLE_X - PADDLE_W;
            const approaching = i === 0 ? this.vx < 0 : this.vx > 0;
            const crossed = i === 0 ? this.ballX - BALL / 2 <= face : this.ballX + BALL / 2 >= face;
            const offset = (this.ballY - this.paddles[i]) / (PADDLE_H / 2 + BALL / 2);
            if (approaching && crossed && Math.abs(offset) <= 1 && Math.abs(this.ballX - face) < 4) {
                const speed = Math.min(MAX_SPEED, Math.hypot(this.vx, this.vy) * 1.06);
                const angle = offset * 1.0;
                this.vx = Math.cos(angle) * speed * (i === 0 ? 1 : -1);
                this.vy = Math.sin(angle) * speed;
                this.ballX = i === 0 ? face + BALL / 2 : face - BALL / 2;
                ev.hit = true;
                this.newAims();
            }
        }
        // A point.
        if (this.ballX < -BALL || this.ballX > FIELD_W + BALL) {
            const scorer = this.ballX < 0 ? 1 : 0;
            this.score[scorer]++;
            ev.point = scorer;
            this.serveTo = scorer === 0 ? 1 : 0;
            this.ballX = FIELD_W / 2;
            this.ballY = FIELD_H / 2;
            this.vx = this.vy = 0;
            this.pause = SERVE_PAUSE;
            if (this.score[scorer] >= WIN) {
                this.games[scorer]++;
                this.lastWinner = scorer;
                ev.game = scorer;
                this.score = [0, 0];
                this.pause = SERVE_PAUSE * 3;
            }
        }
        return ev;
    }
}
