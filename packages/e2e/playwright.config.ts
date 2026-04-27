import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env['CI']

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? 'github' : 'html',
  timeout: 20_000,
  use: {
    baseURL: 'http://localhost:4200',
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
      port: 1234,
      reuseExistingServer: !isCI,
      env: { HNCH_ROOM_CAP: '3', HNCH_ENABLE_TEST_ROUTES: '1' },
    },
    {
      command: 'pnpm --filter @hnch/client dev',
      port: 4200,
      reuseExistingServer: !isCI,
    },
  ],
})
