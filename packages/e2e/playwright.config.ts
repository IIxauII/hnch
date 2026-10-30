import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { defineConfig, devices } from '@playwright/test';

// Load .env.local from the monorepo root when present (worktree port isolation).
// Each worktree has a unique CLIENT_PORT / RELAY_PORT set by worktree:bootstrap.
// pnpm exec doesn't auto-load .env files, so we do it here so tests and
// webServer commands use the worktree-specific ports rather than the defaults.
const envLocalPath = path.resolve(__dirname, '../../.env.local');
if (fs.existsSync(envLocalPath)) {
  const raw = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    // Only set if not already set (explicit env overrides .env.local)
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

const isCI = !!process.env['CI'];
const CLIENT_PORT = process.env['CLIENT_PORT'] ?? '4200';
const RELAY_PORT = process.env['RELAY_PORT'] ?? '1234';

// Which client the tests load (#602). `build`: an optimised `ng build
// --configuration e2e` served as static files by scripts/serve-static.mjs,
// so tests run the bundle users get and no dev server or file watcher
// competes with the browsers for CPU. That configuration keeps
// environment.ts, so the relay address still comes from the page's port.
// `dev`: `ng serve`, for local runs that edit the client between runs.
// Default: build in CI, dev locally; E2E_CLIENT overrides either.
const E2E_CLIENT = process.env['E2E_CLIENT'] ?? (isCI ? 'build' : 'dev');
if (E2E_CLIENT !== 'build' && E2E_CLIENT !== 'dev') {
  throw new Error(`E2E_CLIENT must be "build" or "dev", got "${E2E_CLIENT}"`);
}

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  // At most one worker per CPU: a hosted runner has 4 CPUs on a public repo
  // and 2 on a private one, and oversubscribed browsers time out.
  ...(isCI && { workers: Math.min(4, os.availableParallelism()) }),
  // Fail-fast in CI: any single failure aborts the run so a bootstrap
  // crash doesn't burn the 10-min CI cap on 73 trailing tests against a
  // blank page. Local: 0 (Playwright treats 0 as disabled = run
  // everything) so devs see the full failure picture.
  maxFailures: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'html',
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    // CI: a lost click or a URL that never comes fails in seconds with an
    // error naming that call (`locator.click: Timeout 10000ms exceeded`),
    // instead of a bare 45 s test timeout that, with maxFailures: 1, stops
    // the job (#563, #601). Picked from a full CI=1 run: the slowest click
    // took 1.1 s, the slowest goto or URL wait 3 s, the slowest locator
    // wait 5.4 s. A call that legitimately waits longer passes its own
    // `timeout` (as the host-election and reconnect waits do). Local runs
    // keep Playwright's default of no per-call limit.
    ...(isCI && { actionTimeout: 10_000, navigationTimeout: 15_000 }),
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
      // Loopback only: test routes let anyone who can reach the relay delete rooms.
      env: {
        HNCH_ROOM_CAP: '3',
        HNCH_ENABLE_TEST_ROUTES: '1',
        PORT: RELAY_PORT,
        HOST: '127.0.0.1',
      },
    },
    {
      // Build and serve in one command, so the build overlaps the relay
      // starting; the static server only listens once the build is done.
      command:
        E2E_CLIENT === 'build'
          ? 'pnpm --filter @hnch/client run build:e2e && node scripts/serve-static.mjs ../client/dist/e2e'
          : 'pnpm --filter @hnch/client dev',
      // `ng serve` opens the TCP port within ~1s but the bundle compile takes
      // ~15s on cold CI. Using `port:` makes Playwright start tests as soon as
      // the socket is up — the first worker to navigate then eats the entire
      // compile inside its 20s per-test budget and times out. `url:` instead
      // polls HTTP until 2xx, which only happens once webpack-dev-server has
      // finished its first compile. `timeout` extends the wait so cold CI runs
      // don't bail before bundles are ready (or, for `build`, before
      // `ng build` finishes).
      url: `http://localhost:${CLIENT_PORT}/`,
      timeout: 180_000,
      reuseExistingServer: !isCI,
      env: { CLIENT_PORT },
    },
  ],
});
