import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env['CI']
const CLIENT_PORT = process.env['CLIENT_PORT'] ?? '4200'
const RELAY_PORT = process.env['RELAY_PORT'] ?? '1234'

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  workers: 1,
  // Run every test even when failures pile up — full picture beats early
  // bail. Bootstrap regressions are caught fast by 0-bootstrap-smoke.spec.ts
  // (sorts first) and the fixture's bootstrap-error guard, so a systemic
  // break still surfaces with a clear message.
  maxFailures: 0,
  reporter: isCI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'html',
  timeout: 20_000,
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
      port: parseInt(CLIENT_PORT, 10),
      reuseExistingServer: !isCI,
      env: { CLIENT_PORT },
    },
  ],
})
