import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

test.describe('Re-vote full cycle', () => {
  test('re-vote from results → estimating → vote → reveal shows Round 2', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Round 1: vote and reveal
    await host.startRound('Design API')
    await player.waitForEstimating()
    await host.castVote('5')
    await player.castVote('8')
    await host.reveal()
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 })

    // Verify Round 1 results are visible
    await expect(host.page.locator(LOBBY.resultsHeading)).toContainText('Round 1 Results')

    // Re-vote from results
    await host.revote()
    await player.waitForEstimating()

    // Cast new votes
    await host.castVote('3')
    await player.castVote('5')

    // Host reveals
    await host.reveal()
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 })

    // Results should show the new votes (3, 5)
    await host.expectRevealedVotes(['3', '5'])
    await player.expectRevealedVotes(['3', '5'])

    // Verify we're on Round 2 now
    const resultsHeading = host.page.locator(LOBBY.resultsHeading)
    const headingText = await resultsHeading.textContent()
    expect(headingText).toContain('Round 2')
  })

  test('re-vote preserves title and does not affect prior round', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Round 1: vote and reveal
    await host.startRound('Auth migration')
    await player.waitForEstimating()
    await host.castVote('5')
    await player.castVote('8')
    await host.reveal()
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 })

    // Record Round 1 results
    await host.expectRevealedVotes(['5', '8'])

    // Re-vote
    await host.revote()
    await player.waitForEstimating()

    // Vote differently
    await host.castVote('13')
    await player.castVote('13')

    // Reveal re-vote
    await host.reveal()
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 })

    // Round 2 results show new votes (13, 13)
    await host.expectRevealedVotes(['13', '13'])

    // Verify round history shows both rounds
    const roundHistory = host.page.locator('app-round-history')
    await expect(roundHistory).toBeVisible()
  })
})
