import { test, expect } from './fixtures/app.fixture'
import { BASE_URL, JOIN } from './fixtures/helpers'

test.describe('Password-protected rooms', () => {
  test('joiner must enter correct password to join', async ({ host, player }) => {
    const code = await host.createSession()

    // Host sets a password — wait for the relay PATCH to complete
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Password', 'secret123')
    await patchDone
    await host.closeSettings()

    // Player joins with the correct password
    await player.joinSessionWithPassword(code, 'secret123')

    // Both see each other
    await host.expectParticipantCount(2)
    await player.expectParticipantCount(2)
  })

  test('wrong password shows rejection and stays on join page', async ({ host, player }) => {
    const code = await host.createSession()

    // Host sets a password
    const patchDone = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Password', 'correctpw')
    await patchDone
    await host.closeSettings()

    // Player tries to join with the wrong password
    await player.page.goto(`${BASE_URL}/home`)
    await player.page.waitForURL(/\/(home|onboarding)/)
    if (player.page.url().includes('/onboarding')) {
      await player.onboard()
    }
    await player.page.locator('ion-card:has(strong:text-is("Join Room"))').click()
    await player.page.waitForURL(/\/join/)
    const codeInput = player.page.locator(JOIN.codeInput).locator('input')
    await codeInput.fill(code)
    await player.page.locator(JOIN.joinBtn).click()

    // Wait for password field
    const pwInput = player.page.locator(JOIN.passwordInput).locator('input')
    await pwInput.waitFor({ state: 'visible', timeout: 5_000 })
    await pwInput.fill('wrongpassword')
    await player.page.locator(JOIN.joinBtn).click()

    // Should stay on join page (not navigate to lobby)
    await player.page.waitForTimeout(2000)
    expect(player.page.url()).toContain('/join')
  })

  test('removing password lets joiner in without one', async ({ host, player }) => {
    const code = await host.createSession()

    // Host sets a password
    const setPatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Password', 'temppass')
    await setPatch
    await host.closeSettings()

    // Host removes the password via the UI
    const removePatch = host.page.waitForResponse(
      (res) => res.url().includes('/access') && res.request().method() === 'PATCH',
    )
    await host.openSettings()
    await host.changeAccess('Open')
    await removePatch
    await host.closeSettings()

    // Player joins normally (no password needed)
    await player.joinSession(code)
    await host.expectParticipantCount(2)
    await player.expectParticipantCount(2)
  })
})
