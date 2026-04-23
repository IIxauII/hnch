import { test, expect } from './fixtures/app.fixture'
import { LOBBY, SETTINGS_SHEET, ESTIMATING } from './fixtures/helpers'

test.describe('Settings', () => {
  test('host changes scale, change propagates to player', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Open session settings (host)
    await host.openSettings()

    // Change scale to T-shirt
    await host.changeScale('T-shirt')

    // Verify scale label updated in settings sheet
    await expect(host.page.locator(SETTINGS_SHEET.scaleValue)).toContainText('T-shirt')

    await host.closeSettings()

    // Verify lobby subtitle reflects changes on both clients
    await expect(host.page.locator(LOBBY.subtitle)).toContainText('T-shirt')

    // Player sees the same changes
    await expect(player.page.locator(LOBBY.subtitle)).toContainText('T-shirt')

    // Start a round and verify T-shirt cards are shown
    await host.startRound()
    await player.waitForEstimating()

    // T-shirt cards visible (spot-check a few)
    await expect(host.page.locator(ESTIMATING.card('XS'))).toBeVisible()
    await expect(host.page.locator(ESTIMATING.card('L'))).toBeVisible()
    await expect(host.page.locator(ESTIMATING.card('XL'))).toBeVisible()

    // Same for player
    await expect(player.page.locator(ESTIMATING.card('XS'))).toBeVisible()
    await expect(player.page.locator(ESTIMATING.card('L'))).toBeVisible()
    await expect(player.page.locator(ESTIMATING.card('XL'))).toBeVisible()
  })
})
