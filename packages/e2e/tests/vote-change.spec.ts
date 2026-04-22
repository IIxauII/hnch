import { test, expect } from './fixtures/app.fixture'
import { ESTIMATING } from './fixtures/helpers'

test.describe('Vote change', () => {
  test('player changes vote before reveal, updated value is shown', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)
    await host.startRound()
    await player.waitForEstimating()

    // Player votes 3 initially
    await player.castVote('3')
    await expect(player.page.locator(ESTIMATING.card('3'))).toHaveClass(/selected/)

    // Player changes to 8
    await player.castVote('8')
    await expect(player.page.locator(ESTIMATING.card('8'))).toHaveClass(/selected/)
    // Original card is deselected
    await expect(player.page.locator(ESTIMATING.card('3'))).not.toHaveClass(/selected/)

    // Host votes and reveals
    await host.castVote('5')
    await host.reveal()

    await player.page.waitForURL(/\/revealed/, { timeout: 10_000 })

    // Revealed votes show the CHANGED value (8), not the original (3)
    await host.expectRevealedVotes(['5', '8'])
    await player.expectRevealedVotes(['5', '8'])
  })
})
