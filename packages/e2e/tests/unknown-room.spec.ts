import { test, expect } from './fixtures/app.fixture'
import { BASE_URL, HOME, JOIN, ONBOARDING } from './fixtures/helpers'

test.describe('Unknown room handling', () => {
  test('joining a nonexistent code shows error toast and stays on join page', async ({ player }) => {
    // Navigate to join page
    await player.page.goto(`${BASE_URL}/home`)
    await player.page.waitForURL(/\/(home|onboarding)/)
    if (player.page.url().includes('/onboarding')) {
      await player.onboard()
    }
    await player.page.locator(HOME.joinCard).click()
    await player.page.waitForURL(/\/join/)

    // Enter a valid-format but nonexistent room code
    const input = player.page.locator(JOIN.codeInput).locator('input')
    await input.fill('A2B3C4')
    await player.page.locator(JOIN.joinBtn).click()

    // Expect the "isn't active" toast to appear
    const toast = player.page.locator('ion-toast')
    await toast.waitFor({ state: 'visible', timeout: 5_000 })
    await expect(toast).toContainText("isn't active")

    // Should stay on the join page
    expect(player.page.url()).toContain('/join')
  })
})
