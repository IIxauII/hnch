import { test, expect } from './fixtures/app.fixture'
import { REVEALED } from './fixtures/helpers'

test.describe('Manual reveal', () => {
  test('host reveals and both clients see all votes', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)
    await host.startRound()
    await player.waitForEstimating()

    await host.castVote('5')
    await player.castVote('8')

    // Host reveals
    await host.reveal()

    // Player auto-navigates to revealed page
    await player.page.waitForURL('**/revealed', { timeout: 10_000 })

    // Both see the correct votes
    await host.expectRevealedVotes(['5', '8'])
    await player.expectRevealedVotes(['5', '8'])

    // Host sees "Next Round" and "Re-vote" buttons
    await expect(host.page.locator(REVEALED.nextRoundBtn)).toBeVisible()
    await expect(host.page.locator(REVEALED.revoteBtn)).toBeVisible()

    // Player does NOT see host controls
    await expect(player.page.locator(REVEALED.nextRoundBtn)).not.toBeVisible()
    await expect(player.page.locator(REVEALED.revoteBtn)).not.toBeVisible()
  })
})
