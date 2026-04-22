import { test, expect } from './fixtures/app.fixture'
import { ESTIMATING } from './fixtures/helpers'

test.describe('Timer reveal', () => {
  test('votes auto-reveal when timer expires', async ({ host, player }) => {
    // Increase test timeout to accommodate 30s timer + sync overhead
    test.setTimeout(60_000)

    const code = await host.createSession()

    // Configure timer before anyone joins round
    await host.openSettings()
    await host.changeTimer('30 seconds')
    await host.closeSettings()

    await player.joinSession(code)

    // Start the round — timer begins
    await host.startRound()
    await player.waitForEstimating()

    // Both vote
    await host.castVote('3')
    await player.castVote('5')

    // Timer should be visible on both
    await expect(host.page.locator(ESTIMATING.timer)).toBeVisible()
    await expect(player.page.locator(ESTIMATING.timer)).toBeVisible()

    // Wait for auto-reveal (30s timer + up to 10s sync buffer)
    await host.page.waitForURL('**/revealed', { timeout: 45_000 })
    await player.page.waitForURL('**/revealed', { timeout: 10_000 })

    // Both see the correct votes
    await host.expectRevealedVotes(['3', '5'])
    await player.expectRevealedVotes(['3', '5'])
  })
})
