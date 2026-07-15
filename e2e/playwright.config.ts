import { defineConfig } from '@playwright/test';

// Where the dev gateway is published. Matches GATEWAY_HTTP_PORT in ../.env
// (ops/e2e.sh exports E2E_BASE_URL from the same source of truth).
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:9088';

export default defineConfig({
    testDir: './tests',
    // A Perspective session is heavyweight to boot; keep a small worker pool so
    // parallel sessions don't starve the gateway (2 GB heap, trial mode).
    workers: 2,
    // One retry in CI: session startup over a cold gateway can be slow once.
    retries: process.env.CI ? 1 : 0,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
});
