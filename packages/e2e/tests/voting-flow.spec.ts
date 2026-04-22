import { test, expect } from './fixtures/app.fixture'
import { ESTIMATING } from './fixtures/helpers'

test.describe('Voting flow', () => {
  test('both clients vote and votes remain hidden', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Host starts round
    await host.startRound()
    await player.waitForEstimating()

    // Both cast votes
    await host.castVote('5')
    await player.castVote('8')

    // Host's selected card is highlighted
    await expect(host.page.locator(ESTIMATING.card('5'))).toHaveClass(/selected/)

    // Player's selected card is highlighted
    await expect(player.page.locator(ESTIMATING.card('8'))).toHaveClass(/selected/)

    // Vote count shows "2 of 2 voted"
    await expect(host.page.locator(ESTIMATING.voteCount)).toContainText('2 of 2')
    await expect(player.page.locator(ESTIMATING.voteCount)).toContainText('2 of 2')

    // Both are still on estimating (not revealed)
    await host.expectVotesHidden()
    await player.expectVotesHidden()
  })
})
