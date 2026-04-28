import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

/**
 * Reload restores session
 *
 * Invariant: after `page.reload()` on `/lobby/:code`, the sessionResumeGuard
 * must reconnect to the same room (open-access path) and land the user back on
 * the same URL with participant state intact. The guard's "connected" outcome
 * must fire before the lobby renders so that no flash-of-home occurs.
 *
 * Ordering: host creates → joiner joins → both confirmed at count=2 → host
 * reloads → guard fires (rejoin via code) → URL and state restored. The join
 * confirmation at count=2 before reload ensures the relay snapshot is stable.
 */
test.describe('Reload restores session', () => {
  test('host reload on /lobby/:code stays on same URL, participant count and scale intact', async ({
    host,
    player,
  }) => {
    // Host creates a session; URL becomes /lobby/:code
    const code = await host.createSession()
    expect(code).toMatch(/^[A-Z0-9]{6}$/i)

    // Capture the canonical URL before reload
    await host.page.waitForURL(/\/lobby\//)
    const urlBefore = host.page.url()
    expect(urlBefore).toMatch(/\/lobby\/[A-Z0-9]+/i)

    // Change scale to Fibonacci so we have a non-default state to assert
    await host.openSettings()
    await host.changeScale('Fibonacci')
    await host.closeSettings()

    // Joiner joins — establishes participant count of 2
    await player.joinSession(code)
    await host.expectParticipantCount(2)
    await player.expectParticipantCount(2)

    // Reload host's page — guard must reconnect via the code in the URL
    await host.page.reload()

    // Guard runs: open room → rejoin → allow. Must land on SAME /lobby/:code URL.
    await host.page.waitForURL(/\/lobby\//, { timeout: 15_000 })
    const urlAfter = host.page.url()
    expect(urlAfter).toBe(urlBefore)

    // Participant count restored (relay snapshot rehydrated)
    await host.expectParticipantCount(2)

    // Scale setting preserved (Fibonacci subtitle)
    await expect(host.page.locator(LOBBY.subtitle)).toContainText('Fibonacci')
  })
})
