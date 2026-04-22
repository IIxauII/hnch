import { test, expect } from './fixtures/app.fixture'
import { LOBBY } from './fixtures/helpers'

test.describe('Join by code', () => {
  test('player joins a session using the room code', async ({ host, player }) => {
    const code = await host.createSession()
    await player.joinSession(code)

    // Both see participant count = 2
    await host.expectParticipantCount(2)
    await player.expectParticipantCount(2)

    // Both see the Start Round button (currently shown to all participants)
    await expect(
      host.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible()
    await expect(
      player.page.locator('ion-button', { hasText: LOBBY.startRoundBtn }),
    ).toBeVisible()
  })
})
