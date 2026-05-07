import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

/**
 * Lobby participants section — Phase 5 (ADR-0040) layout.
 *
 * The accordion was removed in Phase 2 of ADR-0040. Participants are now
 * always visible as flat rows inside a `section.page-section`. These tests
 * cover:
 *   1. Participants visible before any round is started.
 *   2. Participants remain visible after reveal (alongside results pane).
 *   3. The section meta summarises online count correctly.
 */
test.describe('Lobby participants section', () => {
  test('pre-reveal: participants always visible', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)
    await host.expectParticipantCount(2)

    // All participant rows visible — no accordion to expand.
    const rows = host.page.locator(LOBBY.participantItems)
    await expect(rows).toHaveCount(2, { timeout: 5_000 })
    await expect(rows.first()).toBeVisible()
  })

  test('post-reveal: participants remain visible alongside results', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)
    await host.expectParticipantCount(2)

    await host.startRound()
    await player.waitForEstimating()
    await host.castVote('5')
    await player.castVote('5')

    // Unanimous auto-reveal (ADR-0018) navigates everyone back to /lobby.
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 })
    await host.page.locator(LOBBY.resultsSection).waitFor({ state: 'visible' })

    // Participant rows still visible — no collapse on reveal.
    const rows = host.page.locator(LOBBY.participantItems)
    await expect(rows).toHaveCount(2, { timeout: 5_000 })
    await expect(rows.first()).toBeVisible()

    // Results section also visible simultaneously.
    await expect(host.page.locator(LOBBY.resultsSection)).toBeVisible()
  })

  test('participants meta shows online count', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Wait for both peers to appear in the summary.
    // Phase 5: summary is "N online [· M offline [· K viewers]]".
    await expect(host.page.locator(LOBBY.participantCount)).toContainText('2 online', {
      timeout: 10_000,
    })
  })
})
