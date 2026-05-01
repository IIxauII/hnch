/**
 * Ticket ID sync across clients (Phase 4 § ticketId).
 *
 * Host creates a session, enters a round title AND a ticket URL,
 * submits. Both host and a second client see the ticket URL
 * linkified as an <a> element with target="_blank" and href
 * matching the entered URL.
 */

import { test, expect } from './fixtures/app.fixture'
import { ESTIMATING } from './fixtures/helpers'

test.describe('Ticket ID sync', () => {
  test('host and joiner both see linkified ticket URL on estimating page', async ({
    host,
    player,
  }) => {
    const ticketUrl = 'https://github.com/IIxauII/hnch/issues/59'

    // Host creates session
    const code = await host.createSession()

    // Player joins
    await player.joinSession(code)

    // Host starts round with title and ticket URL
    await host.startRound('Login redesign', ticketUrl)

    // Player auto-navigates to estimating
    await player.waitForEstimating()

    // Both clients on estimating page — verify the link is visible and correct
    const hostLink = host.page.locator(ESTIMATING.ticketLink)
    const playerLink = player.page.locator(ESTIMATING.ticketLink)

    // Host side assertions
    await expect(hostLink).toBeVisible()
    await expect(hostLink).toHaveAttribute('target', '_blank')
    await expect(hostLink).toHaveAttribute('href', ticketUrl)

    // Player side assertions
    await expect(playerLink).toBeVisible()
    await expect(playerLink).toHaveAttribute('target', '_blank')
    await expect(playerLink).toHaveAttribute('href', ticketUrl)
  })
})
