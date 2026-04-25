import { test, expect } from './fixtures/app.fixture'
import { LOBBY, ESTIMATING, expectToast } from './fixtures/helpers'

test.describe('Auto-reconnect after transient disconnect', () => {
  test('reconnecting toast appears while host is offline and clears on reconnect', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    await host.page.waitForURL(/\/lobby/)
    await player.page.waitForURL(/\/lobby/)

    // Go offline — simulate transient network drop
    await host.page.context().setOffline(true)

    // Reconnecting toast should appear (docService.reconnecting() fires after
    // hasEverConnected + disconnect, with a 5 s debounce before the chip
    // upgrades to warning. The ion-toast is wired directly to reconnecting().)
    await expectToast(host.page, /reconnecting/i)

    // Come back online
    await host.page.context().setOffline(false)

    // Toast should disappear once reconnected
    await host.page.locator('ion-toast[message="Reconnecting…"]').first().waitFor({ state: 'hidden', timeout: 15_000 })

    // Still on lobby, room code still visible
    await host.page.waitForURL(/\/lobby/)
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible()
  })

  test('after reconnect, session state (participants + scale) is preserved', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    await host.page.waitForURL(/\/lobby/)
    await player.page.waitForURL(/\/lobby/)
    await host.expectParticipantCount(2)

    // Drop network
    await host.page.context().setOffline(true)
    await host.page.waitForTimeout(1_000)

    // Restore network
    await host.page.context().setOffline(false)

    // Wait for reconnect (room code remains visible = sync restored)
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible({ timeout: 15_000 })

    // Session state preserved: both participants still listed
    await host.expectParticipantCount(2)
    // Scale subtitle still shows Fibonacci
    await expect(host.page.locator(LOBBY.subtitle)).toContainText('Fibonacci')
  })

  test('joiner reconnects mid-session via close+rejoin and sees current round', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Host starts a round
    await host.startRound()
    await player.waitForEstimating()

    // Player disconnects (full page close) — no votes cast so unanimous
    // auto-reveal does not fire; round stays active for rejoiner to land on.
    await player.disconnect()

    // Brief pause for relay to process disconnect
    await host.page.waitForTimeout(1_500)

    // Player reconnects using same room code
    await player.reconnect(code)

    // Player should land on /estimating (active round exists)
    await player.page.waitForURL(/\/estimating/, { timeout: 10_000 })

    // Card grid is visible — round state rehydrated
    await expect(player.page.locator(ESTIMATING.cardGrid)).toBeVisible()
  })

  test('host reconnects after going offline and comes back to lobby', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    await host.page.waitForURL(/\/lobby/)
    await player.page.waitForURL(/\/lobby/)

    // Host goes offline briefly
    await host.page.context().setOffline(true)
    await host.page.waitForTimeout(500)
    await host.page.context().setOffline(false)

    // Host stays on lobby and room code is still visible
    await host.page.waitForURL(/\/lobby/, { timeout: 10_000 })
    await expect(host.page.locator(LOBBY.roomCode)).toBeVisible({ timeout: 10_000 })

    // Host still has start-round controls
    await expect(
      host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('reconnecting toast shows during estimating and clears on reconnect', async ({
    host,
    player,
  }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    await host.startRound()
    await player.waitForEstimating()

    // Player goes offline while on estimating
    await player.page.context().setOffline(true)

    await expectToast(player.page, /reconnecting/i)

    // Player comes back online
    await player.page.context().setOffline(false)

    // Toast dismisses
    await player.page.locator('ion-toast[message="Reconnecting…"]').first().waitFor({ state: 'hidden', timeout: 15_000 })

    // Still on estimating, card grid intact
    await player.page.waitForURL(/\/estimating/)
    await expect(player.page.locator(ESTIMATING.cardGrid)).toBeVisible()
  })
})
