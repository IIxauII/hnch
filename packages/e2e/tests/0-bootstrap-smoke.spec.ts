import { test, expect } from './fixtures/app.fixture'
import { BASE_URL } from './fixtures/helpers'

/**
 * Bootstrap smoke test — first spec alphabetically so it runs first under
 * fullyParallel:false workers:1. With maxFailures:1 in CI, a broken app
 * fails this in ~5s instead of burning the 10-min cap on 72 trailing tests.
 *
 * Catches the class of regressions where bootstrapApplication() rejects
 * (DI cycles, missing providers, inject() after await, throwing initializers)
 * which leave <app-root> empty and starve every selector.
 *
 * The fixture's attachBootstrapGuard already turns NG0203 / "hnch bootstrap
 * failed" console errors into thrown failures — this spec adds the positive
 * assertion: app-root actually rendered Ionic content.
 */
test.describe('Bootstrap smoke', () => {
  test('app boots and renders without errors', async ({ host }) => {
    await host.page.goto(`${BASE_URL}/home`)
    // Either /home or /onboarding is fine — both prove bootstrap completed.
    await host.page.waitForURL(/\/(home|onboarding)/, { timeout: 5_000 })
    // ion-app is rendered by AppComponent only after bootstrap resolves.
    await expect(host.page.locator('app-root ion-app')).toBeVisible({ timeout: 5_000 })
  })
})
