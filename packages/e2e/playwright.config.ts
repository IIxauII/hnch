import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env['CI'];
const CLIENT_PORT = process.env['CLIENT_PORT'] ?? '4200';
const RELAY_PORT = process.env['RELAY_PORT'] ?? '1234';

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  ...(isCI && { workers: 4 }),
  // Fail-fast in CI: any single failure aborts the run so a bootstrap
  // crash doesn't burn the 10-min CI cap on 73 trailing tests against a
  // blank page. Local: 0 (Playwright treats 0 as disabled = run
  // everything) so devs see the full failure picture.
  maxFailures: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'html',
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: isCI ? 'retain-on-failure' : 'on',
    screenshot: isCI ? 'only-on-failure' : 'on',
    video: isCI ? 'off' : 'on',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @hnch/relay dev',
      port: parseInt(RELAY_PORT, 10),
      reuseExistingServer: !isCI,
      env: { HNCH_ROOM_CAP: '3', HNCH_ENABLE_TEST_ROUTES: '1', PORT: RELAY_PORT },
    },
    {
      command: 'pnpm --filter @hnch/client dev',
      // `ng serve` opens the TCP port within ~1s but the bundle compile takes
      // ~15s on cold CI. Using `port:` makes Playwright start tests as soon as
      // the socket is up — the first worker to navigate then eats the entire
      // compile inside its 20s per-test budget and times out. `url:` instead
      // polls HTTP until 2xx, which only happens once webpack-dev-server has
      // finished its first compile. `timeout` extends the wait so cold CI runs
      // don't bail before bundles are ready.
      url: `http://localhost:${CLIENT_PORT}/`,
      timeout: 180_000,
      reuseExistingServer: !isCI,
      env: { CLIENT_PORT },
    },
  ],
});
