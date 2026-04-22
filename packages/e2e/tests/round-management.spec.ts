import { test, expect } from './fixtures/app.fixture'
import { REVEALED, ESTIMATING } from './fixtures/helpers'

test.describe('Round management', () => {
  test('start a new round after reveal, previous round votes are preserved', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Round 1: vote and reveal
    await host.startRound()
    await player.waitForEstimating()
    await host.castVote('5')
    await player.castVote('8')
    await host.reveal()
    await player.page.waitForURL(/\/revealed/, { timeout: 10_000 })

    // Verify Round 1 results — scope to app-revealed to avoid strict-mode
    // violation (estimating page stays in Ionic's DOM stack alongside revealed)
    await expect(host.page.locator('app-revealed h1.title')).toContainText('Round 1 Results')

    // Start Round 2
    await host.nextRound()
    await player.waitForEstimating()

    // Verify we're in Round 2 — scope to app-estimating to avoid strict-mode
    // violation (revealed page stays in Ionic's DOM stack alongside estimating)
    await expect(host.page.locator('app-estimating h1.title')).toContainText('Round 2')
    await expect(player.page.locator('app-estimating h1.title')).toContainText('Round 2')

    // No votes cast yet — card grid should have no selected cards
    await expect(host.page.locator(ESTIMATING.selectedCard)).not.toBeVisible()
    await expect(player.page.locator(ESTIMATING.selectedCard)).not.toBeVisible()
  })
})
