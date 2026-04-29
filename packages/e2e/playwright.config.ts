import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env['CI']
const CLIENT_PORT = process.env['CLIENT_PORT'] ?? '4200'
const RELAY_PORT = process.env['RELAY_PORT'] ?? '1234'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? 'github' : 'html',
  timeout: 20_000,
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: isCI ? 'on-first-retry' : 'on',
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
