/**
 * Three-client scenarios (ADR-0010).
 *
 * 1. Full round: host + 2 players all vote, auto-reveal fires, all see results.
 * 2. Host election: host drops mid-session, exactly one of the two remaining
 *    players is elected new host (lowest device ID — deterministic but opaque
 *    to the test, so we assert "exactly one" rather than "which one").
 */

import { test, expect } from './fixtures/app.fixture'
import { LOBBY, ESTIMATING } from './fixtures/helpers'

test.describe('Three-client scenarios', () => {
  test('all three participants vote and see results after auto-reveal', async ({
    host,
    player,
    createParticipant,
  }) => {
    const player2 = await createParticipant('Player2')

    const code = await host.createSession()
    await player.joinSession(code)
    await player2.joinSession(code)

    // All three are in the lobby
    await host.expectParticipantCount(3)

    // Host starts the round
    await host.startRound()

    // Joiners navigate to estimating
    await player.waitForEstimating()
    await player2.waitForEstimating()

    // All three cast votes (default Fibonacci scale)
    await host.castVote('3')
    await player.castVote('5')
    await player2.castVote('8')

    // Unanimous auto-reveal fires once all have voted
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 })
    await player.page.waitForURL(/\/lobby/, { timeout: 10_000 })
    await player2.page.waitForURL(/\/lobby/, { timeout: 10_000 })

    // All three see all three votes in results
    await host.expectRevealedVotes(['3', '5', '8'])
    await player.expectRevealedVotes(['3', '5', '8'])
    await player2.expectRevealedVotes(['3', '5', '8'])
  })

  test('host election: after host drops, exactly one remaining player becomes host', async ({
    host,
    player,
    createParticipant,
  }) => {
    test.setTimeout(30_000)
    const player2 = await createParticipant('Player2')

    const code = await host.createSession()
    await player.joinSession(code)
    await player2.joinSession(code)

    // All are in lobby, host has start-round controls
    await host.expectParticipantCount(3)
    await expect(
      host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible()

    // Neither player has host controls yet
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).not.toBeVisible()
    await expect(
      player2.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).not.toBeVisible()

    // Host disconnects (closes page)
    await host.disconnect()

    // After debounce (5s) + sync margin, exactly one of the two remaining
    // players should gain host controls. Election picks the lexicographically-
    // lowest device ID among connected peers (ADR-0010) — deterministic but
    // not externally observable, so we test the invariant not which peer wins.
    const electionTimeout = 15_000

    const player1GainsHost = player.page
      .locator('ion-button', { hasText: LOBBY.startRoundBtn })
      .waitFor({ state: 'visible', timeout: electionTimeout })
      .then(() => true)
      .catch(() => false)

    const player2GainsHost = player2.page
      .locator('ion-button', { hasText: LOBBY.startRoundBtn })
      .waitFor({ state: 'visible', timeout: electionTimeout })
      .then(() => true)
      .catch(() => false)

    const [p1IsHost, p2IsHost] = await Promise.all([player1GainsHost, player2GainsHost])

    // Exactly one of the two should have won the election
    expect(p1IsHost || p2IsHost).toBe(true)
    expect(p1IsHost && p2IsHost).toBe(false)

    // The elected host's page should show the host-icon next to their name
    const newHostPage = p1IsHost ? player.page : player2.page
    await expect(newHostPage.locator(LOBBY.hostIcon)).toBeVisible()

    // The elected host can start a round (proving they have real host authority)
    const newHost = p1IsHost ? player : player2
    const otherPlayer = p1IsHost ? player2 : player
    await newHost.startRound()
    await otherPlayer.waitForEstimating()
    await newHost.page.waitForURL(/\/estimating/)
  })

  test('host election: elected host can reveal votes after original host drops during round', async ({
    host,
    player,
    createParticipant,
  }) => {
    test.setTimeout(30_000)
    const player2 = await createParticipant('Player2')

    const code = await host.createSession()
    await player.joinSession(code)
    await player2.joinSession(code)

    // Start a round while all three are present
    await host.startRound()
    await player.waitForEstimating()
    await player2.waitForEstimating()

    // Only player votes — leaves player2 unvoted so unanimous auto-reveal
    // (ADR-0018) won't fire when the offline host is excluded from the
    // denominator. Otherwise the round would auto-reveal before the
    // elected host gets a chance to manually reveal.
    await player.castVote('3')

    // Host drops mid-round
    await host.disconnect()

    // After election debounce, one of the two remaining players becomes host
    // and sees the Reveal Votes button
    const electionTimeout = 15_000

    const player1HasReveal = player.page
      .locator(ESTIMATING.revealBtn)
      .waitFor({ state: 'visible', timeout: electionTimeout })
      .then(() => true)
      .catch(() => false)

    const player2HasReveal = player2.page
      .locator(ESTIMATING.revealBtn)
      .waitFor({ state: 'visible', timeout: electionTimeout })
      .then(() => true)
      .catch(() => false)

    const [p1HasReveal, p2HasReveal] = await Promise.all([player1HasReveal, player2HasReveal])

    expect(p1HasReveal || p2HasReveal).toBe(true)
    expect(p1HasReveal && p2HasReveal).toBe(false)

    // New host reveals — all remaining clients see results
    const newHost = p1HasReveal ? player : player2
    const otherPlayer = p1HasReveal ? player2 : player
    await newHost.reveal()

    await otherPlayer.page.waitForURL(/\/lobby/, { timeout: 10_000 })

    // Both remaining players see the single vote that was cast
    await newHost.expectRevealedVotes(['3'])
    await otherPlayer.expectRevealedVotes(['3'])
  })
})
