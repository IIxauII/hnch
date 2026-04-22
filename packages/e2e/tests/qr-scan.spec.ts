import { test, expect } from './fixtures/app.fixture'
import { BASE_URL, JOIN, ONBOARDING } from './fixtures/helpers'

test.describe('QR scan button on Join', () => {
  test('Scan QR code button is visible on the Join page', async ({ player }) => {
    // Navigate to home first (handles onboarding), then to join.
    await player.page.goto(`${BASE_URL}/home`)
    await player.page.waitForURL(/\/(home|onboarding)/)
    if (player.page.url().includes('/onboarding')) {
      const input = player.page.locator(ONBOARDING.nameInput).locator('input')
      await input.fill('Player')
      await player.page.locator(ONBOARDING.continueBtn).click()
      await player.page.waitForURL(/\/home/)
    }
    await player.page.goto(`${BASE_URL}/join`)
    await player.page.waitForURL(/\/join/)

    const scanBtn = player.page.locator(JOIN.scanQrBtn)
    await expect(scanBtn).toBeVisible()
  })
})
