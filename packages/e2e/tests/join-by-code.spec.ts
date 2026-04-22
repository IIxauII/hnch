import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

test.describe('Join by code', () => {
  test('player joins a session using the room code', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Both see participant count = 2
    await host.expectParticipantCount(2)
    await player.expectParticipantCount(2)

    // Player does NOT see the Start Round button (host-only control)
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).not.toBeVisible()

    // Host still sees Start Round
    await expect(
      host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible()
  })
})
