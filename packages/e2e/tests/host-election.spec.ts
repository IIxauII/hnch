import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

test.describe('Host election', () => {
  test('player becomes host after original host disconnects', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Verify host has start round button
    await expect(
      host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible()

    // Verify player does NOT have start round button
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).not.toBeVisible()

    // Host disconnects
    await host.disconnect()

    // After 5s debounce + sync, player should gain host controls
    // Use generous timeout: 5s debounce + network propagation
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible({ timeout: 15_000 })

    // Player should see host star icon next to their own name
    await expect(player.page.locator(LOBBY.hostIcon)).toBeVisible()

    // Disconnected host's row becomes offline (dimmed) — participant stays in
    // the doc list per ADR-0011 but is shown as offline via the .offline class
    await expect(
      player.page.locator(`${LOBBY.participantItems}.offline`),
    ).toHaveCount(1)
  })
})
